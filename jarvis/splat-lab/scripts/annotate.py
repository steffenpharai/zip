#!/usr/bin/env python3
"""Auto-annotate the SuperSplat walkthrough using YOLO11n detections.

Pipeline (novel combination — nobody has shipped this publicly):
  1. capture.py wrote detections.jsonl: per-frame YOLO11n bboxes in C615 pixels
  2. bake.py wrote poses.json with DA3 per-view intrinsics+extrinsics + depth.npy
  3. For each YOLO detection whose source frame DA3 processed:
       - scale bbox center from C615 (1280x720) → DA3 processed res (504x280)
       - look up depth at that pixel
       - unproject (u,v,d) → camera coords via inv(K)
       - apply extrinsics [R|t] → world coords
  4. DBSCAN cluster all world-space detections per class
  5. Emit at most 25 hotspots (SuperSplat cap) into settings.json
  6. Each hotspot has a camera viewpoint set ~1m in front of it for click-to-fly

Reads:
  output/<scan_id>/poses.json
  output/<scan_id>/depth.npy
  captures/<scan_id>/detections.jsonl

Writes:
  scenes/<scan_id>/settings.json   — full SuperSplat v2 schema with annotations
  scenes/<scan_id>/hotspots.json   — raw clusters for debugging

Runs on the HOST (no container needed — only needs numpy + scikit-learn).
"""
import argparse
import json
import os
import sys
from collections import defaultdict
from pathlib import Path

import numpy as np


def dbscan(points: np.ndarray, eps: float, min_samples: int = 1) -> np.ndarray:
    """Minimal DBSCAN — fine for our few-hundred-point datasets.
    Returns cluster labels (-1 for noise)."""
    n = points.shape[0]
    labels = np.full(n, -1, dtype=int)
    visited = np.zeros(n, dtype=bool)
    cid = 0
    # pairwise distance matrix (n is small)
    diffs = points[:, None, :] - points[None, :, :]
    d2 = np.sum(diffs * diffs, axis=-1)
    eps2 = eps * eps
    neighbors_of = [np.flatnonzero(d2[i] <= eps2) for i in range(n)]
    for i in range(n):
        if visited[i]:
            continue
        visited[i] = True
        nbrs = list(neighbors_of[i])
        if len(nbrs) < min_samples:
            continue
        labels[i] = cid
        # expand cluster
        j = 0
        while j < len(nbrs):
            k = nbrs[j]
            if not visited[k]:
                visited[k] = True
                kn = neighbors_of[k]
                if len(kn) >= min_samples:
                    for x in kn:
                        if x not in nbrs:
                            nbrs.append(x)
            if labels[k] == -1:
                labels[k] = cid
            j += 1
        cid += 1
    return labels

WORKSPACE = Path(os.environ.get("SPLAT_LAB", str(Path.home() / "splat-lab")))


def load_detections(path: Path) -> list[dict]:
    out = []
    with path.open() as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            out.append(json.loads(line))
    return out


def unproject(uv: tuple[float, float], depth: float,
              K: np.ndarray, Rt: np.ndarray) -> np.ndarray:
    """Pixel + depth → world XYZ (camera-to-world convention)."""
    u, v = uv
    fx, fy = float(K[0, 0]), float(K[1, 1])
    cx, cy = float(K[0, 2]), float(K[1, 2])
    z = float(depth)
    x = (u - cx) * z / fx
    y = (v - cy) * z / fy
    cam = np.array([x, y, z], dtype=np.float32)
    R = Rt[:, :3]
    t = Rt[:, 3]
    world = R @ cam + t
    # OpenCV → PlayCanvas (Y-up). Same convention as bake.py — flip Y and Z.
    world[1] *= -1.0
    world[2] *= -1.0
    return world


