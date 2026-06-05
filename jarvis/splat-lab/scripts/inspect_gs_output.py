#!/usr/bin/env python3
"""Inspect DA3's infer_gs=True output schema so we can serialize to PLY."""
import os
os.environ["PYTORCH_CUDA_ALLOC_CONF"] = "expandable_segments:True"
import sys
import time
import numpy as np
import torch
from pathlib import Path

WORKSPACE = Path(os.environ.get("SPLAT_LAB", "/workspace"))

frames_dir = WORKSPACE / "frames" / "smoketest"
frames = sorted(frames_dir.glob("frame_*.jpg"))[:3]
print("frames:", [p.name for p in frames])

from depth_anything_3.api import DepthAnything3
model = DepthAnything3.from_pretrained("depth-anything/DA3-SMALL").cuda().eval()
ac = torch.amp.autocast(device_type="cuda", dtype=torch.float16)

print("\n=== infer_gs=True output schema ===")
with ac:
    pred = model.inference([str(p) for p in frames],
                            process_res=504, infer_gs=True, export_dir=None)

print("Prediction fields:")
for k in dir(pred):
    if k.startswith("_"): continue
    v = getattr(pred, k)
    if callable(v): continue
    if torch.is_tensor(v):
        print(f"  .{k}: tensor {tuple(v.shape)} dtype={v.dtype} dev={v.device}")
    elif isinstance(v, np.ndarray):
        print(f"  .{k}: ndarray {v.shape} dtype={v.dtype}")
    elif isinstance(v, dict):
        print(f"  .{k}: dict keys={list(v.keys())}")
        for kk, vv in v.items():
            if torch.is_tensor(vv):
                print(f"      [{kk}]: tensor {tuple(vv.shape)} dtype={vv.dtype}")
            elif isinstance(vv, np.ndarray):
                print(f"      [{kk}]: ndarray {vv.shape} dtype={vv.dtype}")
            else:
                print(f"      [{kk}]: {type(vv).__name__}")
    elif isinstance(v, (list, tuple)):
        print(f"  .{k}: {type(v).__name__} len={len(v)}")
        if v and torch.is_tensor(v[0]):
            print(f"      [0]: tensor {tuple(v[0].shape)} dtype={v[0].dtype}")
    else:
        print(f"  .{k}: {type(v).__name__}  value={repr(v)[:80]}")

# Now try the export pathway — DA3 has a built-in PLY export
print("\n=== try built-in export to PLY ===")
out_dir = WORKSPACE / "output" / "smoketest"
out_dir.mkdir(parents=True, exist_ok=True)
with ac:
    pred2 = model.inference([str(p) for p in frames],
                             process_res=504, infer_gs=True,
                             export_dir=str(out_dir),
                             export_format="ply")
print("export done. files:")
for f in sorted(out_dir.rglob("*")):
    if f.is_file():
        print(f"  {f.relative_to(out_dir)} ({f.stat().st_size} bytes)")
