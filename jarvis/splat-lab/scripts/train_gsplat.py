#!/usr/bin/env python3
"""Stage B — gsplat 1.5.3 photometric refine of a DA3 init (Apache-2.0).

Runs inside splat-lab:latest (gsplat 1.5.3 + PyTorch 2.4 CUDA, sm_87).

Why this exists
---------------
`bake.py` backprojects DA3 depth into a 3DGS PLY. That PLY renders (in the
mkkellogg back-to-front viewer) but it's a raw 2.5D depth manifold — every
splat sits exactly where one pixel's ray hit, isotropic, with confidence-derived
opacity. A short photometric optimization pass:

  • slides each gaussian along/across its ray to minimise re-render error,
  • lets scales/opacity/colour adapt to the actual images,
  • (with real camera parallax) triangulates true 3D structure off the manifold.

This is the standard 3DGS refinement, reduced to the minimum that fits the
Orin Nano's 8 GB. No Nerfstudio dependency — just gsplat's rasterizer + Adam.

Frame convention (kept consistent end-to-end)
---------------------------------------------
DA3 extrinsics are OpenCV world-to-camera (w2c): x_cam = R x_world + t.
We reconstruct the init in OpenCV world frame, optimise there with w2c
viewmats, then on export apply the OpenCV→viewer flip F = diag(1,-1,-1)
(negate Y,Z) to BOTH positions and gaussian orientations — the same frame
`bake.py`'s PLY lands in, so the mkkellogg viewer renders it identically.

Inputs (produced by bake.py):
  output/<scan>/depth.npy     (V,H,W) float32  — DA3 metric depth
  output/<scan>/conf.npy      (V,H,W) float32  — DA3 confidence
  output/<scan>/poses.json    intrinsics (V,3,3), extrinsics w2c (V,3,4),
                              frame_paths, H, W (processed res)

Outputs:
  scenes/<scan>/refined.ply             refined splat (source of truth)
  scenes/<scan>/scene.compressed.ply    overwritten with refined (viewer default)
  scenes/<scan>/hero.ply                copy of refined
  scenes/<scan>/scene-meta.json         refined:true + iters/psnr stamped

Usage (inside container):
  python train_gsplat.py --scan-id roomscan2 --iters 400 --max-gaussians 120000
"""
import argparse
import json
import os
import shutil
import sys
import time
from pathlib import Path

os.environ.setdefault("PYTORCH_CUDA_ALLOC_CONF", "expandable_segments:True")
import numpy as np

WORKSPACE = Path(os.environ.get("SPLAT_LAB", "/workspace"))
OUTPUT = WORKSPACE / "output"
SCENES = WORKSPACE / "scenes"

SH_C0 = 0.28209479177387814
F_FLIP = np.array([1.0, -1.0, -1.0], np.float32)   # OpenCV world -> viewer (Y,Z neg)


def atomic_write_bytes(path: Path, data: bytes):
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_bytes(data)
    os.replace(tmp, path)


def write_3dgs_ply(path: Path, xyz, dc, opacity_logit, log_scale, quat):
    """Write the standard 17-property SH-deg-0 3DGS PLY (matches bake.py)."""
    n = xyz.shape[0]
    dtype = np.dtype([
        ("x", "f4"), ("y", "f4"), ("z", "f4"),
        ("nx", "f4"), ("ny", "f4"), ("nz", "f4"),
        ("f_dc_0", "f4"), ("f_dc_1", "f4"), ("f_dc_2", "f4"),
        ("opacity", "f4"),
        ("scale_0", "f4"), ("scale_1", "f4"), ("scale_2", "f4"),
        ("rot_0", "f4"), ("rot_1", "f4"), ("rot_2", "f4"), ("rot_3", "f4"),
    ])
    buf = np.empty(n, dtype=dtype)
    buf["x"], buf["y"], buf["z"] = xyz[:, 0], xyz[:, 1], xyz[:, 2]
    buf["nx"] = buf["ny"] = buf["nz"] = 0.0
    buf["f_dc_0"], buf["f_dc_1"], buf["f_dc_2"] = dc[:, 0], dc[:, 1], dc[:, 2]
    buf["opacity"] = opacity_logit
    buf["scale_0"], buf["scale_1"], buf["scale_2"] = log_scale[:, 0], log_scale[:, 1], log_scale[:, 2]
    buf["rot_0"], buf["rot_1"], buf["rot_2"], buf["rot_3"] = quat[:, 0], quat[:, 1], quat[:, 2], quat[:, 3]
    header = (
        b"ply\nformat binary_little_endian 1.0\n"
        + f"element vertex {n}\n".encode()
        + b"".join(f"property float {p[0]}\n".encode() for p in dtype.descr)
        + b"end_header\n"
    )
    atomic_write_bytes(path, header + buf.tobytes())


