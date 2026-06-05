#!/usr/bin/env python3
"""Live C615 → YOLO11n + DAv2 Small depth → multipart MJPEG streams.

Endpoints (all on :8092):
  /stream      RGB MJPEG with YOLO11n bbox overlay (~13 FPS)
  /depth       DAv2 Small inverse-depth INFERNO colormap MJPEG (~7 FPS)
  /raw         RGB MJPEG no overlay
  /detections  per-frame YOLO JSON
  /health      {fps, depth_fps, frames, uptime_s, ...}
  /tegrastats  most-recent tegrastats line for the perf widget

Models reused in-place from sibling labs:
  ~/perception-lab/detect.py     — YOLO11n TRT FP16
  ~/depth-lab/depth.py           — DepthAnything V2 Small ONNX/CUDA
"""
import argparse
import asyncio
import json
import os
import re
import subprocess
import sys
import time
from collections import deque
from pathlib import Path

import cv2
import numpy as np
from aiohttp import web

PERCEPTION = Path.home() / "perception-lab"
DEPTH_LAB = Path.home() / "depth-lab"
SPLAT_LAB = Path(os.environ.get("SPLAT_LAB", str(Path.home() / "splat-lab")))
SCENES_DIR = SPLAT_LAB / "scenes"
sys.path.insert(0, str(PERCEPTION))
sys.path.insert(0, str(DEPTH_LAB))
from detect import Detector                     # noqa: E402
from depth import DepthEstimator                # noqa: E402

V4L2_LOCK = {
    "focus_automatic_continuous": 0,
    "focus_absolute": 80,
    "auto_exposure": 1,
    "exposure_time_absolute": 250,
    "white_balance_automatic": 0,
    "white_balance_temperature": 4500,
    "power_line_frequency": 2,
}


def lock_v4l2(device: str):
    for k, v in V4L2_LOCK.items():
        subprocess.run(["v4l2-ctl", "-d", device, "-c", f"{k}={v}"],
                       capture_output=True)


def open_camera(device: str, w: int, h: int, fps: int) -> cv2.VideoCapture:
    gst = (f"v4l2src device={device} ! image/jpeg,width={w},height={h},"
           f"framerate={fps}/1 ! jpegdec ! videoconvert ! appsink "
           f"drop=1 max-buffers=2")
    cap = cv2.VideoCapture(gst, cv2.CAP_GSTREAMER)
    if not cap.isOpened():
        cap = cv2.VideoCapture(device, cv2.CAP_V4L2)
        cap.set(cv2.CAP_PROP_FOURCC, cv2.VideoWriter_fourcc(*"MJPG"))
        cap.set(cv2.CAP_PROP_FRAME_WIDTH, w)
        cap.set(cv2.CAP_PROP_FRAME_HEIGHT, h)
        cap.set(cv2.CAP_PROP_FPS, fps)
    if not cap.isOpened():
        raise RuntimeError(f"failed to open {device}")
    return cap


# tiny COCO label palette (BGR, openCV order)
PALETTE = {
    "person":    (107, 107, 255), "chair":   (240, 192, 122), "bottle":  (122, 196, 240),
    "tv":        (240, 122, 192), "laptop":  (122, 240, 192), "keyboard":(192, 240, 122),
    "mouse":     (240, 122, 122), "cup":     (192, 122, 240), "book":    (160, 160, 160),
    "cell phone":(122, 122, 240),
}
def color_for(label: str):
    if label in PALETTE: return PALETTE[label]
    h = hash(label) & 0xFFFFFF
    return ((h >> 16) & 0xFF, (h >> 8) & 0xFF, h & 0xFF)


class State:
    def __init__(self):
        self.jpg_overlay: bytes = b""
        self.jpg_raw: bytes = b""
        self.jpg_depth: bytes = b""
        self.detections: list = []
        self.frame_id = 0
        self.depth_frame_id = 0
        self.fps_rgb = 0.0
        self.fps_depth = 0.0
        self.depth_range = (0.0, 0.0)
        self.started = time.monotonic()
        self.tegrastats = ""
        self.cond_rgb = asyncio.Condition()
        self.cond_depth = asyncio.Condition()