def cluster_detections(points_by_class: dict, eps: float = 0.3,
                       min_samples: int = 1) -> list[dict]:
    """DBSCAN per class. Returns clusters: [{label, n, world_xyz, sample_frames}]."""
    clusters = []
    for label, rows in points_by_class.items():
        pts = np.array([r["xyz"] for r in rows], dtype=np.float32)
        if pts.shape[0] == 0:
            continue
        labels = dbscan(pts, eps=eps, min_samples=min_samples)
        for cid in sorted(set(int(x) for x in labels)):
            if cid == -1:
                continue
            mask = labels == cid
            cluster_pts = pts[mask]
            cluster_rows = [r for r, m in zip(rows, mask) if m]
            centroid = cluster_pts.mean(axis=0).tolist()
            avg_conf = float(np.mean([r["conf"] for r in cluster_rows]))
            sample_frames = sorted({r["frame"] for r in cluster_rows})[:5]
            clusters.append({
                "label": label,
                "n_detections": int(mask.sum()),
                "avg_conf": avg_conf,
                "world_xyz": [float(x) for x in centroid],
                "sample_frames": sample_frames,
            })
    # rank by detections × conf
    clusters.sort(key=lambda c: c["n_detections"] * c["avg_conf"], reverse=True)
    return clusters


def build_annotations(clusters: list[dict], camera_lookat_distance: float = 1.0,
                       max_hotspots: int = 25) -> list[dict]:
    """Build the annotations array for SuperSplat v2 settings.json."""
    annotations = []
    for c in clusters[:max_hotspots]:
        pos = c["world_xyz"]
        # camera viewpoint: 1m back-and-above from the target
        cam_pos = [pos[0] + camera_lookat_distance,
                   pos[1] + camera_lookat_distance * 0.3,
                   pos[2] + camera_lookat_distance]
        annotations.append({
            "position": pos,
            "title": c["label"],
            "text": (f"{c['n_detections']}× detection"
                     f" (avg conf {c['avg_conf']:.2f})\n"
                     f"frames: {', '.join(map(str, c['sample_frames']))}"),
            "camera": {
                "initial": {
                    "position": cam_pos,
                    "target": pos,
                    "fov": 60,
                }
            },
            "extras": {
                "n_detections": c["n_detections"],
                "avg_conf": c["avg_conf"],
                "sample_frames": c["sample_frames"],
                "auto_generated_by": "splat-lab.annotate",
            },
        })
    return annotations


