# Mission: live 3D-Gaussian-Splat walkthrough — Jetson + C615 → SuperSplat in a browser

You are an autonomous agent running ON a Jetson Orin Nano Super. You will
build a frontier-2026 pipeline that:

1. **Captures** 60–180 s of slow handheld video from the Logitech C615 webcam
   (the only sensor — no IMU, no depth camera).
2. **Reconstructs** a 3D Gaussian Splat of the scene on-device with **Depth
   Anything 3 Small** (Apache 2.0) for poses+depth+coarse splats, then refines
   with **gsplat 1.5.3** (Apache 2.0, dusty-nv container) using the **3DGUT
   rasterizer** to correct the C615's rolling shutter.
3. **Two-stage live**: a fast feed-forward refine (AnySplat, MIT) emits a
   coarse `live.sog` every ~30 s for the "polaroid-developing" UX, while
   gsplat runs a 15–45 min background refine that emits `hero.sog` (300k
   splats) and `phone.sog` (150k splats).
4. **Compresses** with `@playcanvas/splat-transform` (MIT) into streamed SOG.
5. **Serves** `SuperSplat Viewer v1.26.2` (MIT) as static files from nginx on
   the Jetson, with Walk Mode + WASD + WebXR.
6. **Auto-annotates**: project the existing YOLO11n TRT detector's per-frame
   bboxes through DA3's extrinsics into world coordinates → clickable
   hotspots in the browser viewer.

A user opens `http://jetson.local:8090/<scan_id>/` in any modern browser (or
Quest headset) and walks through the scene.

## Hardware / software (verified — DO NOT re-investigate)

- Jetson Orin Nano Super 8 GB unified memory, JetPack 6.2 (L4T R36.4.7),
  CUDA 12.6, TensorRT 10, Ampere SM 8.7, MAXN_SUPER power mode.
- Python 3.10.12, Docker 29.5.2, Node 24.16, npm 11.13, nginx 1.18, ffmpeg
  installed by previous setup. `~/jetson-containers` cloned from dusty-nv.
- 8 GB NVMe swap added at `/swap8g` (persisted via fstab).
- 68 GB free disk.
- C615 enumerates at `/dev/video0` and `/dev/video1` (MJPEG capable).
- The zip-brain.service systemd unit is INACTIVE during splat work. Don't
  start it. (It owns `/dev/video0` when active.)
