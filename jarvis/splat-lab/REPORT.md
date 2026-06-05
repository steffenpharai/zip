# splat-lab REPORT — DA3 → 3DGS → browser, RESOLVED 2026-06-05

Frontier-2026 vision pipeline on a Jetson Orin Nano Super: Logitech C615 →
Depth-Anything-3-Small → 3D Gaussian Splat PLY → browser walkthrough, with a
live RGB+depth+YOLO dashboard. **100% Apache-2.0 / MIT** (commercial-clean).

This REPORT supersedes `REPORT.md.pc-mirror` (kept for history). It documents
the resolution of the long-standing "black render" and the full live pipeline.

---

## TL;DR — what was wrong and what fixed it

The DA3-backprojected PLY was **fine the whole time**. The black screen was the
**viewer**, in two layers, both proven on-device by loading one PLY in two
viewers:

| Viewer | Result on the same `scene.compressed.ply` |
|---|---|
| PlayCanvas SuperSplat v1.26.2 / Engine v2.19.2 (WebGPU, front-to-back tile compositor) | **pure black** |
| mkkellogg/GaussianSplats3D 0.4.7 (Three.js, WebGL2, back-to-front) | **renders the room** |

1. **Use a back-to-front compositor.** SuperSplat's front-to-back tile
   compositor saturates/early-terminates on dense, low-opacity, near-coplanar
   DA3 splats → black. mkkellogg composites back-to-front → renders.
2. **Force the CPU sort.** Under nginx's COOP/COEP cross-origin isolation,
   mkkellogg defaults to a SharedArrayBuffer + GPU-sort worker that *also*
   renders black here. Setting `gpuAcceleratedSort:false` +
   `sharedMemoryForWorkers:false` selects the CPU radix sort that works.

The previously-theorized causes were wrong: the k-NN-init "fix" had already
shipped and made no difference; the transmittance-underflow bisect was
contaminated by a `make_hybrid_ply.py` header bug (double `\n` after
`end_header`).

---

## The pipeline as it ships now

```
C615 ──► capture.py (v4l2 lockdown + YOLO11n score-gate) ──► frames/ + detections.jsonl
                                                                │
                                                                ▼
   bake.py (splat-lab:latest container)                         │
     • DA3-Small FP16  →  per-view depth + K + extrinsics(w2c) + conf
     • backproject every 2nd pixel → world coords (OpenCV→viewer Y/Z flip)
     • k-NN scale init (Inria recipe) + position jitter
     • opacity from confidence  →  3DGS PLY (17-prop, SH deg 0)
     • deploys mkkellogg viewer as index.html + mk.html  (SuperSplat → supersplat.html)
                                                                │
                              ┌─────────────────────────────────┤
                              ▼                                  ▼
   render_ply.py (poster)                          refine.sh → train_gsplat.py (Stage B)
     • headless gsplat render                         • gsplat 1.5.3 photometric refine
     • scenes/<id>/render_*.png                       • Adam on means/scale/quat/op/color
                              │                        • overwrites scene.compressed.ply
                              ▼                          stamps refined:true
   annotate.py (YOLO → world-space hotspots)
                              │
                              ▼
   nginx :8090 (COOP/COEP/CORP)  ──►  dashboard (scenes/index.html = live.html)
     • /live/* proxied to live_stream.py :8092 (RGB+YOLO, DAv2 depth, tegrastats, /scenes)
     • /<scan>/  walkthrough (mkkellogg CPU-sort viewer)
```

View via the `jetson-splat` SSH tunnel (HTTP-from-LAN-IP is not a secure
context): `ssh -L 8090:127.0.0.1:8090 -N zip-jetson` → `http://localhost:8090/`.

---

## Commands

```bash
# Full capture → bake → poster → annotate (SLOW-WALK the camera 1–2 m for parallax)
ssh zip-jetson "cd ~/splat-lab && ./launcher.sh <scan_id> 90 8"

# Optional Stage B crisp pass (Apache gsplat refine)
ssh zip-jetson "cd ~/splat-lab && ./refine.sh <scan_id> 400 120000"

# Headless render (objective, browser-independent quality check / dashboard poster)
#   (run inside splat-lab:latest) python3 scripts/render_ply.py --scan-id <id> --views 3

# View
ssh -L 8090:127.0.0.1:8090 -N zip-jetson    # then http://localhost:8090/
```

---

## Measured numbers (2026-06-05, on the Orin Nano Super 8 GB)

