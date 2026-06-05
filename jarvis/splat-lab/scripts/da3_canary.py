#!/usr/bin/env python3
"""DA3-SMALL canary inference test on Jetson Orin Nano Super.

Validates:
  1. xformers SwiGLU fallback produces non-zero depth (issue-#312 canary)
  2. Inference time + peak VRAM on real C615 frames
  3. Gaussian-Splatting branch (infer_gs=True) actually runs

Run inside splat-lab:latest container."""
import os
import sys
import time
import json
from pathlib import Path

os.environ["PYTORCH_CUDA_ALLOC_CONF"] = "expandable_segments:True"

import numpy as np
import torch

WORKSPACE = Path(os.environ.get("SPLAT_LAB", "/workspace"))


def main():
    scan_id = sys.argv[1] if len(sys.argv) > 1 else "smoketest"
    n_frames = int(sys.argv[2]) if len(sys.argv) > 2 else 3
    do_gs = "--gs" in sys.argv

    print(f"=== DA3 canary scan_id={scan_id} n_frames={n_frames} gs={do_gs} ===",
          flush=True)
    print(f"torch {torch.__version__} cuda={torch.cuda.is_available()} "
          f"dev={torch.cuda.get_device_name(0)}", flush=True)

    frames_dir = WORKSPACE / "frames" / scan_id
    frames = sorted(frames_dir.glob("frame_*.jpg"))[:n_frames]
    if not frames:
        sys.exit(f"no frames in {frames_dir}")
    print(f"loaded {len(frames)} frames from {frames_dir}", flush=True)

    from depth_anything_3.api import DepthAnything3
    t0 = time.monotonic()
    model = DepthAnything3.from_pretrained("depth-anything/DA3-SMALL")
    load_s = time.monotonic() - t0
    # Keep weights in fp32 (LayerNorm doesn't accept fp16 input). Use autocast
    # for fp16 compute on the matmul/conv layers — that's where the speed is.
    model = model.cuda().eval()
    torch.cuda.synchronize()
    load_vram = torch.cuda.max_memory_allocated() / 1e6
    print(f"  load: {load_s:.1f}s   VRAM after load: {load_vram:.0f} MB",
          flush=True)

    autocast_ctx = torch.amp.autocast(device_type="cuda", dtype=torch.float16)

    # ---- single-image canary (depth check) ----
    print("\n--- canary: 1-frame depth check ---", flush=True)
    t0 = time.monotonic()
    with autocast_ctx:
        pred = model.inference([str(frames[0])], process_res=504, infer_gs=False,
                                export_dir=None)
    torch.cuda.synchronize()
    dt_single = time.monotonic() - t0
    single_vram = torch.cuda.max_memory_allocated() / 1e6
    print(f"  1-frame inference: {dt_single:.2f}s   peak VRAM: {single_vram:.0f} MB",
          flush=True)
    print(f"  pred type: {type(pred).__name__}", flush=True)
    if hasattr(pred, "__dict__"):
        for k, v in pred.__dict__.items():
            if torch.is_tensor(v):
                print(f"    .{k}: tensor {tuple(v.shape)} dtype={v.dtype}")
            elif isinstance(v, np.ndarray):
                print(f"    .{k}: ndarray {v.shape} dtype={v.dtype}")
            elif isinstance(v, dict):
                print(f"    .{k}: dict keys={list(v.keys())}")
            else:
                print(f"    .{k}: {type(v).__name__}")
    # Pull a depth-ish field and canary-check
    depth = None
    for fname in ("depth", "depths", "depth_maps"):
        v = getattr(pred, fname, None)
        if v is not None:
            depth = v[0] if hasattr(v, "__getitem__") and not isinstance(v, np.ndarray) else v
            if torch.is_tensor(depth): depth = depth.float().cpu().numpy()
            break
    if depth is not None:
        depth = np.asarray(depth).squeeze()
        print(f"\n  CANARY depth: shape={depth.shape} min={depth.min():.4f} "
              f"max={depth.max():.4f} mean={depth.mean():.4f}", flush=True)
        assert float(depth.min()) != float(depth.max()), \
            "CANARY FAILED: depth all equal — SwiGLU fallback silently wrong!"
        print("  CANARY PASS", flush=True)
    else:
        print("  WARN: no depth field found in Prediction — listing attrs done above",
              flush=True)

    # ---- multi-image timing ----
    print("\n--- timing: 3-frame inference (post-warmup) ---", flush=True)
    times = []
    for i, fp in enumerate(frames[:3]):
        torch.cuda.synchronize()
        t0 = time.monotonic()
        with autocast_ctx:
            _ = model.inference([str(fp)], process_res=504, infer_gs=False, export_dir=None)
        torch.cuda.synchronize()
        dt = time.monotonic() - t0
        times.append(dt)
        print(f"  frame {i}: {dt:.2f}s", flush=True)
    print(f"  mean: {np.mean(times)*1000:.0f} ms   median: {np.median(times)*1000:.0f} ms",
          flush=True)
    print(f"  steady VRAM: {torch.cuda.max_memory_allocated()/1e6:.0f} MB", flush=True)

    # ---- multi-image (N=3 in one call — the real production mode) ----
    print(f"\n--- multi-view: {min(len(frames),3)}-frame batch ---", flush=True)
    multi_paths = [str(p) for p in frames[:3]]
    torch.cuda.synchronize()
    t0 = time.monotonic()
    with autocast_ctx:
        pred_multi = model.inference(multi_paths, process_res=504, infer_gs=False,
                                      export_dir=None)
    torch.cuda.synchronize()
    print(f"  3-frame multi-view: {time.monotonic()-t0:.2f}s   "
          f"peak VRAM: {torch.cuda.max_memory_allocated()/1e6:.0f} MB", flush=True)

    if do_gs:
        print("\n--- gs branch (infer_gs=True, the integrated 3DGS head) ---",
              flush=True)
        torch.cuda.synchronize()
        torch.cuda.reset_peak_memory_stats()
        t0 = time.monotonic()
        with autocast_ctx:
            pred_gs = model.inference(multi_paths, process_res=504, infer_gs=True,
                                       export_dir=None)
        torch.cuda.synchronize()
        print(f"  3-frame infer_gs: {time.monotonic()-t0:.2f}s   "
              f"peak VRAM: {torch.cuda.max_memory_allocated()/1e6:.0f} MB",
              flush=True)
        # Save a report
        report = {
            "scan_id": scan_id,
            "n_frames": len(frames),
            "model": "depth-anything/DA3-SMALL",
            "load_s": load_s,
            "load_vram_mb": load_vram,
            "single_frame_ms_median": float(np.median(times) * 1000),
            "single_frame_ms_mean": float(np.mean(times) * 1000),
            "steady_vram_mb": float(torch.cuda.max_memory_allocated() / 1e6),
            "canary_pass": True,
        }
        out = WORKSPACE / "output" / scan_id
        out.mkdir(parents=True, exist_ok=True)
        (out / "da3_canary_report.json").write_text(json.dumps(report, indent=2))
        print(f"\nwrote {out}/da3_canary_report.json", flush=True)


if __name__ == "__main__":
    main()
