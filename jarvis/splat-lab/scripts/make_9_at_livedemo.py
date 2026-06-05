#!/usr/bin/env python3
"""9 huge bright gaussians at livedemo's bbox corners + centroid.
If THIS renders, the prior all-black was an overcomposition issue (too many overlapping gaussians)."""
import struct, math, os

# livedemo bbox corners + centroid
mn = (-0.62, -0.34, -1.21)
mx = ( 0.98,  0.51, -0.32)
cx = 0.5 * (mn[0] + mx[0]); cy = 0.5 * (mn[1] + mx[1]); cz = 0.5 * (mn[2] + mx[2])

positions = [
    (cx, cy, cz),
    (mn[0], mn[1], mn[2]), (mx[0], mn[1], mn[2]),
    (mn[0], mx[1], mn[2]), (mx[0], mx[1], mn[2]),
    (mn[0], mn[1], mx[2]), (mx[0], mn[1], mx[2]),
    (mn[0], mx[1], mx[2]), (mx[0], mx[1], mx[2]),
]
colors = [
    (1.0, 1.0, 1.0),
    (1.0, 0.0, 0.0), (0.0, 1.0, 0.0),
    (0.0, 0.0, 1.0), (1.0, 1.0, 0.0),
    (1.0, 0.0, 1.0), (0.0, 1.0, 1.0),
    (1.0, 0.5, 0.0), (0.5, 0.0, 1.0),
]
SH_C0 = 0.28209479177387814
props = ["x","y","z","nx","ny","nz","f_dc_0","f_dc_1","f_dc_2","opacity",
         "scale_0","scale_1","scale_2","rot_0","rot_1","rot_2","rot_3"]
n = len(positions)
log_scale = math.log(0.20)
opacity = 4.6
out = "scene.compressed.ply"
with open(out, "wb") as f:
    f.write(("ply\nformat binary_little_endian 1.0\nelement vertex %d\n" % n).encode())
    for p in props:
        f.write(("property float " + p + "\n").encode())
    f.write(b"end_header\n")
    for (x, y, z), (r, g, b) in zip(positions, colors):
        f.write(struct.pack("<" + "f" * 17,
            x, y, z, 0, 0, 0,
            (r-0.5)/SH_C0, (g-0.5)/SH_C0, (b-0.5)/SH_C0,
            opacity, log_scale, log_scale, log_scale,
            1.0, 0.0, 0.0, 0.0,
        ))
print(f"wrote {out}: {n} gaussians, {os.path.getsize(out)} bytes")
