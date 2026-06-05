# CLAUDE.md — splat-lab guidance

You're working on the 3D Gaussian Splat reconstruction pipeline at
`jarvis/splat-lab/`. For repo rules see [`/AGENTS.md`](../../AGENTS.md);
for vision-lab framing see [`../README.md`](../README.md).

## State of the world — black render RESOLVED 2026-06-05

**The black render was the VIEWER, not the data.** The DA3→PLY is fine; it
renders pure black in PlayCanvas SuperSplat (WebGPU front-to-back compositor)
but renders as a real room in **mkkellogg/GaussianSplats3D** (back-to-front,
CPU sort). Verified on the live Jetson by loading one PLY in both viewers.

`bake.py` now deploys the mkkellogg viewer (`scripts/mk_viewer.html`) as the
default **index.html + mk.html**; SuperSplat is kept as `supersplat.html` for
future TRAINED splats. Critical viewer setting under nginx COOP/COEP:
`gpuAcceleratedSort:false` + `sharedMemoryForWorkers:false` (the SAB/GPU sort
path renders black under cross-origin isolation). Viewer libs vendored once at
`scenes/_lib/`.

To rebuild a scene end-to-end:
```bash
ssh zip-jetson "cd ~/splat-lab && ./launcher.sh <scan_id> 90 8"
# open http://localhost:8090/<scan_id>/ via the jetson-splat SSH tunnel
```

**Remaining work is quality, not correctness:** the livedemo capture had no
parallax (DA3 poses ~identity), so it's a thin depth-slab. Slow-walk the C615
1–2 m for a real reconstruction; then optionally gsplat 1.5.3 refine
(Apache-2.0, already in the container) for trained-splat quality.

Full resolution detail: the `reference-splat-viewer-choice` memory.
Note: the k-NN-init was kept but was NOT the fix; `bake.py.knn-init-from-pc`
has been promoted into `bake.py`.

## Where things live

| What | Path | Notes |
|---|---|---|
| Active capture/bake/annotate pipeline | `scripts/` | Most ship-ready |
| Container Dockerfile | `Dockerfile.splat` | dustynv/l4t-pytorch + DA3 + gsplat + xformers stubs (~15.5 GB) |
| Launcher (end-to-end) | `launcher.sh` | `./launcher.sh <scan_id> [duration_s] [max_views]` |
| Live dashboard HTML | `live.html` | Served by nginx at :8090 |
| Mission brief | `MISSION.md` | Day-by-day setup recipe |
| Session handoff | `REPORT.md.pc-mirror` | Measured numbers + black-render analysis + k-NN fix plan |
| **Old PC mirror notes** | `README.md.pc-mirror` | Pre-restructure mirror README |

## Where things live (Jetson side)

Heavy artifacts NEVER come to PC; they live on the Jetson at `~/splat-lab/`:

- `models/` (132 MB) — DA3 + AnySplat weights
- `supersplat-viewer/` (279 MB) — built viewer
- `scenes/`, `output/`, `frames/`, `captures/`, `logs/` — per-scan output

All gitignored. To populate from Jetson:

```bash
ssh zip-jetson "tar czf /tmp/splat-lab.tgz \
  --exclude=supersplat-viewer --exclude=models --exclude=scenes \
  --exclude=output --exclude=frames --exclude=captures --exclude=logs \
  --exclude=__pycache__ --exclude=.venv splat-lab/"
scp zip-jetson:/tmp/splat-lab.tgz /tmp/
tar xzf /tmp/splat-lab.tgz -C jarvis/
```

## Sync pattern

The Jetson is the source of truth for splat-lab while it's active WIP.
Edit on PC, push to Jetson:

```bash
scp jarvis/splat-lab/scripts/bake.py zip-jetson:~/splat-lab/scripts/
```

When you finish a Jetson session, pull back any new/changed scripts:

