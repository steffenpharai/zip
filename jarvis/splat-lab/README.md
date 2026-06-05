# splat-lab — DA3 → 3D Gaussian Splat → browser

Frontier-2026 vision pipeline: C615 webcam capture → Depth Anything 3 Small
→ backproject to a 3DGS PLY → SuperSplat Viewer in any modern browser.

**100% Apache-2.0 / MIT.** Commercial-clean.

## Status — RESOLVED 2026-06-05 (renders on the live Jetson)

**The black render was the VIEWER, not the data.** The exact same
`scene.compressed.ply` renders pure black in PlayCanvas SuperSplat (WebGPU
front-to-back tile compositor) but renders as a recognizable room in
**mkkellogg/GaussianSplats3D** (Three.js, back-to-front). Proven on-device by
loading one PLY in both viewers.

Two things had to be true:
1. **Use a back-to-front compositor.** SuperSplat's front-to-back path
   saturates on dense low-opacity coplanar DA3 splats → black.
2. **Force the CPU sort.** Under nginx's COOP/COEP cross-origin isolation,
   mkkellogg defaults to a SharedArrayBuffer + GPU sort worker that *also*
   renders black here. The viewer sets `gpuAcceleratedSort:false` +
   `sharedMemoryForWorkers:false` to use the CPU radix sort that works.

`bake.py` now deploys the mkkellogg viewer as **index.html** (and `mk.html`)
by default, keeping SuperSplat as `supersplat.html` for future *trained*
(gsplat-refined) splats, which do render in its compositor. Opacity defaults
were raised to 0.45–0.90 (the old 0.10–0.35 was a SuperSplat workaround).

Run it:
```bash
ssh zip-jetson "cd ~/splat-lab && ./launcher.sh <scan_id> 90 8"
# then, through the jetson-splat SSH tunnel:
#   http://localhost:8090/<scan_id>/
```

### The real quality limiter — capture parallax

`output/livedemo/poses.json` showed DA3 returned near-identity poses
(per-view translation 0.14–6.12 mm): the camera barely moved, so DA3 fell
back to ~monocular and produced a thin depth-slab. **For a real
reconstruction, slow-walk the C615 1–2 m over 60–90 s.** The genuine frontier
quality step after that is a gsplat 1.5.3 photometric refine (Apache-2.0,
already in the container).

> Note: `bake.py.knn-init-from-pc` has been promoted into `bake.py`; the k-NN
> init was kept but it was *not* the fix — the viewer was.

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
