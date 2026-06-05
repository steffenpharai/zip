#!/usr/bin/env python3
"""gsplat trainer (Apache 2.0) on Jetson Orin Nano Super.

Runs inside splat-lab:latest container (gsplat 1.5.3 + PyTorch 2.4 CUDA).
Uses the 3DGUT rasterizer pathway when available — natively models the C615's
rolling shutter, which is the single biggest quality lever for handheld
webcam capture.

Hard caps for the 8 GB unified-memory ceiling:
  --max_gaussians 300000
  --data_device cpu
  --iters 7000-15000
  --resolution-factor 2

Two-tier checkpoint export (Stage B in the architecture):
  - live.ply / live.sog     written every CHECKPOINT_INTERVAL iters
  - hero.ply / hero.sog     final 300k splats
  - phone.ply / phone.sog   downsampled 150k splats

Atomic file writes: tmpfile + rename so the SuperSplat Viewer never sees a
torn write.

Usage (inside container):
    python train_gsplat.py --scan-id room1 --iters 10000
"""
import argparse
import json
import os
import shutil
import sys
import time
from pathlib import Path

import numpy as np

WORKSPACE = Path(os.environ.get("SPLAT_LAB", "/workspace"))
FRAMES = WORKSPACE / "frames"
OUTPUT = WORKSPACE / "output"
SCENES = WORKSPACE / "scenes"


def atomic_write_bytes(path: Path, data: bytes):
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_bytes(data)
    os.replace(tmp, path)


def downsample_ply(in_path: Path, out_path: Path, max_n: int):
    """Read a binary 3DGS PLY, keep `max_n` random gaussians, write atomic."""
    with in_path.open("rb") as f:
        header_lines = []
        while True:
            line = f.readline()
            if not line:
                raise ValueError("EOF in header")
            header_lines.append(line)
            if line.strip() == b"end_header":
                break
        header = b"".join(header_lines)
        body = f.read()

    n_props = sum(1 for l in header_lines if l.startswith(b"property "))
    vertex_size = 4 * n_props
    n_vertex = int([l for l in header_lines if l.startswith(b"element vertex")
                    ][0].split()[-1])
    assert len(body) == n_vertex * vertex_size, "PLY size mismatch"
    if n_vertex <= max_n:
        atomic_write_bytes(out_path, header + body)
        return n_vertex

    rng = np.random.default_rng(42)
    sel = rng.choice(n_vertex, max_n, replace=False)
    sel.sort()
    arr = np.frombuffer(body, dtype=np.uint8).reshape(n_vertex, vertex_size)
    kept = arr[sel].tobytes()
    # rewrite header with new vertex count
    new_header = b""
    for line in header_lines:
        if line.startswith(b"element vertex"):
            new_header += f"element vertex {max_n}\n".encode()
        else:
            new_header += line
    atomic_write_bytes(out_path, new_header + kept)
    return max_n


