#!/usr/bin/env python3
"""Depth Anything 3 (Small) inference on Jetson Orin Nano Super.

Runs inside dustynv/l4t-pytorch container (PyTorch+CUDA, FP16, NO TensorRT —
JetPack 6.2 + TRT 10.3 has a known numerical bug on VGGT-class architectures,
NVIDIA forum #366014, fixed in TRT 10.16 / JetPack 7.2).

Per the workflow finding: SKIP xformers. DA3 only uses xformers.ops.SwiGLU
(not memory_efficient_attention) and ships a pure-PyTorch SwiGLUFFN fallback;
attention layers route to torch.nn.functional.scaled_dot_product_attention
which has FlashAttention-2 kernels native on sm_87 in PyTorch 2.8+.

CANARY: after first inference, assert depth.min() != depth.max() to catch the
DA-V2 issue-#312 silent all-zero-depth failure mode.

Inputs: a directory of keyframes (frames/<scan_id>/frame_*.jpg) from capture.py.
Outputs:
  output/<scan_id>/poses.json          per-frame K + R + t (OpenCV convention)
  output/<scan_id>/depth/frame_*.npy   per-frame float32 depth maps
  output/<scan_id>/conf/frame_*.npy    per-frame float32 confidence maps
  output/<scan_id>/seed.ply            sparse colored point cloud for splat init

Usage (inside container, with splat-lab bind-mounted at /workspace):
    python da3_infer.py --scan-id room1 --variant small

The container is invoked via scripts/run_in_container.sh which mounts
~/splat-lab → /workspace and ~/jetson-containers caches.
"""
import argparse
import json
import os
import struct
import sys
import time
from pathlib import Path

import numpy as np


WORKSPACE = Path(os.environ.get("SPLAT_LAB", "/workspace"))
FRAMES = WORKSPACE / "frames"
OUTPUT = WORKSPACE / "output"
MODELS = WORKSPACE / "models"


def setup_torch_and_disable_xformers():
    """Ensure xformers is NOT used (use built-in SwiGLU fallback); enable SDPA FA2."""
    # Force the SwiGLU fallback by stubbing xformers BEFORE DA3 import — the
    # module's try/except ImportError gate will then take the pure-PyTorch path.
    sys.modules.setdefault("xformers", None)
    import torch
    print(f"torch {torch.__version__} cuda={torch.cuda.is_available()} "
          f"device={torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'cpu'}",
          file=sys.stderr)
    if not torch.cuda.is_available():
        raise RuntimeError("CUDA not available — DA3 needs GPU")
    # FlashAttention-2 in SDPA is native on Ampere (sm_87) in PyTorch 2.8+
    torch.backends.cuda.enable_flash_sdp(True)
    torch.backends.cuda.enable_mem_efficient_sdp(True)
    torch.set_float32_matmul_precision("high")
    return torch


def load_da3(variant: str = "small", torch=None):
    """Load DA3-Small (or Base). Tries multiple import paths because the
    package layout may differ between HF hub and the github repo."""
    cache_dir = MODELS / "depth_anything_3"
    cache_dir.mkdir(parents=True, exist_ok=True)
    os.environ.setdefault("HF_HOME", str(MODELS / "hf"))
    os.environ.setdefault("TORCH_HOME", str(MODELS / "torch"))

    model = None
    last_err = None

    # Attempt 1: official ByteDance-Seed package via pip install
    try:
        from depth_anything_3 import DepthAnything3   # type: ignore
        model = DepthAnything3.from_pretrained(f"depth-anything-3-{variant}")
        print(f"loaded DA3-{variant} via depth_anything_3.DepthAnything3",
              file=sys.stderr)
    except Exception as e:
        last_err = e

    # Attempt 2: via HF transformers AutoModel
    if model is None:
        try:
            from transformers import AutoModel
            model = AutoModel.from_pretrained(
                f"depth-anything/Depth-Anything-3-{variant.capitalize()}",
                trust_remote_code=True,
            )
            print(f"loaded DA3-{variant} via transformers.AutoModel",
                  file=sys.stderr)
        except Exception as e:
            last_err = e

    # Attempt 3: torch.hub
    if model is None:
        try:
            model = torch.hub.load("ByteDance-Seed/depth-anything-3",
                                   f"depth_anything_3_{variant}",
                                   trust_repo=True)
            print(f"loaded DA3-{variant} via torch.hub", file=sys.stderr)
        except Exception as e:
            last_err = e

    if model is None:
        raise RuntimeError(
            f"could not load DA3-{variant} via any path. Last error: {last_err}\n"
            f"Install with: pip install depth-anything-3   (or)\n"
            f"           pip install git+https://github.com/ByteDance-Seed/depth-anything-3.git"
        )

    model = model.eval().cuda().half()
    print(f"  xformers active? {'xformers' in sys.modules and sys.modules['xformers'] is not None}",
          file=sys.stderr)
    return model