- Already shipped in sibling labs (reuse, don't re-build):
  - `~/depth-lab/depth.py` — DepthAnything V2 Small ONNX/CUDA, 6.98 FPS,
    `DepthEstimator.estimate(bgr) -> HxW float32`. **Optional** — DA3 will
    supersede.
  - `~/perception-lab/detect.py` + `yolo11n_fp16.engine` — YOLO11n TRT FP16,
    `Detector.detect(bgr) -> [{label, confidence, box}]` in original pixels.
    **Used by capture.py and annotate.py.**

## Frontier 2026 stack — DO NOT substitute without consulting the LICENSES section

| Stage | Component | License | URL |
|---|---|---|---|
| Capture | v4l2 + ffmpeg + custom selector | (sys) | n/a |
| Geometry foundation | Depth Anything 3 Small (80M, ICLR'26 oral) | **Apache 2.0** | https://github.com/ByteDance-Seed/depth-anything-3 |
| Live coarse splat | AnySplat (SIGGRAPH Asia 2025) | **MIT** | https://github.com/InternRobotics/AnySplat |
| Splat refine | gsplat 1.5.3 (3DGUT rasterizer upstream) | **Apache 2.0** | https://github.com/dusty-nv/jetson-containers/tree/master/packages/cv/3d/gaussian_splatting/gsplat |
| Compress + LOD | @playcanvas/splat-transform 2.0 | **MIT** | https://github.com/playcanvas/splat-transform |
| Browser viewer | SuperSplat Viewer v1.26.2 | **MIT** | https://github.com/playcanvas/supersplat-viewer |
| Annotations editor (optional) | SuperSplat Editor v2.27.4 | **MIT** | https://github.com/playcanvas/supersplat |
| Compressed delivery (optional) | Niantic SPZ | **MIT** | https://github.com/nianticlabs/spz |

## LICENSES — commercial-intent build

Every component above is Apache-2.0 or MIT. The user has commercial intent.
**Banned from this build** (CC-BY-NC weights or research-only):
- VGGT, VGGT-Ω, Pi3 / Pi3X weights, MASt3R-SLAM, Fast3R, Cut3R, UniDepth
- DA3-Large / DA3-Giant (CC-BY-NC); only DA3-Small / DA3-Base allowed
- Anything from FAIR-NC license

If a verified shortcut appears that's research-only, archive it but **do not
ship it in this lab's pipeline**.

## HARD CONSTRAINTS

- Work ONLY in `~/splat-lab/`. DO NOT touch `~/zip/`, `~/depth-lab/`,
  `~/perception-lab/`, or `~/jetson-containers/` (read-only reference).
- Reuse `~/perception-lab/yolo11n_fp16.engine` and `~/perception-lab/detect.py`
  in-place — don't copy.
- Make your own `~/splat-lab/.venv` with `--system-site-packages` so you
  inherit system numpy/opencv. Pin Python deps in `requirements.txt`.
- Disk swap at `/swap8g` exists — verify with `swapon --show` before training.
- Before any gsplat training session: `sudo systemctl set-default
  multi-user.target` to free ~700 MB by killing the desktop. (Restore with
  `graphical.target` when done.)
- Don't start `zip-brain.service` during splat work (it grabs `/dev/video0`).

## Directory layout (already created)

```
~/splat-lab/
  MISSION.md       # this file
  REPORT.md        # write at the end with measured numbers
  requirements.txt
  launcher.sh      # entry point for the autonomous run
  .venv/           # --system-site-packages
  scripts/
    setup_env.sh         # one-time env setup
    smoke_browser.sh     # Day 1: nginx + SuperSplat Viewer + sample sog
    pull_gsplat.sh       # Day 2: dusty-nv gsplat container
    build_xformers.sh    # Day 3: xformers source build
    capture.py           # Day 4: C615 → keyframes + YOLO log
    da3_infer.py         # Day 5: DA3 → poses + depth + splat init
    train_gsplat.py      # Day 5: gsplat refine → PLY
    sog_export.py        # Day 5: PLY → hero.sog + phone.sog
    annotate.py          # Day 6: YOLO bboxes → hotspots.json
    collision_glb.py     # Day 6: poisson recon → collision.glb
    ws_reload.py         # Day 5: WebSocket reload broadcaster
    bench.py             # measure end-to-end timing + RAM
  captures/<scan_id>/    # raw video + extracted keyframes + detections.jsonl
  frames/<scan_id>/      # selected keyframes (per capture)
  models/                # downloaded weights (DA3, AnySplat, etc.)
  output/<scan_id>/      # PLY, sog, settings.json, hotspots.json, collision.glb
  viewer/                # SuperSplat Viewer static bundle (deployed to nginx)
  scenes/                # per-scan symlinks for the nginx root
  logs/                  # per-day logs of agent runs
```

## Day-by-day plan (work top-down; each day's REPORT-fragment appends to
REPORT.md)

### Day 1 — Browser smoke test
- Clone `playcanvas/supersplat-viewer`, build with `npm install && npm run build`.
- Copy `dist/` to `~/splat-lab/viewer/`.
- Configure nginx site at `/etc/nginx/sites-available/splat-lab` serving
  `~/splat-lab/scenes/` on port **8090** (the brain uses 8080).
- Download any sample `.sog` (e.g. SuperSplat homepage demo) into a
  `scenes/sample/` dir, write `settings.json` with `walkMode: true`.
- Confirm `http://jetson.local:8090/sample/` loads in a desktop browser, Walk
  Mode toggles, WASD works.
- Append "Day 1" section to REPORT.md with screenshots and a `curl -sI` check.

### Day 2 — gsplat container
- `~/jetson-containers/run.sh $(autotag gsplat)` — pulls the prebuilt image.
- Train the gsplat README sample (a downloadable tutorial scene) for **7k
  iters**, `--max_gaussians 200000 --data_device cpu`.
- `npm i -g @playcanvas/splat-transform` → convert output PLY to streamed SOG.
- Deploy to `~/splat-lab/scenes/gsplat-tutorial/` — view in browser.
- Record wall time, peak RSS (via `tegrastats`), final PSNR.

### Day 3 — DA3 + xformers spike (Day-1 MAKE-OR-BREAK)
- Read `scripts/build_xformers.sh` (recipe written by another agent — uses
  johnnynunez/jetson-containers xformers Dockerfile or upstream
  `pip install xformers --index-url https://pypi.jetson-ai-lab.io/...`).
- Time-box 8 hours. If wheel install works → great. If not → source build.
- Clone `ByteDance-Seed/depth-anything-3`. Download DA3-Small weights from HF.
- Run on 5 test images (any indoor scene). **Compare output point cloud
  against the model's published reference (paper Fig 4 or HF demo)** before
  trusting the pipeline. If outputs differ → xformers/SDPA monkey-patch is
  wrong → abort and re-investigate.
- Record DA3 wall time per image at 518² FP16, peak RSS.

### Day 4 — capture.py with YOLO11n-gated frame selector
- Use `gstreamer` or `cv2.VideoCapture` on `/dev/video0` at 1280×720 MJPEG.
- Lock C615 settings via `v4l2-ctl` (autofocus off, fixed exposure, fixed WB).
- For each frame: run YOLO11n TRT (reuse `~/perception-lab/detect.py`), log
  `{frame_id, ts, bboxes:[…]}` to `captures/<scan_id>/detections.jsonl`.
- Frame-selection score = motion_blur_var (Laplacian) × yolo_bbox_stability
  (IoU vs previous frame). Keep top-N per second (~2 fps target).
- Output: `frames/<scan_id>/frame_NNNNN.jpg` + `detections.jsonl`.
- Test: walk through one room for 90 s, confirm ~150 keyframes selected.

### Day 5 — End-to-end bake
- Pipeline: `frames/` → `da3_infer.py` → `poses.json + seed.ply` →
  `train_gsplat.py` (live snapshot every 30 s via `--checkpoint_interval`) →
  `sog_export.py` → atomic overwrite of `scenes/<scan_id>/live.sog`,
  `hero.sog`, `phone.sog`.
- `ws_reload.py`: tiny WebSocket server on :8091 broadcasting `reload` events
  when files change. SuperSplat Viewer iframe reloads on receipt.
- Stage A target: `live.sog` updated every 30 s (early iterations + AnySplat
  snapshot).
- Stage B target: `hero.sog` final at 7k–15k iters.
- Record end-to-end wall time + LPIPS-eyeball quality.

### Day 6 — Annotations + collision
- `annotate.py`: read `detections.jsonl` + `poses.json` (DA3 output) + per-frame
  depth. For each detection: unproject bbox center → world coord. Cluster
  same-class detections (DBSCAN ε=0.3 m). Emit `hotspots.json`.
- Inject `hotspots.json` into SuperSplat Viewer's `settings.json`. Confirm
  hotspots are clickable in browser.
- `collision_glb.py`: poisson reconstruction from DA3 depth maps (open3d) →
  low-poly mesh → export `collision.glb`. Reference via `?collision=…` URL
  param in SuperSplat Viewer.

### Day 7 — Quest browser test + cross-browser QA
- Test SuperSplat Viewer on:
  - Chromium on a laptop (WebGPU + WebGL2)
  - Firefox 141+ (WebGL2)
  - Safari 17.4+ (WebGPU best-effort)
  - Quest 1 Meta Browser (WebGL2 only, expect <30 FPS on phone.sog tier)
  - Quest 2/3 if available (WebGPU + WebXR Walk Mode)
- Document FPS per browser, splat-tier choice per device, failure modes.
- Finalize REPORT.md with: total wall-clock, splat counts, file sizes,
  per-stage RAM peak, per-browser FPS, gotchas, and the EXACT
  reproducible commands.

## Deliverables in `~/splat-lab/`

- **`REPORT.md`** — measured numbers (capture/recon/serve timings, RAM, splat
  counts, file sizes, per-browser FPS); the gotcha catalog; the exact recipe
  another agent could follow blindly to reproduce.
- **`scripts/`** — every script listed above, working, executable, with
  `--help` and unit-test smoke checks.
- **`scenes/sample/`** + **`scenes/<your-first-scan>/`** — at least two
  browsable walkthrough URLs.
- **`requirements.txt`** with resolved exact versions.
- **`launcher.sh`** that runs the full pipeline end-to-end for one scan_id.
- Final stdout line: `MISSION COMPLETE`

## Frontier-lab quality bar

This isn't a hobby script. Match the bar of a research lab shipping
reproducible work:

- Pin every dependency version. No "latest" tags.
- Atomic file writes (tmpfile + rename) so a browser polling `live.sog` never
  reads a torn write.
- All long-running stages emit per-second tegrastats samples to `logs/`.
- Every script is idempotent and resumable. Re-running `train_gsplat.py`
  resumes from the last checkpoint.
- Output PLY archived; SOG is regenerated, never the source of truth.
- One script (`launcher.sh`) reproduces a full scan end-to-end with one
  argument (the scan_id).
- REPORT.md has measured (not extrapolated) numbers and a "what surprised us"
  section.

Be fully autonomous. You have skip-permissions on the Jetson; the brain
service is off; the camera is yours. Stay inside `~/splat-lab/`.