def quat_flip_x180(q):
    """Rotate gaussian orientations by 180deg about X (the F flip), wxyz layout.

    q_F (w,x,y,z) = (0,1,0,0);  q' = q_F (x) q  -> (-x, w, -z, y)."""
    w, x, y, z = q[:, 0], q[:, 1], q[:, 2], q[:, 3]
    return np.stack([-x, w, -z, y], axis=1)


def backproject_opencv(depth, conf, K, color, stride, conf_pct):
    """Lift one view's depth to OpenCV WORLD frame is done by caller via Rt;
    here we return CAMERA-frame points + colour + confidence (subsampled)."""
    H, W = depth.shape
    ys, xs = np.mgrid[0:H:stride, 0:W:stride]
    d = depth[ys, xs].astype(np.float32)
    c = conf[ys, xs].astype(np.float32)
    rgb = color[ys, xs]
    if conf_pct > 0:
        thr = np.percentile(c, conf_pct)
        m = c >= thr
        d, c, rgb, ys, xs = d[m], c[m], rgb[m], ys[m], xs[m]
    fx, fy, cx, cy = K[0, 0], K[1, 1], K[0, 2], K[1, 2]
    z = d
    x = (xs.astype(np.float32) - cx) * z / fx
    y = (ys.astype(np.float32) - cy) * z / fy
    cam = np.stack([x, y, z], axis=-1).reshape(-1, 3)
    return cam, rgb.reshape(-1, 3).astype(np.float32), c.reshape(-1)