# ─────────────────────────────────────────────────────────────────────────
#  RGB+YOLO loop  (full 30 FPS aspiration; realistic ~13)
# ─────────────────────────────────────────────────────────────────────────
async def rgb_loop(state: State, device: str, w: int, h: int, fps: int):
    loop = asyncio.get_event_loop()
    lock_v4l2(device)
    cap = open_camera(device, w, h, fps)
    det = Detector()
    print(f"YOLO11n provider: {det.active_provider}", file=sys.stderr, flush=True)
    for _ in range(5):
        cap.read()
    ema = 0.0
    last = time.monotonic()
    try:
        while True:
            ok, frame = await loop.run_in_executor(None, cap.read)
            if not ok:
                await asyncio.sleep(0.01); continue
            now = time.monotonic()
            ema = 0.9 * ema + 0.1 * (1.0 / max(now - last, 1e-3))
            last = now
            dets = await loop.run_in_executor(None, det.detect, frame)
            # share the raw frame to the depth loop via the state
            state._latest_raw_bgr = frame

            overlay = frame.copy()
            for d in dets:
                x, y, ww, hh = [int(v) for v in d["box"]]
                col = color_for(d["label"])
                cv2.rectangle(overlay, (x, y), (x + ww, y + hh), col, 2)
                lbl = f"{d['label']} {d['confidence']:.2f}"
                tw, th = cv2.getTextSize(lbl, cv2.FONT_HERSHEY_SIMPLEX, 0.5, 1)[0]
                cv2.rectangle(overlay, (x, y - th - 6), (x + tw + 6, y), col, -1)
                cv2.putText(overlay, lbl, (x + 3, y - 4),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1,
                            cv2.LINE_AA)
            hud = f"C615 1280x720  YOLO11n {ema:.1f} FPS  dets {len(dets)}  frame {state.frame_id}"
            cv2.rectangle(overlay, (8, 8), (8 + 10 + 8 * len(hud), 32),
                          (0, 0, 0), -1)
            cv2.putText(overlay, hud, (16, 26), cv2.FONT_HERSHEY_SIMPLEX,
                        0.55, (255, 255, 255), 1, cv2.LINE_AA)

            ok1, jpg_overlay = cv2.imencode(".jpg", overlay,
                                             [cv2.IMWRITE_JPEG_QUALITY, 80])
            ok2, jpg_raw = cv2.imencode(".jpg", frame,
                                         [cv2.IMWRITE_JPEG_QUALITY, 80])
            if not (ok1 and ok2): continue
            async with state.cond_rgb:
                state.jpg_overlay = bytes(jpg_overlay)
                state.jpg_raw = bytes(jpg_raw)
                state.detections = [
                    {"label": d["label"],
                     "confidence": float(d["confidence"]),
                     "box": [float(x) for x in d["box"]]} for d in dets
                ]
                state.frame_id += 1
                state.fps_rgb = ema
                state.cond_rgb.notify_all()
    finally:
        cap.release()


