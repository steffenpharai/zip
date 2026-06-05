#!/usr/bin/env python3
"""Headless server-side render of a 3DGS PLY to PNGs (gsplat, Apache-2.0).

Bypasses the browser entirely so we can SEE exactly what a scene looks like
without depending on WebGL/tunnel/screenshot. Renders N orbit views around
the scene centroid and writes them to scenes/<scan>/render_*.png.

Usage (inside splat-lab:latest):
    python render_ply.py --scan-id livedemo --views 3 --res 720
"""
import argparse, json, math, os
from pathlib import Path
import numpy as np

WORKSPACE = Path(os.environ.get("SPLAT_LAB", "/workspace"))
SCENES = WORKSPACE / "scenes"
SH_C0 = 0.28209479177387814


def load_ply(p: Path):
    with open(p, "rb") as f:
        while f.readline() != b"end_header\n":
            pass
        body = f.read()
    names = ["x","y","z","nx","ny","nz","f0","f1","f2","op",
             "s0","s1","s2","r0","r1","r2","r3"]
    v = np.frombuffer(body, dtype=np.dtype([(n, "f4") for n in names]))
    xyz = np.stack([v["x"], v["y"], v["z"]], 1).astype(np.float32)
    dc = np.stack([v["f0"], v["f1"], v["f2"]], 1).astype(np.float32)
    op = v["op"].astype(np.float32)
    sc = np.stack([v["s0"], v["s1"], v["s2"]], 1).astype(np.float32)
    q = np.stack([v["r0"], v["r1"], v["r2"], v["r3"]], 1).astype(np.float32)
    return xyz, dc, op, sc, q


def lookat_w2c(eye, target, up=(0, 1, 0)):
    eye = np.asarray(eye, np.float32); target = np.asarray(target, np.float32)
    up = np.asarray(up, np.float32)
    z = target - eye; z /= (np.linalg.norm(z) + 1e-9)      # +Z forward (OpenCV)
    x = np.cross(up, z); x /= (np.linalg.norm(x) + 1e-9)   # +X right
    y = np.cross(z, x)                                      # +Y down
    R = np.stack([x, y, z], 0)                              # world->cam rot
    t = -R @ eye
    m = np.eye(4, dtype=np.float32)
    m[:3, :3] = R; m[:3, 3] = t
    return m


def run(args):
    import torch
    import torch.nn.functional as Fn
    from gsplat import rasterization
    import cv2

    scene = SCENES / args.scan_id
    xyz, dc, op, sc, q = load_ply(scene / "scene.compressed.ply")
    dev = "cuda"
    means = torch.tensor(xyz, device=dev)
    quats = Fn.normalize(torch.tensor(q, device=dev), dim=-1)
    scales = torch.exp(torch.tensor(sc, device=dev))
    opac = torch.sigmoid(torch.tensor(op, device=dev))
    colors = torch.tensor(dc, device=dev)[:, None, :]      # [N,1,3] SH dc

    c = xyz.mean(0)
    radius = float(np.linalg.norm(xyz - c, axis=1).mean()) * 2.2
    W = H = args.res
    f = 0.9 * W
    K = torch.tensor([[f, 0, W / 2], [0, f, H / 2], [0, 0, 1]],
                     dtype=torch.float32, device=dev)[None]

    print(f"{args.scan_id}: {means.shape[0]} splats  centroid={c.round(2)}  "
          f"orbit_r={radius:.2f}m", flush=True)
    outs = []
    for i in range(args.views):
        ang = (i / max(args.views, 1)) * 2 * math.pi * 0.5 - math.pi * 0.25
        eye = [c[0] + radius * math.sin(ang),
               c[1] + 0.15 * radius,
               c[2] + radius * math.cos(ang)]
        vm = torch.tensor(lookat_w2c(eye, c)[None], device=dev)
        out, alpha, _ = rasterization(
            means, quats, scales, opac, colors, vm, K, W, H,
            sh_degree=0, near_plane=0.01, far_plane=100.0,
        )
        # composite over a neutral gray bg: out is over-black, alpha is coverage
        bg = torch.tensor([0.10, 0.10, 0.12], device=dev)
        comp = out[0] + (1.0 - alpha[0]) * bg
        img = (comp.clamp(0, 1).cpu().numpy() * 255).astype(np.uint8)
        cov = float((alpha[0, ..., 0] > 0.05).float().mean().cpu()) * 100
        bright = float(img.mean())
        p = scene / f"render_{i}.png"
        cv2.imwrite(str(p), cv2.cvtColor(img, cv2.COLOR_RGB2BGR))
        print(f"  view {i}: coverage={cov:.0f}%  mean_brightness={bright:.0f}/255  -> {p.name}",
              flush=True)
        outs.append(str(p))
    print("RENDER_OK " + " ".join(outs), flush=True)


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--scan-id", required=True)
    p.add_argument("--views", type=int, default=3)
    p.add_argument("--res", type=int, default=720)
    args = p.parse_args()
    run(args)
