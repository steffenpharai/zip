#!/usr/bin/env python3
"""Generate the simplest possible viewer-testable 3DGS PLY:
9 huge, opaque, brightly colored gaussians at known positions.

Layout: cube of 8 gaussians at ±0.5 m corners + 1 huge gaussian at origin.
Each gaussian is 30 cm radius (log_scale = log(0.3) ≈ -1.20), opacity 0.99,
colors mapped from corner index for visual identification.
"""
import struct, sys, math, os
from pathlib import Path

# 8 corners of a [-0.5, 0.5] cube + center
positions = [
    ( 0.0,  0.0,  0.0),                          # center: white
    (-0.5, -0.5, -0.5),  ( 0.5, -0.5, -0.5),
    (-0.5,  0.5, -0.5),  ( 0.5,  0.5, -0.5),
    (-0.5, -0.5,  0.5),  ( 0.5, -0.5,  0.5),
    (-0.5,  0.5,  0.5),  ( 0.5,  0.5,  0.5),
]
colors = [
    (1.0, 1.0, 1.0),                              # center: white
    (1.0, 0.0, 0.0), (0.0, 1.0, 0.0),
    (0.0, 0.0, 1.0), (1.0, 1.0, 0.0),
    (1.0, 0.0, 1.0), (0.0, 1.0, 1.0),
    (1.0, 0.5, 0.0), (0.5, 0.0, 1.0),
]

assert len(positions) == len(colors) == 9
SH_C0 = 0.28209479177387814

props = [
    "x","y","z", "nx","ny","nz",
    "f_dc_0","f_dc_1","f_dc_2",
    "opacity",
    "scale_0","scale_1","scale_2",
    "rot_0","rot_1","rot_2","rot_3",
]

out = sys.argv[1] if len(sys.argv) > 1 else "scene.compressed.ply"
n = len(positions)
log_scale = math.log(0.30)   # 30 cm gaussians
opacity_logit = 4.6          # sigmoid ≈ 0.99

with open(out, "wb") as f:
    header = ("ply\nformat binary_little_endian 1.0\n"
              f"element vertex {n}\n"
              + "".join(f"property float {p}\n" for p in props)
              + "end_header\n").encode("ascii")
    f.write(header)
    fmt = "<" + "f" * len(props)
    for (x, y, z), (r, g, b) in zip(positions, colors):
        dc0 = (r - 0.5) / SH_C0
        dc1 = (g - 0.5) / SH_C0
        dc2 = (b - 0.5) / SH_C0
        f.write(struct.pack(fmt,
            x, y, z,
            0.0, 0.0, 0.0,
            dc0, dc1, dc2,
            opacity_logit,
            log_scale, log_scale, log_scale,
            1.0, 0.0, 0.0, 0.0,
        ))

print(f"wrote {out}: {n} gaussians, {os.path.getsize(out)} bytes")
