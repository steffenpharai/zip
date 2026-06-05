# splat-lab — DA3 → 3D Gaussian Splat → browser

Frontier-2026 vision pipeline: C615 webcam capture → Depth Anything 3 Small
→ backproject to a 3DGS PLY → SuperSplat Viewer in any modern browser.

**100% Apache-2.0 / MIT.** Commercial-clean.

## Status — known broken render

**The PLY produced by `bake.py` is structurally valid but renders BLACK in
the SuperSplat WebGPU viewer.** Root cause analysis is in
[REPORT.md.pc-mirror](./REPORT.md.pc-mirror) under "What's broken". TL;DR:

> DA3-backprojected gaussians live on a sampled 2.5D depth manifold.
> Adjacent pixels become near-coplanar gaussians. PlayCanvas's WebGPU
> compositor multiplies transmittance per layer (T *= 1−α). With dense
> co-planar layers at high opacity, transmittance underflows to ~0 after
> the first few layers and everything behind renders black. The rasterizer
> is mathematically correct — **the data is the failure mode**.

## The fix (not yet verified)

A k-NN-init refactor of `bake.py` exists at
[`scripts/bake.py.knn-init-from-pc`](./scripts/bake.py.knn-init-from-pc) —
459 lines, replaces the per-pixel stride-derived scale with average distance
to K=3 nearest neighbors plus jitter (the standard 3DGS init).

To verify:
1. Copy the new bake to the Jetson as `bake.py`
2. Re-run the launcher: `./launcher.sh <scan_id>`
3. Open `http://localhost:8090/<scan_id>/` and confirm the splat renders

```bash
scp scripts/bake.py.knn-init-from-pc zip-jetson:~/splat-lab/scripts/bake.py
ssh zip-jetson "cd ~/splat-lab && ./launcher.sh livedemo"
```

## What works today

| Component | State |
|---|---|
| nginx :8090 / :8443 with COOP/COEP/CORP isolation | ✅ |
| `live_stream.py` daemon (RGB + DAv2 depth + YOLO + telemetry @ ~7 FPS) | ✅ |
| `capture.py` (v4l2 lockdown + YOLO11n score-gate frame selector) | ✅ |
| DA3-Small inference (~250 ms / 504² FP16, 278 MB peak) | ✅ |
| SuperSplat Viewer builds + renders test cubes | ✅ |
| `annotate.py` (YOLO bboxes → world-space hotspots via DA3 extrinsics) | ✅ |
| DA3 → PLY (`bake.py`) — produces valid PLY | ✅ |
| **PLY renders in browser** | ❌ k-NN-init fix unverified |

## Where the heavy stuff lives

Gitignored (lives on the Jetson):

- `models/` (132 MB DA3 + AnySplat weights, downloaded on Dockerfile build)
- `supersplat-viewer/` (279 MB built viewer)
- `scenes/`, `output/`, `frames/`, `captures/`, `logs/`

To re-fetch on a fresh Jetson, see [MISSION.md](./MISSION.md) for the
day-by-day setup recipe.

## Mirror files

- `README.md.pc-mirror` — the original PC-side mirror README (pre-restructure)
- `REPORT.md.pc-mirror` — the session-handoff REPORT with measured numbers,
  root-cause analysis of the black render, and the k-NN-init plan
- `MISSION.md` — the original agent brief (frontier-lab quality bar)
