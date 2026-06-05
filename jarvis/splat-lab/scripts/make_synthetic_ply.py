#!/usr/bin/env python3
"""Generate a synthetic 3D Gaussian Splat .ply for smoke-testing SuperSplat Viewer.

Produces a recognizable "splat sphere" of N gaussians arranged on a sphere
surface, colored by spherical position. Standard 3DGS PLY format (SH degree 0).

Usage:
    python make_synthetic_ply.py [N] [out.ply]
"""
import struct
import sys
import math
import random

def write_3dgs_ply(path: str, n: int = 2000, radius: float = 1.0):
    """Write a binary little-endian 3DGS PLY with N gaussians on a sphere."""
    # The 3DGS PLY schema (SH degree 0 = 3 DC color coeffs, no extra SH bands).
    props = [
        ("x", "f4"), ("y", "f4"), ("z", "f4"),
        ("nx", "f4"), ("ny", "f4"), ("nz", "f4"),
        ("f_dc_0", "f4"), ("f_dc_1", "f4"), ("f_dc_2", "f4"),
        ("opacity", "f4"),
        ("scale_0", "f4"), ("scale_1", "f4"), ("scale_2", "f4"),
        ("rot_0", "f4"), ("rot_1", "f4"), ("rot_2", "f4"), ("rot_3", "f4"),
    ]
    header_lines = [
        "ply",
        "format binary_little_endian 1.0",
        f"element vertex {n}",
        *[f"property float {name}" for name, _ in props],
        "end_header",
    ]
    header = ("\n".join(header_lines) + "\n").encode("ascii")

    rng = random.Random(42)
    SH_C0 = 0.28209479177387814  # 1/(2*sqrt(pi))
    fmt = "<" + "f" * len(props)

    with open(path, "wb") as f:
        f.write(header)
        for _ in range(n):
            # uniform-on-sphere
            u, v = rng.random(), rng.random()
            theta = 2 * math.pi * u
            phi = math.acos(2 * v - 1)
            x = radius * math.sin(phi) * math.cos(theta)
            y = radius * math.sin(phi) * math.sin(theta)
            z = radius * math.cos(phi)
            # color from position (rainbow-ish)
            r = 0.5 + 0.5 * x / radius
            g = 0.5 + 0.5 * y / radius
            b = 0.5 + 0.5 * z / radius
            # convert linear-RGB → DC SH coefficient
            dc0 = (r - 0.5) / SH_C0
            dc1 = (g - 0.5) / SH_C0
            dc2 = (b - 0.5) / SH_C0
            # log-scale (small splats); opacity logit (high)
            log_scale = math.log(0.02)
            opacity_logit = 4.0  # sigmoid(4) ~= 0.98
            # identity quaternion (w, x, y, z)
            q = (1.0, 0.0, 0.0, 0.0)

            f.write(struct.pack(
                fmt,
                x, y, z,
                0.0, 0.0, 0.0,        # normals (unused by viewers)
                dc0, dc1, dc2,
                opacity_logit,
                log_scale, log_scale, log_scale,
                q[0], q[1], q[2], q[3],
            ))

    return path


if __name__ == "__main__":
    n = int(sys.argv[1]) if len(sys.argv) > 1 else 2000
    out = sys.argv[2] if len(sys.argv) > 2 else "scene.compressed.ply"
    p = write_3dgs_ply(out, n=n)
    import os
    print(f"wrote {p}: {n} gaussians, {os.path.getsize(p)} bytes")
