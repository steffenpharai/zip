#!/usr/bin/env python3
"""Capture frames from the Logitech C615 with YOLO11n-gated keyframe selection.

Pipeline:
  1. Lock C615 v4l2 settings (focus/exposure/WB) so SfM doesn't see drift.
  2. Open /dev/video0 at 1280x720 MJPEG (C615's clean USB-2.0 ceiling).
  3. For each frame:
     - compute Laplacian-variance sharpness score (motion-blur proxy)
     - run YOLO11n detection (reuse ~/perception-lab/detect.py)
     - score = sharpness × (1 + min(n_detections, 5) * 0.15)
                                                   ^ rewards informative frames
  4. Keep top-K per N-second bucket. Default: top-2 per second.
  5. Write selected frames to frames/<scan_id>/frame_NNNNN.jpg
  6. Append per-frame detections to captures/<scan_id>/detections.jsonl:
        {"frame_id": N, "ts": float, "image": "frame_NNNNN.jpg",
         "sharpness": float, "score": float,
         "detections": [{"label","confidence","box":[x,y,w,h]}, ...]}

Usage:
    python capture.py --scan-id room1 --duration 90 --target-fps 2
    python capture.py --scan-id room1 --resume         # continue an existing scan
"""
import argparse
import json
import os
import shutil
import subprocess
import sys
import time
from collections import deque
from pathlib import Path

import cv2
import numpy as np

# Reuse the existing YOLO11n TRT detector from perception-lab — DON'T copy.
PERCEPTION_LAB = Path.home() / "perception-lab"
sys.path.insert(0, str(PERCEPTION_LAB))
from detect import Detector  # noqa: E402

SPLAT_LAB = Path.home() / "splat-lab"
CAPTURES = SPLAT_LAB / "captures"
FRAMES = SPLAT_LAB / "frames"

# C615 v4l2 lockdown values — tuned for indoor lighting; override via CLI if needed.
V4L2_LOCKDOWN = {
    "focus_automatic_continuous": 0,
    "focus_absolute": 80,
    "auto_exposure": 1,                  # 1 = manual mode on UVC
    "exposure_time_absolute": 250,
    "white_balance_automatic": 0,
    "white_balance_temperature": 4500,
    "power_line_frequency": 2,           # 60 Hz US
}


def lock_v4l2(device: str = "/dev/video0", overrides: dict | None = None):
    """Apply v4l2 controls. Returns dict of (control, applied_value)."""
    if not shutil.which("v4l2-ctl"):
        raise RuntimeError("v4l2-ctl not installed (apt install v4l-utils)")
    applied = {}
    settings = {**V4L2_LOCKDOWN, **(overrides or {})}
    for ctrl, val in settings.items():
        r = subprocess.run(["v4l2-ctl", "-d", device, "-c", f"{ctrl}={val}"],
                           capture_output=True, text=True)
        if r.returncode != 0:
            print(f"  WARN: failed to set {ctrl}={val}: {r.stderr.strip()}",
                  file=sys.stderr)
        else:
            applied[ctrl] = val
    return applied


def open_camera(device: str = "/dev/video0", w: int = 1280, h: int = 720,
                fps: int = 30) -> cv2.VideoCapture:
    """Open camera with MJPEG (only sane USB-2.0 path for 1280x720@30 on C615)."""
    # Prefer GStreamer for clean MJPEG; fall back to V4L2 backend.
    gst = (f"v4l2src device={device} ! "
           f"image/jpeg,width={w},height={h},framerate={fps}/1 ! "
           f"jpegdec ! videoconvert ! appsink drop=1 max-buffers=2")
    cap = cv2.VideoCapture(gst, cv2.CAP_GSTREAMER)
    if not cap.isOpened():
        # GStreamer path failed (e.g. no gstreamer support compiled).
        cap = cv2.VideoCapture(device, cv2.CAP_V4L2)
        cap.set(cv2.CAP_PROP_FOURCC, cv2.VideoWriter_fourcc(*"MJPG"))
        cap.set(cv2.CAP_PROP_FRAME_WIDTH, w)
        cap.set(cv2.CAP_PROP_FRAME_HEIGHT, h)
        cap.set(cv2.CAP_PROP_FPS, fps)
        cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
    if not cap.isOpened():
        raise RuntimeError(f"failed to open {device}")
    return cap


def sharpness(bgr: np.ndarray) -> float:
    """Laplacian variance — higher = sharper."""
    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    return float(cv2.Laplacian(gray, cv2.CV_64F).var())


def score_frame(sharp: float, n_detections: int) -> float:
    return sharp * (1.0 + 0.15 * min(n_detections, 5))