def run(args):
    import cv2
    import torch
    import torch.nn.functional as Fn
    from gsplat import rasterization

    dev = "cuda"
    sdir = OUTPUT / args.scan_id
    scene = SCENES / args.scan_id
    poses = json.loads((sdir / "poses.json").read_text())
    K_all = np.array(poses["intrinsics"], np.float32)        # (V,3,3)
    Rt_all = np.array(poses["extrinsics"], np.float32)       # (V,3,4) w2c
    frame_paths = poses["frame_paths"]
    Hp, Wp = int(poses["H"]), int(poses["W"])
    depth = np.load(sdir / "depth.npy")                      # (V,H,W)
    conf = np.load(sdir / "conf.npy")
    V = depth.shape[0]
    print(f"refine {args.scan_id}: {V} views @ {Wp}x{Hp}", flush=True)

    # ---- build init point cloud in OpenCV world frame --------------------
    xyz_w, rgb_l, conf_l = [], [], []
    for i in range(V):
        img = cv2.cvtColor(cv2.imread(frame_paths[i]), cv2.COLOR_BGR2RGB)
        img = cv2.resize(img, (Wp, Hp), interpolation=cv2.INTER_AREA)
        cam, rgb, c = backproject_opencv(depth[i], conf[i], K_all[i], img,
                                         args.pixel_stride, args.conf_pct)
        R, t = Rt_all[i, :, :3], Rt_all[i, :, 3]
        world = (cam - t) @ R                # x_world = R^T (x_cam - t)
        xyz_w.append(world.astype(np.float32))
        rgb_l.append(rgb / 255.0)
        conf_l.append(c)
    xyz_w = np.concatenate(xyz_w)
    rgb_l = np.concatenate(rgb_l)
    conf_l = np.concatenate(conf_l)

    if xyz_w.shape[0] > args.max_gaussians:
        sel = np.random.default_rng(0).choice(xyz_w.shape[0], args.max_gaussians, replace=False)
        xyz_w, rgb_l, conf_l = xyz_w[sel], rgb_l[sel], conf_l[sel]
    N = xyz_w.shape[0]

    # k-NN scale init (Inria recipe)
    from sklearn.neighbors import NearestNeighbors
    nn = NearestNeighbors(n_neighbors=4, algorithm="kd_tree").fit(xyz_w)
    dists, _ = nn.kneighbors(xyz_w)
    scl = dists[:, 1:].mean(1).astype(np.float32) * args.scale_mult
    scl = np.clip(scl, 3e-3, 0.3)
    print(f"  init {N} gaussians  scale med={np.median(scl)*1000:.1f}mm", flush=True)

    # ---- params (optimise in the same unconstrained spaces the PLY stores)
    means = torch.tensor(xyz_w, device=dev, requires_grad=True)
    log_scales = torch.tensor(np.log(np.repeat(scl[:, None], 3, 1)), device=dev, requires_grad=True)
    quats = torch.zeros((N, 4), device=dev); quats[:, 0] = 1.0
    quats = quats.requires_grad_(True)
    op0 = np.clip(0.2 + 0.6 * (conf_l - conf_l.min()) / (conf_l.ptp() + 1e-6), 0.05, 0.95)
    opac = torch.tensor(np.log(op0 / (1 - op0)).astype(np.float32), device=dev, requires_grad=True)
    dc = torch.tensor(((rgb_l - 0.5) / SH_C0).astype(np.float32), device=dev, requires_grad=True)

    # ---- ground-truth views + w2c viewmats (OpenCV) ----------------------
    gts, viewmats, Ks = [], [], []
    for i in range(V):
        img = cv2.cvtColor(cv2.imread(frame_paths[i]), cv2.COLOR_BGR2RGB)
        img = cv2.resize(img, (Wp, Hp), interpolation=cv2.INTER_AREA).astype(np.float32) / 255.0
        gts.append(torch.tensor(img, device=dev))
        vm = np.eye(4, dtype=np.float32); vm[:3, :4] = Rt_all[i]
        viewmats.append(torch.tensor(vm, device=dev))
        Ks.append(torch.tensor(K_all[i], device=dev))
    viewmats = torch.stack(viewmats); Ks = torch.stack(Ks)

    opt = torch.optim.Adam([
        {"params": [means], "lr": args.lr_means},
        {"params": [log_scales], "lr": 0.005},
        {"params": [quats], "lr": 0.001},
        {"params": [opac], "lr": 0.05},
        {"params": [dc], "lr": 0.0025},
    ])
    torch.cuda.reset_peak_memory_stats()
    order = np.arange(V)
    t0 = time.monotonic()
    last_psnr = 0.0
    for it in range(args.iters):
        v = int(order[it % V])
        if it % V == 0:
            np.random.default_rng(it).shuffle(order)
        colors, alphas, info = rasterization(
            means, Fn.normalize(quats, dim=-1), torch.exp(log_scales),
            torch.sigmoid(opac), dc[:, None, :],
            viewmats[v:v + 1], Ks[v:v + 1], Wp, Hp,
            sh_degree=0, near_plane=0.01, far_plane=100.0, packed=True,
        )
        render = colors[0].clamp(0, 1)
        loss = (render - gts[v]).abs().mean()
        opt.zero_grad(set_to_none=True)
        loss.backward()
        opt.step()
        if it % args.log_every == 0 or it == args.iters - 1:
            with torch.no_grad():
                mse = ((render - gts[v]) ** 2).mean().item()
                last_psnr = -10.0 * np.log10(max(mse, 1e-8))
            print(f"  it {it:4d}  L1={loss.item():.4f}  PSNR={last_psnr:.2f}dB", flush=True)
    dt = time.monotonic() - t0
    vram = torch.cuda.max_memory_allocated() / 1e6
    print(f"  refined {args.iters} iters in {dt:.1f}s  peak VRAM {vram:.0f}MB  "
          f"final PSNR {last_psnr:.2f}dB", flush=True)

    # ---- export (OpenCV world -> viewer frame: flip Y,Z on pos + orient) --
    m = means.detach().cpu().numpy() * F_FLIP
    q = quat_flip_x180(Fn.normalize(quats, dim=-1).detach().cpu().numpy())
    ls = log_scales.detach().cpu().numpy()
    op = opac.detach().cpu().numpy()
    dcn = dc.detach().cpu().numpy()

    refined = scene / "refined.ply"
    write_3dgs_ply(refined, m, dcn, op, ls, q)
    shutil.copyfile(refined, scene / "scene.compressed.ply")
    shutil.copyfile(refined, scene / "hero.ply")
    # phone tier
    if N > args.phone_max:
        sel = np.random.default_rng(1).choice(N, args.phone_max, replace=False)
        write_3dgs_ply(scene / "phone.ply", m[sel], dcn[sel], op[sel], ls[sel], q[sel])
    else:
        shutil.copyfile(refined, scene / "phone.ply")

    # stamp scene-meta so the dashboard shows the ✦refined badge
    mp = scene / "scene-meta.json"
    meta = json.loads(mp.read_text()) if mp.exists() else {}
    meta.update({"refined": True, "refine_iters": args.iters,
                 "refine_psnr_db": round(float(last_psnr), 2),
                 "n_points": int(N)})
    atomic_write_bytes(mp, json.dumps(meta, indent=2).encode())

    print(f"\nREFINED scan_id={args.scan_id} points={N} iters={args.iters} "
          f"psnr={last_psnr:.2f} vram_mb={vram:.0f}", flush=True)


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--scan-id", required=True)
    p.add_argument("--iters", type=int, default=400)
    p.add_argument("--max-gaussians", type=int, default=120_000)
    p.add_argument("--pixel-stride", type=int, default=2)
    p.add_argument("--conf-pct", type=float, default=25.0)
    p.add_argument("--scale-mult", type=float, default=2.0)
    p.add_argument("--lr-means", type=float, default=0.0008)
    p.add_argument("--phone-max", type=int, default=150_000)
    p.add_argument("--log-every", type=int, default=50)
    args = p.parse_args()
    run(args)