def run(args):
    scan = args.scan_id
    captures = WORKSPACE / "captures" / scan
    out_dir = WORKSPACE / "output" / scan
    scene_dir = WORKSPACE / "scenes" / scan

    poses_path = out_dir / "poses.json"
    depth_path = out_dir / "depth.npy"
    dets_path = captures / "detections.jsonl"
    for p in (poses_path, depth_path, dets_path):
        if not p.exists():
            sys.exit(f"missing {p}")

    poses = json.loads(poses_path.read_text())
    depth = np.load(depth_path)                # (V, H, W)
    K_all = np.array(poses["intrinsics"], dtype=np.float32)   # (V, 3, 3)
    Rt_all = np.array(poses["extrinsics"], dtype=np.float32)  # (V, 3, 4)
    Hd, Wd = poses["H"], poses["W"]
    frame_paths = poses["frame_paths"]
    # frame_basename → view index
    frame_to_view = {Path(p).name: i for i, p in enumerate(frame_paths)}

    # detections.jsonl entries
    dets = load_detections(dets_path)
    # build per-frame index
    dets_by_frame = defaultdict(list)
    for d in dets:
        dets_by_frame[d["image"]].append(d)

    # capture meta tells us the source C615 frame size
    meta_path = captures / "meta.json"
    meta = json.loads(meta_path.read_text())
    src_W = int(meta["width"])
    src_H = int(meta["height"])
    scale_x = Wd / src_W
    scale_y = Hd / src_H
    print(f"DA3 processed res: {Wd}x{Hd}  capture res: {src_W}x{src_H}  "
          f"scale: ({scale_x:.3f}, {scale_y:.3f})", flush=True)
    print(f"views with poses: {len(frame_paths)}", flush=True)
    print(f"detection frames: {len(dets_by_frame)}", flush=True)

    points_by_class = defaultdict(list)
    n_used = 0
    for frame_name, view_idx in frame_to_view.items():
        records = dets_by_frame.get(frame_name, [])
        if not records:
            continue
        K = K_all[view_idx]
        Rt = Rt_all[view_idx]
        Z = depth[view_idx]
        for record in records:
            for det in record["detections"]:
                if det["confidence"] < args.min_conf:
                    continue
                x, y, w, h = det["box"]
                # bbox center in C615 pixels
                cx_src = x + w / 2
                cy_src = y + h / 2
                # scale to DA3 processed image
                u = cx_src * scale_x
                v = cy_src * scale_y
                ui = int(round(np.clip(u, 0, Wd - 1)))
                vi = int(round(np.clip(v, 0, Hd - 1)))
                d = float(Z[vi, ui])
                if d <= 0 or not np.isfinite(d):
                    continue
                world = unproject((u, v), d, K, Rt)
                if not np.all(np.isfinite(world)):
                    continue
                points_by_class[det["label"]].append({
                    "frame": record["frame_id"],
                    "conf": float(det["confidence"]),
                    "xyz": world.tolist(),
                    "depth": d,
                    "uv_src": [cx_src, cy_src],
                })
                n_used += 1

    print(f"projected {n_used} detections from {len(frame_to_view)} views",
          flush=True)
    for label, rows in sorted(points_by_class.items(),
                               key=lambda kv: -len(kv[1])):
        print(f"  {label:20s} {len(rows):4d}", flush=True)

    clusters = cluster_detections(points_by_class,
                                   eps=args.cluster_eps,
                                   min_samples=args.min_samples)
    print(f"\n{len(clusters)} clusters (will keep top {args.max_hotspots}):",
          flush=True)
    for c in clusters[:10]:
        print(f"  {c['label']:20s} n={c['n_detections']:3d} "
              f"avg_conf={c['avg_conf']:.2f}  "
              f"xyz=({c['world_xyz'][0]:+.2f},{c['world_xyz'][1]:+.2f},"
              f"{c['world_xyz'][2]:+.2f})", flush=True)

    scene_dir.mkdir(parents=True, exist_ok=True)

    # PRESERVE bake.py's settings (camera, background, post-FX) and only
    # inject the annotations array. Read existing settings.json if present,
    # otherwise fall back to a defaults skeleton.
    settings_path = scene_dir / "settings.json"
    if settings_path.exists():
        settings = json.loads(settings_path.read_text())
    else:
        settings = {
            "version": 2, "tonemapping": "neutral",
            "highPrecisionRendering": False,
            "background": {"color": [0.05, 0.05, 0.08]},
            "postEffectSettings": {
                "sharpness": {"enabled": True, "amount": 0.35},
                "bloom":     {"enabled": False, "intensity": 1, "blurLevel": 2},
                "grading":   {"enabled": True, "brightness": 0,
                              "contrast": 1.05, "saturation": 1.05,
                              "tint": [1, 1, 1]},
                "vignette":  {"enabled": True, "intensity": 0.3,
                              "inner": 0.4, "outer": 0.9, "curvature": 1},
                "fringing":  {"enabled": False, "intensity": 0.5},
            },
            "animTracks": [], "cameras": [],
            "annotations": [], "startMode": "default",
        }
    settings["annotations"] = build_annotations(
        clusters, max_hotspots=args.max_hotspots)

    tmp = settings_path.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(settings, indent=2))
    os.replace(tmp, settings_path)

    (scene_dir / "hotspots.json").write_text(json.dumps(clusters, indent=2))
    print(f"\nwrote {settings_path} ({len(settings['annotations'])} annotations, "
          f"preserved {len(settings.get('cameras', []))} cameras from bake)",
          flush=True)


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--scan-id", required=True)
    p.add_argument("--min-conf", type=float, default=0.35)
    p.add_argument("--cluster-eps", type=float, default=0.3,
                   help="DBSCAN ε in meters (DA3 metric scale)")
    p.add_argument("--min-samples", type=int, default=1)
    p.add_argument("--max-hotspots", type=int, default=25,
                   help="SuperSplat hotspot cap")
    args = p.parse_args()
    run(args)