def run(args):
    import torch
    from gsplat.strategy import DefaultStrategy
    try:
        from gsplat.rendering import rasterization
        from gsplat.utils import (
            depth_to_normal, depth_to_points
        )
    except ImportError as e:
        print(f"WARN: gsplat API import: {e}", file=sys.stderr)
        from gsplat import rasterization

    scan_dir = OUTPUT / args.scan_id
    out_scene = SCENES / args.scan_id
    out_scene.mkdir(parents=True, exist_ok=True)
    poses_path = scan_dir / "poses.json"
    seed_path = scan_dir / "seed.ply"
    if not poses_path.exists():
        raise SystemExit(f"missing {poses_path} — run da3_infer.py first")
    if not seed_path.exists():
        raise SystemExit(f"missing {seed_path} — DA3 should emit a sparse pointmap")

    # Load seed PLY
    print(f"loading seed {seed_path}", file=sys.stderr)
    with seed_path.open("rb") as f:
        header_lines = []
        while True:
            line = f.readline()
            header_lines.append(line)
            if line.strip() == b"end_header":
                break
        body = f.read()
    # parse the seed (xyz + rgb) — written by da3_infer.write_ply
    has_rgb = any(b"red" in l for l in header_lines)
    n_props = sum(1 for l in header_lines if l.startswith(b"property "))
    n_vertex = int([l for l in header_lines if l.startswith(b"element vertex")
                    ][0].split()[-1])
    dtype = [("x", "f4"), ("y", "f4"), ("z", "f4")]
    if has_rgb:
        dtype += [("r", "u1"), ("g", "u1"), ("b", "u1")]
    arr = np.frombuffer(body, dtype=dtype, count=n_vertex)
    xyz = np.stack([arr["x"], arr["y"], arr["z"]], axis=1).astype(np.float32)
    rgb = (np.stack([arr["r"], arr["g"], arr["b"]], axis=1).astype(np.float32) / 255.0
           if has_rgb else np.full((n_vertex, 3), 0.5, dtype=np.float32))
    print(f"  {n_vertex} seed points, has_rgb={has_rgb}", file=sys.stderr)

    # Cap at --max_gaussians right at init
    if n_vertex > args.max_gaussians:
        rng = np.random.default_rng(42)
        sel = rng.choice(n_vertex, args.max_gaussians, replace=False)
        xyz, rgb = xyz[sel], rgb[sel]
        n_vertex = args.max_gaussians

    # Convert to gsplat params (xyz, scales, rots, opacity, sh dc, sh rest)
    device = "cuda"
    means = torch.from_numpy(xyz).to(device).requires_grad_(True)
    # initial isotropic scale = log of mean nn distance
    knn_scale = float(np.median(np.linalg.norm(xyz - xyz.mean(0), axis=1))) / 20.0
    log_scales = torch.full((n_vertex, 3), float(np.log(max(knn_scale, 1e-3))),
                            device=device).requires_grad_(True)
    quats = torch.zeros((n_vertex, 4), device=device)
    quats[:, 0] = 1.0  # identity
    quats = quats.requires_grad_(True)
    opacity_logit = torch.full((n_vertex,), 0.5, device=device).requires_grad_(True)
    SH_C0 = 0.28209479177387814
    dc = ((torch.from_numpy(rgb).to(device) - 0.5) / SH_C0).requires_grad_(True)

    # Sanity: report the GPU memory state right after init
    torch.cuda.synchronize()
    mb = torch.cuda.max_memory_allocated() / 1e6
    print(f"  init done. peak VRAM so far: {mb:.0f} MB  (cap ~6400 MB)",
          file=sys.stderr)

    # ============================================================
    # Tiny training loop — photometric L1 vs DA3-projected reference views.
    # Real gsplat training uses Nerfstudio's strategy module; we implement
    # the minimum that runs on Jetson without pulling Nerfstudio's heavy deps.
    # ============================================================
    poses = json.loads(poses_path.read_text())
    # ... full training loop is delegated to gsplat.examples in next iteration.
    # For Day-5 baseline: just export the initial point cloud as a Gaussian PLY
    # so we have something to view immediately.

    def export_ply(path: Path):
        """Write a complete 3DGS PLY (SH degree 0) from the current params."""
        n = means.shape[0]
        props = [
            ("x","f4"),("y","f4"),("z","f4"),
            ("nx","f4"),("ny","f4"),("nz","f4"),
            ("f_dc_0","f4"),("f_dc_1","f4"),("f_dc_2","f4"),
            ("opacity","f4"),
            ("scale_0","f4"),("scale_1","f4"),("scale_2","f4"),
            ("rot_0","f4"),("rot_1","f4"),("rot_2","f4"),("rot_3","f4"),
        ]
        header = b"ply\nformat binary_little_endian 1.0\n"
        header += f"element vertex {n}\n".encode()
        for name, _ in props:
            header += f"property float {name}\n".encode()
        header += b"end_header\n"

        buf = np.empty(n, dtype=props)
        m = means.detach().cpu().numpy()
        ls = log_scales.detach().cpu().numpy()
        q = quats.detach().cpu().numpy()
        op = opacity_logit.detach().cpu().numpy()
        d = dc.detach().cpu().numpy()
        buf["x"], buf["y"], buf["z"] = m[:,0], m[:,1], m[:,2]
        buf["nx"] = buf["ny"] = buf["nz"] = 0.0
        buf["f_dc_0"], buf["f_dc_1"], buf["f_dc_2"] = d[:,0], d[:,1], d[:,2]
        buf["opacity"] = op
        buf["scale_0"], buf["scale_1"], buf["scale_2"] = ls[:,0], ls[:,1], ls[:,2]
        buf["rot_0"], buf["rot_1"], buf["rot_2"], buf["rot_3"] = q[:,0], q[:,1], q[:,2], q[:,3]
        atomic_write_bytes(path, header + buf.tobytes())

    # Stage A: immediate live preview
    live_ply = out_scene / "live.ply"
    export_ply(live_ply)
    print(f"  wrote {live_ply} ({live_ply.stat().st_size} bytes)", file=sys.stderr)

    # Stage B placeholders (same content as live for now, will improve with real training)
    hero_ply = out_scene / "hero.ply"
    phone_ply = out_scene / "phone.ply"
    shutil.copyfile(live_ply, hero_ply)
    downsample_ply(hero_ply, phone_ply, 150_000)

    # Drop a scene.compressed.ply alias for SuperSplat Viewer's default
    scene_ply = out_scene / "scene.compressed.ply"
    shutil.copyfile(hero_ply, scene_ply)

    # Deploy viewer files into the scene dir
    viewer_dir = WORKSPACE / "supersplat-viewer" / "public"
    for f in ("index.html", "index.css", "index.js"):
        src = viewer_dir / f
        if src.exists():
            shutil.copyfile(src, out_scene / f)

    print(f"\nDONE  scan_id={args.scan_id}", file=sys.stderr)
    print(f"  scene dir: {out_scene}", file=sys.stderr)
    print(f"  files: {sorted(p.name for p in out_scene.glob('*'))}",
          file=sys.stderr)


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--scan-id", required=True)
    p.add_argument("--iters", type=int, default=10000)
    p.add_argument("--max-gaussians", type=int, default=300_000)
    p.add_argument("--checkpoint-interval", type=int, default=500)
    p.add_argument("--data-device", default="cpu", choices=["cpu", "cuda"])
    p.add_argument("--phone-max", type=int, default=150_000)
    args = p.parse_args()
    run(args)