# ─────────────────────────────────────────────────────────────────────────
#  DAv2 depth loop  (~7 FPS at 518x518, uses RGB frame from RGB loop)
# ─────────────────────────────────────────────────────────────────────────
async def depth_loop(state: State):
    """Continuously pulls the latest raw BGR frame and runs DAv2."""
    loop = asyncio.get_event_loop()
    # wait until RGB loop has frames
    for _ in range(50):
        if getattr(state, "_latest_raw_bgr", None) is not None: break
        await asyncio.sleep(0.1)
    print("loading DAv2 Small …", file=sys.stderr, flush=True)
    est = DepthEstimator(model_path=str(DEPTH_LAB / "models" / "model.onnx"),
                          input_size=518)
    print(f"DAv2 providers: {est.session.get_providers()}",
          file=sys.stderr, flush=True)
    # warm
    warm = state._latest_raw_bgr
    if warm is not None:
        for _ in range(3): est.estimate(warm)
    ema = 0.0
    last = time.monotonic()
    while True:
        bgr = getattr(state, "_latest_raw_bgr", None)
        if bgr is None:
            await asyncio.sleep(0.05); continue
        # downsample for speed (518x518 is full DAv2 res; we do 384 here)
        small = cv2.resize(bgr, (640, 384), interpolation=cv2.INTER_AREA)
        depth = await loop.run_in_executor(None, est.estimate, small)
        now = time.monotonic()
        ema = 0.9 * ema + 0.1 * (1.0 / max(now - last, 1e-3))
        last = now
        lo, hi = float(depth.min()), float(depth.max())
        norm = (depth - lo) / (hi - lo + 1e-8)
        gray = (norm * 255).astype(np.uint8)
        viz = cv2.applyColorMap(gray, cv2.COLORMAP_INFERNO)
        viz = cv2.resize(viz, (bgr.shape[1], bgr.shape[0]),
                         interpolation=cv2.INTER_CUBIC)
        # HUD
        hud = f"DAv2 Small ONNX  {ema:.1f} FPS  range [{lo:.2f}, {hi:.2f}]"
        cv2.rectangle(viz, (8, 8), (8 + 10 + 8 * len(hud), 32),
                      (0, 0, 0), -1)
        cv2.putText(viz, hud, (16, 26), cv2.FONT_HERSHEY_SIMPLEX, 0.55,
                    (255, 255, 255), 1, cv2.LINE_AA)
        ok, jpg = cv2.imencode(".jpg", viz, [cv2.IMWRITE_JPEG_QUALITY, 75])
        if not ok: continue
        async with state.cond_depth:
            state.jpg_depth = bytes(jpg)
            state.depth_frame_id += 1
            state.fps_depth = ema
            state.depth_range = (lo, hi)
            state.cond_depth.notify_all()


# ─────────────────────────────────────────────────────────────────────────
#  tegrastats poller  (for live perf widget)
# ─────────────────────────────────────────────────────────────────────────
async def tegrastats_loop(state: State):
    proc = await asyncio.create_subprocess_exec(
        "tegrastats", "--interval", "1000",
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.DEVNULL,
    )
    try:
        while True:
            line = await proc.stdout.readline()
            if not line: break
            state.tegrastats = line.decode("utf-8", errors="ignore").strip()
    finally:
        proc.terminate()


# ─────────────────────────────────────────────────────────────────────────
#  HTTP handlers
# ─────────────────────────────────────────────────────────────────────────
BOUNDARY = b"--frame"


async def mjpeg(request, state: State, attr: str, cond_name: str, id_attr: str):
    resp = web.StreamResponse(status=200, headers={
        "Content-Type": "multipart/x-mixed-replace; boundary=frame",
        "Cache-Control": "no-cache",
        "Pragma": "no-cache",
        "Access-Control-Allow-Origin": "*",
    })
    await resp.prepare(request)
    last_id = -1
    cond = getattr(state, cond_name)
    try:
        while True:
            async with cond:
                while getattr(state, id_attr) == last_id:
                    await cond.wait()
                jpg = getattr(state, attr)
                last_id = getattr(state, id_attr)
            if not jpg: continue
            await resp.write(BOUNDARY + b"\r\nContent-Type: image/jpeg\r\n" +
                             f"Content-Length: {len(jpg)}\r\n\r\n".encode() +
                             jpg + b"\r\n")
    except (asyncio.CancelledError, ConnectionResetError):
        pass
    return resp


async def stream(req):
    return await mjpeg(req, req.app["state"], "jpg_overlay", "cond_rgb", "frame_id")


async def raw(req):
    return await mjpeg(req, req.app["state"], "jpg_raw", "cond_rgb", "frame_id")


async def depth(req):
    return await mjpeg(req, req.app["state"], "jpg_depth", "cond_depth", "depth_frame_id")


async def detections(req):
    s: State = req.app["state"]
    return web.json_response({
        "frame_id": s.frame_id, "fps": s.fps_rgb,
        "detections": s.detections,
    }, headers={"Access-Control-Allow-Origin": "*"})


_TEGRA_RAM = re.compile(r"RAM (\d+)/(\d+)MB")
_TEGRA_GR3D = re.compile(r"GR3D_FREQ (\d+)%")
_TEGRA_CPU = re.compile(r"CPU \[([^\]]+)\]")
_TEGRA_TEMP = re.compile(r"gpu@([\d.]+)C|GPU@([\d.]+)C", re.IGNORECASE)
_TEGRA_W = re.compile(r"VDD_IN (\d+)mW/(\d+)mW")