| Stage | Number |
|---|---|
| DA3-Small inference | ~250 ms/frame @ 504², peak 531–874 MB VRAM (4–8 views) |
| Bake (capture→PLY) | ~13–23 s; 105k–211k splats |
| End-to-end capture→PLY (launcher) | ~38–60 s |
| gsplat refine (roomscan2, 250 iters, 120k) | **PSNR 16.94 → 34.35 dB**, ~0.06 s/iter, **peak 98 MB VRAM** |
| gsplat CUDA-extension JIT (first run) | ~370 s, then cached at `.gsplat-cache/` |
| Viewer load (105k–120k PLY) | 1–2 s in mkkellogg |
| Live dashboard | RGB+YOLO ~6.7 FPS, DAv2 depth ~6.7 FPS, ~16 W |

### Server-side render coverage/brightness (diagnosis output)
- livedemo (raw bake, no parallax): 98–100% coverage, brightness 59–82/255.
  Reads as a room only from the capture viewpoint; a blue blob off-axis.
- roomscan2 (refined): 62–77% coverage, brightness 71–76/255. Reads as a real
  room (window, doorway, framed picture, chair) from an off-axis orbit.

---

## The remaining quality limiter — capture parallax (NOT code)

DA3 returns near-identity extrinsics when the camera doesn't move. Both test
captures had a **<6 mm camera baseline** (livedemo 0.14–6.1 mm, roomscan2
5 mm) because the C615 was physically stationary — so DA3 falls back to
~monocular and produces a thin 2.5D depth slab. The pipeline is correct; the
*input* needs motion.

**For a genuinely walkable reconstruction: slow-walk the C615 1–2 m over
60–90 s during capture.** Then `refine.sh` triangulates real 3D structure
instead of merely sharpening a slab.

DA3 extrinsics are **w2c** (OpenCV/COLMAP). `bake.py` historically treated them
as c2w; this is harmless at near-identity poses but `train_gsplat.py` does it
correctly (`x_world = Rᵀ(x_cam − t)`, w2c viewmats, Y/Z flip on export).

---

## Frontier research (June 2026) — what's license-clean for Orin 8 GB

| Option | License (code / weights) | Fits 8 GB | Verdict |
|---|---|---|---|
| DA3-Small backproject + k-NN | Apache / Apache | ✅ | shipped (init) |
| **gsplat 1.5.3 refine** | **Apache / —** | ✅ (98 MB) | **shipped (Stage B)** |
| mkkellogg/GaussianSplats3D viewer | MIT | ✅ | shipped (default viewer) |
| AnySplat | MIT code / **CC-BY-NC weights (VGGT-1B fine-tune)** + ~886M params | ❌ | **NO-GO** (NC taint + too big) |
| InstantSplat | NVIDIA / **MASt3R CC-BY-NC-SA** | ~ | **NO-GO** (NC taint) |
| DA3-Small GS head | — | — | not available (GS head only on DA3-Large/Giant, CC-BY-NC) |

NVIDIA 3DGUT (Apache, in gsplat 1.5.x) is a future lever for the C615's
rolling shutter, not a fix for the (now-resolved) black render.

---

## Dashboard (scenes/index.html ← live.html)

- Live RGB + YOLO11n bbox overlay, DAv2 INFERNO depth, tegrastats telemetry.
- **3D walkthrough panel**: shows the server-side gsplat **render poster**
  (guaranteed visible), click-through to the live mkkellogg viewer.
- **Scene picker** (`/live/scenes` endpoint): enumerates baked scenes with
  point count / size / age, defaults to the newest **✦refined** scene.
- **Capture how-to** with the slow-walk-for-parallax tip + the `refine.sh` note.

---

## Files

| File | Role |
|---|---|
| `scripts/bake.py` | DA3 → 3DGS PLY (k-NN init); deploys mkkellogg viewer |
| `scripts/mk_viewer.html` | mkkellogg viewer page (CPU sort, COEP-safe) |
| `scripts/train_gsplat.py` | Stage B gsplat 1.5.3 photometric refiner |
| `scripts/render_ply.py` | headless gsplat render → PNG poster / QA |
| `scripts/live_stream.py` | dashboard daemon (RGB/depth/tegra/`/scenes`) |
| `scripts/annotate.py` | YOLO bboxes → world-space hotspots |
| `launcher.sh` | capture → bake → poster → annotate |
| `refine.sh` | Stage B refine + poster (persistent JIT cache) |
| `live.html` | dashboard (deployed to `scenes/index.html`) |
| `scenes/_lib/` | vendored three.module.js + gaussian-splats-3d.module.js |

`HANDOFF COMPLETE — black render resolved, refine + dashboard live, parallax is the remaining (capture-side) quality lever.`