```bash
rsync -av --exclude=models/ --exclude=scenes/ --exclude=output/ \
      --exclude=__pycache__/ --exclude=.venv/ \
      zip-jetson:~/splat-lab/ jarvis/splat-lab/
# (rsync not on Windows; use the tar+scp recipe above)
```

## Component pipeline (per MISSION.md)

```
C615 webcam → capture.py (v4l2 lockdown + YOLO11n score-gate)
            ↓
            frames/<scan>/*.jpg + detections.jsonl
            ↓
       bake.py (in splat-lab:latest container)
       • DA3-Small (FP16) per-frame depth + intrinsics + extrinsics
       • Backproject every Mth pixel → world coords
       • Color from source pixel
       • Output: 3DGS PLY in scenes/<scan>/scene.compressed.ply
            ↓
       annotate.py (host venv)
       • YOLO bboxes → DA3 extrinsics → world coords → DBSCAN cluster
       • Inject hotspots into SuperSplat settings.json
            ↓
       SuperSplat Viewer (PlayCanvas WebGPU)
       • Loads PLY from nginx :8090
       • Walk Mode + WASD + WebXR
       • Renders annotation hotspots
```

## Frontier-lab quality bar (from MISSION.md)

This pipeline is not a hobby script. It must:

- Pin every dependency version. No `latest` tags.
- Atomic writes (tmpfile + rename) so browsers polling a `live.ply`
  never read a torn write.
- All long-running stages emit per-second tegrastats to `logs/`.
- Every script is idempotent and resumable. Re-running `train_gsplat.py`
  resumes from the last checkpoint.
- PLY archived as source of truth; SOG regenerated.
- One script (`launcher.sh`) reproduces a full scan end-to-end with
  one argument (the scan_id).

## Gotchas

- **Black render in SuperSplat.** Root cause: dense co-planar Gaussians
  on the DA3 depth manifold collapse PlayCanvas's WebGPU tile compositor.
  Fix: k-NN init. See REPORT.md.
- **HTTP isn't secure context.** Chrome won't enable WebGPU or
  SharedArrayBuffer on `http://192.168.55.1:8090/`. Must SSH-tunnel to
  `localhost:8090`. The `.claude/launch.json` `jetson-splat` entry
  handles this.
- **nginx `add_header` strips parent.** Re-emit COOP/COEP/CORP in every
  `location` block; don't rely on inheritance.
- **dustynv container CUDA-torch backup.** Any `pip install` in the
  container can override the CUDA torch with PyPI CPU-only. Always
  back up `torch*` first, install, then restore (see Dockerfile.splat).
- **ResizeObserver race in SuperSplat init.** Fixed with rAF defer in
  the viewer source. Don't revert.

## License rule

**100% Apache-2.0 or MIT in this pipeline.** Commercial intent.
Banned: VGGT, VGGT-Ω, Pi3/Pi3X weights, MASt3R-SLAM, Fast3R, Cut3R,
UniDepth, DA3-Large, DA3-Giant (CC-BY-NC), anything FAIR-NC.

If you find a tempting research-only model, **archive but do not ship**.

## When you're done

- Confirm the pipeline still produces a valid PLY (validate_ply.py).
- Confirm SuperSplat viewer loads it without errors (browser console).
- If you fixed the black render: take a before/after screenshot for
  the commit message.
- Update `REPORT.md.pc-mirror` (or roll up into a single REPORT.md if
  you're consolidating the pc-mirror naming).
- Push changes to Jetson; verify next launcher run produces the same.

## What NOT to touch without thinking

- `live_stream.py` — the live dashboard daemon. Touching it can blank
  the RGB+depth+YOLO panes for everyone.
- `Dockerfile.splat` — rebuilding the container takes 30-60 min. Test
  in a one-off `pip install` first.
- nginx site config (on Jetson at `/etc/nginx/sites-available/splat-lab`)
  — COOP/COEP/CORP headers are easy to get wrong; the viewer fails
  silently when isolation is broken.