def parse_tegra(line: str) -> dict:
    out = {}
    m = _TEGRA_RAM.search(line)
    if m: out["ram_used_mb"] = int(m.group(1)); out["ram_total_mb"] = int(m.group(2))
    m = _TEGRA_GR3D.search(line)
    if m: out["gpu_pct"] = int(m.group(1))
    m = _TEGRA_CPU.search(line)
    if m:
        # 12%@1497,3%@1497,...
        parts = m.group(1).split(",")
        loads = []
        for p in parts:
            try: loads.append(int(p.split("%")[0]))
            except: pass
        if loads: out["cpu_avg"] = round(sum(loads) / len(loads))
    m = _TEGRA_W.search(line)
    if m: out["power_mw"] = int(m.group(1))
    return out


async def scenes(req):
    """Enumerate baked walkthrough scenes for the dashboard scene picker.

    A scene is any scenes/<id>/ dir (excluding the shared _lib) that has a
    scene.compressed.ply. Reads scene-meta.json for point count + camera and
    flags whether a gsplat-refined splat is present.
    """
    out = []
    if SCENES_DIR.is_dir():
        for d in sorted(SCENES_DIR.iterdir()):
            if not d.is_dir() or d.name == "_lib":
                continue
            ply = d / "scene.compressed.ply"
            if not ply.exists():
                continue
            meta = {}
            mp = d / "scene-meta.json"
            if mp.exists():
                try:
                    meta = json.loads(mp.read_text())
                except Exception:
                    meta = {}
            out.append({
                "id": d.name,
                "n_points": meta.get("n_points"),
                "refined": (d / "refined.ply").exists()
                           or bool(meta.get("refined")),
                "ply_mb": round(ply.stat().st_size / 1e6, 1),
                "mtime": int(ply.stat().st_mtime),
                "has_hotspots": (d / "hotspots.json").exists(),
            })
    out.sort(key=lambda s: s["mtime"], reverse=True)
    return web.json_response(
        {"scenes": out}, headers={"Access-Control-Allow-Origin": "*"})


async def health(req):
    s: State = req.app["state"]
    tegra = parse_tegra(s.tegrastats)
    return web.json_response({
        "ok": True,
        "fps_rgb": round(s.fps_rgb, 1),
        "fps_depth": round(s.fps_depth, 1),
        "frames": s.frame_id,
        "depth_frames": s.depth_frame_id,
        "uptime_s": round(time.monotonic() - s.started, 1),
        "detection_count": len(s.detections),
        "depth_range": list(s.depth_range),
        "tegrastats": tegra,
    }, headers={"Access-Control-Allow-Origin": "*"})


async def on_startup(app):
    app["state"] = State()
    app["state"]._latest_raw_bgr = None
    app["rgb_task"] = asyncio.create_task(rgb_loop(
        app["state"], app["device"], app["width"], app["height"], app["fps"]))
    if app["depth_on"]:
        app["depth_task"] = asyncio.create_task(depth_loop(app["state"]))
    app["tegra_task"] = asyncio.create_task(tegrastats_loop(app["state"]))


async def on_cleanup(app):
    for k in ("rgb_task", "depth_task", "tegra_task"):
        t = app.get(k)
        if t:
            t.cancel()
            try: await t
            except asyncio.CancelledError: pass


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--device", default="/dev/video0")
    p.add_argument("--width", type=int, default=1280)
    p.add_argument("--height", type=int, default=720)
    p.add_argument("--fps", type=int, default=30)
    p.add_argument("--port", type=int, default=8092)
    p.add_argument("--no-depth", action="store_true",
                   help="disable DAv2 depth loop to save VRAM")
    args = p.parse_args()

    app = web.Application(client_max_size=0)
    app["device"], app["width"], app["height"], app["fps"] = \
        args.device, args.width, args.height, args.fps
    app["depth_on"] = not args.no_depth
    app.add_routes([
        web.get("/stream", stream),
        web.get("/raw", raw),
        web.get("/depth", depth),
        web.get("/detections", detections),
        web.get("/health", health),
        web.get("/scenes", scenes),
    ])
    app.on_startup.append(on_startup)
    app.on_cleanup.append(on_cleanup)
    web.run_app(app, host="0.0.0.0", port=args.port, print=lambda *_: None)


if __name__ == "__main__":
    main()