def preprocess(bgr_image, size: int = 518, torch=None):
    """BGR uint8 -> 1x3xSIZExSIZE float16 CUDA tensor (ImageNet-normalized)."""
    import cv2
    h, w = bgr_image.shape[:2]
    rgb = cv2.cvtColor(bgr_image, cv2.COLOR_BGR2RGB)
    # DA3 wants H,W as multiples of 14
    size = (size // 14) * 14
    resized = cv2.resize(rgb, (size, size), interpolation=cv2.INTER_CUBIC)
    arr = resized.astype(np.float32) / 255.0
    mean = np.array([0.485, 0.456, 0.406], np.float32).reshape(1, 1, 3)
    std = np.array([0.229, 0.224, 0.225], np.float32).reshape(1, 1, 3)
    arr = (arr - mean) / std
    chw = np.ascontiguousarray(np.transpose(arr, (2, 0, 1))[None])
    t = torch.from_numpy(chw).cuda().half()
    return t, (h, w)


def write_ply(path: Path, xyz: np.ndarray, rgb: np.ndarray | None = None):
    """Write an ASCII point-cloud PLY (used as splat-trainer seed)."""
    assert xyz.ndim == 2 and xyz.shape[1] == 3
    n = xyz.shape[0]
    with path.open("wb") as f:
        header = [
            b"ply\n", b"format binary_little_endian 1.0\n",
            f"element vertex {n}\n".encode(),
            b"property float x\nproperty float y\nproperty float z\n",
        ]
        if rgb is not None:
            assert rgb.shape == xyz.shape
            header += [b"property uchar red\nproperty uchar green\nproperty uchar blue\n"]
        header += [b"end_header\n"]
        f.write(b"".join(header))
        if rgb is None:
            f.write(np.ascontiguousarray(xyz.astype(np.float32)).tobytes())
        else:
            buf = np.empty(n, dtype=[("x","f4"),("y","f4"),("z","f4"),
                                     ("r","u1"),("g","u1"),("b","u1")])
            buf["x"], buf["y"], buf["z"] = xyz[:,0], xyz[:,1], xyz[:,2]
            buf["r"], buf["g"], buf["b"] = rgb[:,0], rgb[:,1], rgb[:,2]
            f.write(buf.tobytes())


def run(args):
    scan_dir = FRAMES / args.scan_id
    out_dir = OUTPUT / args.scan_id
    (out_dir / "depth").mkdir(parents=True, exist_ok=True)
    (out_dir / "conf").mkdir(parents=True, exist_ok=True)

    images = sorted(scan_dir.glob("frame_*.jpg"))
    if not images:
        raise SystemExit(f"no frames in {scan_dir}")
    print(f"DA3 over {len(images)} frames from {scan_dir}", file=sys.stderr)

    torch = setup_torch_and_disable_xformers()
    import cv2

    model = load_da3(args.variant, torch=torch)
    # warmup
    print("warmup x2...", file=sys.stderr)
    dummy = np.zeros((720, 1280, 3), dtype=np.uint8)
    for _ in range(2):
        x, hw = preprocess(dummy, args.input_size, torch=torch)
        with torch.no_grad():
            _ = model(x)
        torch.cuda.synchronize()

    poses = {}
    seed_xyz = []
    seed_rgb = []
    timings = []
    canary_ok = False

    for i, img_path in enumerate(images):
        bgr = cv2.imread(str(img_path))
        if bgr is None:
            print(f"  skip unreadable {img_path}", file=sys.stderr)
            continue
        x, (h, w) = preprocess(bgr, args.input_size, torch=torch)
        torch.cuda.synchronize()
        t0 = time.monotonic()
        with torch.no_grad():
            out = model(x)
        torch.cuda.synchronize()
        dt = time.monotonic() - t0
        timings.append(dt)

        # DA3 output schema: dict with keys depending on package.
        # Common keys: 'depth', 'conf'/'confidence', 'intrinsics'/'K',
        # 'extrinsics'/'pose', 'pointmap'/'points', 'splats'/'gaussians'.
        d = _extract(out, "depth")
        c = _extract(out, ("conf", "confidence")) or np.ones_like(d)
        K = _extract(out, ("intrinsics", "K"))
        Rt = _extract(out, ("extrinsics", "pose", "camtoworlds", "RT"))
        pts = _extract(out, ("pointmap", "points", "world_points"))

        # CANARY: silent-zero check on the first inference
        if not canary_ok:
            assert float(d.min()) != float(d.max()), \
                "CANARY FAILED: depth min == max — SwiGLU fallback silently broken"
            canary_ok = True
            print(f"  canary OK: depth range [{d.min():.4f}, {d.max():.4f}]",
                  file=sys.stderr)

        np.save(out_dir / "depth" / (img_path.stem + ".npy"),
                d.astype(np.float32))
        np.save(out_dir / "conf" / (img_path.stem + ".npy"),
                c.astype(np.float32))

        poses[img_path.name] = {
            "K": K.tolist() if K is not None else None,
            "Rt": Rt.tolist() if Rt is not None else None,
            "input_h": h, "input_w": w,
            "model_size": args.input_size,
            "infer_s": dt,
        }

        # accumulate sparse seed points (every Nth pixel of every Mth frame)
        if pts is not None and i % max(1, len(images) // 30) == 0:
            stride = 16
            p = pts[::stride, ::stride].reshape(-1, 3)
            rgb_small = cv2.resize(cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB),
                                   (pts.shape[1], pts.shape[0]))
            rgb_p = rgb_small[::stride, ::stride].reshape(-1, 3).astype(np.uint8)
            seed_xyz.append(p)
            seed_rgb.append(rgb_p)

        if i % 10 == 0 or i == len(images) - 1:
            print(f"  [{i+1:3d}/{len(images)}] {img_path.name}  "
                  f"depth=[{d.min():.3f},{d.max():.3f}]  "
                  f"infer={dt*1000:.0f} ms",
                  file=sys.stderr)

    # save poses + seed
    with (out_dir / "poses.json").open("w") as f:
        json.dump({"poses": poses,
                   "variant": args.variant,
                   "input_size": args.input_size,
                   "mean_infer_s": float(np.mean(timings)) if timings else None,
                   "median_infer_s": float(np.median(timings)) if timings else None,
                   "p95_infer_s": float(np.percentile(timings, 95)) if timings else None,
                   "fps_steady": float(1.0/np.median(timings)) if timings else None,
                   }, f, indent=2)
    if seed_xyz:
        all_xyz = np.concatenate(seed_xyz, axis=0).astype(np.float32)
        all_rgb = np.concatenate(seed_rgb, axis=0).astype(np.uint8)
        # cap at 200k seed points
        if all_xyz.shape[0] > 200_000:
            sel = np.random.choice(all_xyz.shape[0], 200_000, replace=False)
            all_xyz, all_rgb = all_xyz[sel], all_rgb[sel]
        write_ply(out_dir / "seed.ply", all_xyz, all_rgb)
        print(f"wrote seed.ply: {all_xyz.shape[0]} points", file=sys.stderr)
    else:
        print("WARN: no pointmap output — write seed.ply via depth backproj manually",
              file=sys.stderr)

    print(f"\nDONE  scan_id={args.scan_id}", file=sys.stderr)
    print(f"  mean infer: {np.mean(timings)*1000:.0f} ms  "
          f"median: {np.median(timings)*1000:.0f} ms  "
          f"fps_steady: {1.0/np.median(timings):.2f}", file=sys.stderr)


def _extract(out, key):
    """out may be dict / dataclass / tuple. Try common access patterns."""
    keys = [key] if isinstance(key, str) else list(key)
    for k in keys:
        if isinstance(out, dict) and k in out:
            v = out[k]
            return v.cpu().numpy().squeeze() if hasattr(v, "cpu") else np.asarray(v)
        if hasattr(out, k):
            v = getattr(out, k)
            return v.cpu().numpy().squeeze() if hasattr(v, "cpu") else np.asarray(v)
    return None


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--scan-id", required=True)
    p.add_argument("--variant", choices=["small", "base"], default="small",
                   help="DA3 model size (Apache 2.0 variants only)")
    p.add_argument("--input-size", type=int, default=518,
                   help="will be rounded to multiple of 14")
    args = p.parse_args()
    run(args)