def run(args):
    scan_dir = CAPTURES / args.scan_id
    frames_dir = FRAMES / args.scan_id
    scan_dir.mkdir(parents=True, exist_ok=True)
    frames_dir.mkdir(parents=True, exist_ok=True)

    detections_path = scan_dir / "detections.jsonl"
    meta_path = scan_dir / "meta.json"
    # idempotency: count existing selected frames so resume continues numbering
    existing = sorted(frames_dir.glob("frame_*.jpg"))
    start_frame_id = len(existing)
    mode = "a" if args.resume and detections_path.exists() else "w"

    print(f"capture scan_id={args.scan_id}", file=sys.stderr)
    print(f"  scan_dir:  {scan_dir}", file=sys.stderr)
    print(f"  frames:    {frames_dir}", file=sys.stderr)
    print(f"  duration:  {args.duration}s", file=sys.stderr)
    print(f"  target:    {args.target_fps} keyframes/s", file=sys.stderr)
    print(f"  resume:    {args.resume} (start_frame_id={start_frame_id})",
          file=sys.stderr)

    # 1) lock v4l2
    print("locking v4l2 settings on", args.device, file=sys.stderr)
    applied = lock_v4l2(args.device)
    for k, v in applied.items():
        print(f"  {k}={v}", file=sys.stderr)

    # 2) open camera + detector
    det = Detector()
    print(f"detector provider: {det.active_provider}", file=sys.stderr)
    cap = open_camera(args.device, args.width, args.height, args.fps)

    # discard first 10 frames (auto-anything settles)
    for _ in range(10):
        cap.read()

    # WARM UP the detector — first 2-3 TRT inferences trigger kernel autotuning
    # on Jetson and can take 500-1500 ms each. Burn these BEFORE the timing loop
    # so they don't blow our duration budget.
    print("warming up detector (3 inferences)...", file=sys.stderr)
    ok, warm = cap.read()
    if ok:
        for i in range(3):
            t0 = time.monotonic()
            det.detect(warm)
            print(f"  warmup {i}: {(time.monotonic()-t0)*1000:.0f} ms",
                  file=sys.stderr)

    # 3) capture loop — per-second buckets, top-K per bucket
    bucket_size = 1.0 / max(args.target_fps, 1)   # actually: window size
    bucket_window = 1.0   # 1-second sliding window
    keep_per_window = max(1, args.target_fps)

    t_start = time.monotonic()
    frame_id = start_frame_id
    candidates: deque = deque()  # (ts, sharpness, dets, jpg_bytes)
    last_flush = t_start
    total_seen = 0

    with detections_path.open(mode) as logf:
        if mode == "w":
            # write a meta record at the top of the file
            meta = {
                "scan_id": args.scan_id,
                "started_ts": time.time(),
                "device": args.device,
                "v4l2_lockdown": applied,
                "width": args.width, "height": args.height, "fps": args.fps,
                "detector_provider": det.active_provider,
            }
            meta_path.write_text(json.dumps(meta, indent=2))

        try:
            while True:
                now = time.monotonic()
                if now - t_start > args.duration:
                    break
                ok, frame = cap.read()
                if not ok:
                    print("WARN: cap.read() failed", file=sys.stderr)
                    time.sleep(0.05)
                    continue
                total_seen += 1
                sharp = sharpness(frame)
                dets = det.detect(frame)
                s = score_frame(sharp, len(dets))
                # JPEG-encode now so we can shortlist without holding raw bytes
                ok, jpg = cv2.imencode(".jpg", frame,
                                       [cv2.IMWRITE_JPEG_QUALITY, 92])
                if not ok:
                    continue
                candidates.append((now, sharp, s, dets, bytes(jpg)))

                # flush window
                if now - last_flush >= bucket_window:
                    candidates.append((now + 1e-9, 0.0, -1.0, [], b""))  # sentinel
                    window = []
                    while candidates:
                        ts, sh, sc, ds, jb = candidates.popleft()
                        if sc < 0:
                            break
                        window.append((ts, sh, sc, ds, jb))
                    # keep top-K by score in this window
                    window.sort(key=lambda r: r[2], reverse=True)
                    for ts, sh, sc, ds, jb in window[:keep_per_window]:
                        name = f"frame_{frame_id:05d}.jpg"
                        (frames_dir / name).write_bytes(jb)
                        record = {
                            "frame_id": frame_id,
                            "ts": ts - t_start,
                            "image": name,
                            "sharpness": sh,
                            "score": sc,
                            "detections": [
                                {"label": d["label"],
                                 "confidence": float(d["confidence"]),
                                 "box": [float(x) for x in d["box"]]}
                                for d in ds
                            ],
                        }
                        logf.write(json.dumps(record) + "\n")
                        frame_id += 1
                    logf.flush()
                    last_flush = now
                    print(
                        f"  t={now-t_start:5.1f}s  seen={total_seen:4d}  "
                        f"kept={frame_id-start_frame_id:4d}  "
                        f"window_top_score={window[0][2]:.0f}"
                        if window else "  (empty window)",
                        file=sys.stderr,
                    )
        finally:
            cap.release()

        # FINAL FLUSH: drain any candidates still in the deque so a short
        # capture (<1 bucket window) doesn't return 0 frames.
        if candidates:
            window = sorted(candidates, key=lambda r: r[2], reverse=True)
            for ts, sh, sc, ds, jb in window[:max(keep_per_window, 1)]:
                if sc < 0:    # skip sentinel
                    continue
                name = f"frame_{frame_id:05d}.jpg"
                (frames_dir / name).write_bytes(jb)
                record = {
                    "frame_id": frame_id,
                    "ts": ts - t_start,
                    "image": name,
                    "sharpness": sh,
                    "score": sc,
                    "detections": [
                        {"label": d["label"],
                         "confidence": float(d["confidence"]),
                         "box": [float(x) for x in d["box"]]}
                        for d in ds
                    ],
                }
                logf.write(json.dumps(record) + "\n")
                frame_id += 1
            logf.flush()

    print(f"\nDONE: kept {frame_id - start_frame_id} frames "
          f"({frame_id} total) seen={total_seen} in {frames_dir}",
          file=sys.stderr)
    return 0


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--scan-id", required=True, help="output dir name")
    p.add_argument("--device", default="/dev/video0")
    p.add_argument("--duration", type=int, default=90, help="seconds")
    p.add_argument("--width", type=int, default=1280)
    p.add_argument("--height", type=int, default=720)
    p.add_argument("--fps", type=int, default=30, help="capture fps (not keyframe rate)")
    p.add_argument("--target-fps", type=int, default=2,
                   help="keyframes per second to retain")
    p.add_argument("--resume", action="store_true",
                   help="continue numbering from existing frames in scan dir")
    args = p.parse_args()
    sys.exit(run(args))


if __name__ == "__main__":
    main()
