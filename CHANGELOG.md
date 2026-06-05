# Changelog

Every commit is in git; this file calls out only the notable shipped
milestones. V1 history is preserved at the
[`v1-archive`](https://github.com/steffenpharai/zip-v1-archive/tree/v1-archive)
tag on `steffenpharai/zip-v1-archive`.

## [Splat black-render resolved + gsplat refine + dashboard integration] — 2026-06-05

The Jarvis `splat-lab` 3D-Gaussian-Splat pipeline went from "renders black in
the browser" to a live, viewable walkthrough integrated into the dashboard.
All Apache-2.0 / MIT.

- **Root cause (proven on the live Jetson):** the black render was the
  **viewer**, not the data. The same `scene.compressed.ply` renders black in
  PlayCanvas SuperSplat (WebGPU front-to-back tile compositor) but renders the
  room in **mkkellogg/GaussianSplats3D** (Three.js, back-to-front). Second
  trap: under nginx COOP/COEP isolation mkkellogg's SharedArrayBuffer/GPU-sort
  path also goes black — `gpuAcceleratedSort:false` (CPU radix sort) is the
  actual fix. The earlier k-NN-init and transmittance-underflow theories were
  wrong (the bisect artifact had a PLY-header bug).
- **Viewer swap (`bake.py`, `scripts/mk_viewer.html`):** `bake.py` now deploys
  the mkkellogg viewer as `index.html`/`mk.html` by default; SuperSplat kept as
  `supersplat.html` for trained splats. Opacity defaults 0.45–0.90, scale_mult
  2.2. Viewer libs vendored once at `scenes/_lib/`.
- **Stage B refine (`scripts/train_gsplat.py`, `refine.sh`):** rewrote the
  non-functional stub into a real gsplat 1.5.3 photometric refiner (Apache-2.0,
  frame-correct w2c/Y-Z handling). Validated on roomscan2: **PSNR 16.94 → 34.35
  dB, 98 MB peak VRAM**. Persistent CUDA-JIT cache.
- **Headless render (`scripts/render_ply.py`):** browser-independent gsplat
  render of any PLY to PNG — objective quality check + dashboard poster.
- **Dashboard integration (`live.html`, `live_stream.py`):** new `/live/scenes`
  endpoint; dynamic scene picker with ✦refined badge; 3D-walkthrough panel
  shows the gsplat render poster (click → live viewer); capture how-to with the
  slow-walk-for-parallax tip; corrected labels/footer. Defaults to the newest
  refined scene.
- **Frontier vetting:** AnySplat ruled out (MIT code but CC-BY-NC VGGT-1B
  weights + ~886M params, won't fit Orin 8 GB); InstantSplat ruled out (MASt3R
  NC). gsplat 1.5.3 is the clean Apache path. DA3-Small has no GS head (that's
  DA3-Large/Giant, CC-BY-NC).
- **Known limiter (capture-side, not code):** both test captures had <6 mm
  camera baseline → DA3 ~monocular → thin 2.5D slab. A 1–2 m slow-walk capture
  is required for true 3D structure. Documented in `jarvis/splat-lab/REPORT.md`.

## [Autonomous-dev configuration + investor-grade docs] — 2026-06-05

Set the repo up for end-to-end autonomous AI development and a real
investor pitch.

- **Autonomous-dev config (`.claude/`):** 4 project-specific subagents
  (`robot-tester`, `firmware-builder`, `splat-debugger`,
  `brain-deployer`), 6 slash commands (`/jetson-status`,
  `/deploy-brain`, `/verify-splat`, `/firmware-build`,
  `/verify-changes`, `/autonomous-dev`), 2 skills (`autonomous-dev`,
  `drive-safety`), `settings.json` with 33-entry allowlist and
  destructive-op deny list (including the `ZIP_MOTION_LOCKED=0`
  pattern), comprehensive `.claude/README.md` indexing all of it.
- **Investor-pitch quality docs:** `PITCH.md` (problem / solution /
  why-now / why-us / traction / vision / ask),
  `docs/VISION.md` (5-year thesis with year-by-year roadmap),
  `docs/TRACTION.md` (every measured capability + perf number),
  `docs/TEAM.md` (solo founder + AI-agent development model).
- **README upgrade:** mermaid system architecture diagram, mermaid
  Jarvis vision-pipeline diagram, mermaid phase-progression timeline.
  Measured perf table, command catalog, doc-map by audience
  (investor / engineer / operator / AI-agent / hardware).
- **GitHub repo metadata:** descriptions + topics refreshed on
  `steffenpharai/zip` (12 topics: robotics, jetson, arduino, nextjs,
  computer-vision, gaussian-splatting, autonomous-robot, edge-ai,
  yolo, depth-anything, ai-agents, claude-code) and
  `steffenpharai/zip-brain`. `steffenpharai/zip-v1-archive` formally
  marked `archived=true`.
- **`docs/images/`** placeholder + convention doc for future
  screenshots / photos / branding.

## [Documentation professionalization pass] — 2026-06-05

Bring the post-restructure repo up to "engineering AI team startup"
quality. Private repo, but written as if ready for public view.

- **Umbrella docs:** `docs/ARCHITECTURE.md` (full system picture with
  data ownership table), `docs/ROADMAP.md` (rolled-up phase tracking
  across robot + Jarvis vision + Jarvis LLM), `docs/HARDWARE.md`
  (complete BOM, pinouts, network topology, power topology),
  `docs/KNOWN_ISSUES.md` (every gotcha that bit us once),
  `docs/GLOSSARY.md` (terminology, acronyms, phase index).
- **Architecture Decision Records:** [`docs/adr/`](docs/adr/) with 7
  ADRs covering monorepo shape, UNO-owns-time, UART 500k baud, sticky
  bus topics, wheels-locked default, LLM-on-Jetson deferral, V1
  archival.
- **Repo meta:** `CONTRIBUTING.md` (workflow, branch model, commit
  style, what MUST be tested), `SECURITY.md` (responsible disclosure
  with motion-safety scope), `CODE_OF_CONDUCT.md` (Contributor Covenant).
- **Agent-development affordances:** rewritten `AGENTS.md` with the
  three immovable rules, what to ask vs proceed on, verification
  commands per change type. Per-component `CLAUDE.md` files at
  `zip-v2/hud/`, `zip-v2/firmware/`, `jarvis/splat-lab/`,
  `jarvis/llm/`. Refreshed `.github/copilot-instructions.md`.
- **Repo tooling:** issue templates (bug, feature, hardware) + PR
  template with the three-rules safety check + CODEOWNERS for
  safety-critical paths. GitHub Actions workflows: `hud-ci.yml` (typecheck
  + build), `firmware-ci.yml` (UNO + ESP32 PlatformIO builds with
  stubbed secrets), `docs-lint.yml` (broken-link check). Dependabot
  updated for new HUD path.

## [Repo restructure] — 2026-06-04

Monorepo reorganized around three clear concerns: `jarvis/` (vision-first
AI, primary), `zip-v2/` (the robot), `zip-v1/` (predicate snapshot).

- **GitHub repo renames:** `steffenpharai/Zip` (V1) → `zip-v1-archive`
  with `v1-archive` tag at `62869583`. `steffenpharai/zip-v2` →
  `steffenpharai/zip` (now canonical monorepo).
- **`jetson/` nested clone → proper git submodule at `zip-v2/brain/`**.
- **Adopted untracked work:** `splat-lab/` and `jetson-splat-lab/` now
  live under `jarvis/splat-lab/`. The newer k-NN-init `bake.py`
  preserved as `bake.py.knn-init-from-pc` (the fix for the black-render
  bug, not yet verified on Jetson).
- **Stale ROS2-era artifacts removed:** `build/`, `install/`, `log/`,
  `ros2_packages/`. V1→V2 cleanup reports archived under
  `docs/archive/v2-cleanup-reports/`.
- **Restructure commits:** `621aa38` (the move), `bf33a67` (path fixes).

## [Jarvis — standalone local AI agent on the Jetson] — 2026-06-03

New track, separate from the robot: the **Jetson Orin Nano Super by itself** as a
personal, local, agentic AI ("Jarvis"), time-shared with the robot.

- **OpenClaw 2026.6.1 installed + running 100% locally** on the Jetson — a full
  agent turn runs against a local **Qwen3-4B** model (Ollama), **zero token
  cost**, no cloud. Web Control UI (dashboard) live on `:18789`, reachable from
  the PC.
- **Stack from scratch**: Node 24 (NodeSource), Ollama 0.30.4 (CUDA/JetPack
  build), OpenClaw via npm. Onboarded non-interactively, local-only
  (`--auth-choice ollama`), LAN-bound gateway as a systemd user service.
- **The 8 GB fight** (documented so it's never re-derived): the desktop GUI
  fragmented GPU memory → even the weights wouldn't load. Fix = **headless**
  (`multi-user.target`) + Ollama tuning (`flash-attention`, `q4_0` KV cache,
  `num_batch 256`, `max-loaded-models 1`) + a baked custom model **`zip-jarvis`**
  (Qwen3-4B-Instruct-2507, 16384 ctx, 100% GPU, 3.3 GB).
- **Model call**: dropped the stale Qwen2.5-3B for **Qwen3-4B-Instruct-2507**
  (non-thinking → fast voice turns, strong tool-calling).
- **Direction locked**: adopt OpenClaw (vs build-your-own / NVIDIA NemoClaw which
  targets bigger boxes); local-only now, voice + on-demand cloud escalation later.
- Docs: new [`docs/jarvis/`](docs/jarvis/README.md) tree
  (README, RESEARCH_AND_DECISIONS, DEPLOY).
- Known/open: first-turn latency ~54 s (large toolset on a 4B), OpenClaw
  context-window mismatch (sees 262 k, real 16384), robot↔agent 8 GB mode manager.

## [V2 / Phase 5.3a — Monocular depth + wheel safety lock] — 2026-06-03

- **5.3a depth**: Depth Anything V2 Small on the Jetson via onnxruntime-gpu
  (CUDA, no PyTorch). On-demand `/depth/frame` endpoint → TURBO-colorized
  depth map of the current BOW frame (~0.2 s warm). HUD `DepthPanel` with a
  manual capture button (one inference per click, no constant GPU contention).
  Model bring-up delegated to a headless Jetson agent. Metric scaling vs the
  ultrasonic for object-location anchoring is Phase 6.
- **Wheel-motion safety lock** ("desk mode"): a single choke point in the
  motion gateway drops drive (N=200) + macro (N=210) when engaged — the wheels
  physically can't be commanded (manual/planner/macro), while servo + scan
  still work. `{type:"motion_lock", locked}` / `ZIP_MOTION_LOCKED`; state on
  `motion.lock_state` → WS `motion_lock`; rose "⊘ WHEELS LOCKED" HUD badge.
  Engaged persistently on the robot (drop-in) for desk testing.

## [V2 / Phase 5.0–5.2 — Mapping & autonomous navigation] — 2026-06-02

Fusion-first indoor mapping on the sensors we already have (MASt3R-SLAM
un-locked as too heavy for an 8 GB Orin + mono cam — see PHASE5_PLAN.md).

- **5.0 sensor plumbing**: UNO `N=24` exposes MPU6050 yaw; brain streams
  `sensor.imu` (10 Hz) + an opt-in servo-swept ultrasonic radar
  (`sensor.scan`, self-correlated by angle-encoded query tag). HUD `RadarPanel`
  (forward-arc polar plot + heading + sweep toggle).
- **5.1 pose + occupancy**: `mapping.py` fuses IMU heading + commanded-velocity
  dead-reckoning → 2D pose, raycasts sweeps into a hit/miss occupancy grid
  (`map.pose` + `map.occupancy`). HUD `MapView` becomes the viewport hero —
  the room builds top-down as the robot senses it.
- **5.2 trajectory planning**: `planner.py` — A* over the inflated occupancy
  grid + pure-pursuit follower steered by IMU heading + reactive ultrasonic
  stop. Click a goal in the HUD → `goto` → path renders → robot follows it
  (`client.motion.drive` via the gateway). `plan.path` + `plan.status`.

Verified live at the logic level (paths plan, pose dead-reckons, drive
setpoints emit, HUD renders). Physical drive accuracy + the `max_speed_mps` /
steering-gain calibration are pending a charged battery.

## [V2 / Phase 4 — Perception (object detection)] — 2026-06-02

The robot sees. YOLO11-nano runs on the Jetson; detections overlay the BOW
camera in the HUD and confident sightings are captured to a gallery.

- **Inference on the Jetson** via `onnxruntime-gpu` with the TensorRT
  execution provider (FP16) + persistent engine cache; CUDA EP and OpenCV-DNN
  CPU are automatic fallbacks. CUDA EP benchmarked at ~31 fps / 32 ms on
  `bus.jpg` with correct detections — far over the 5 Hz the loop runs at.
- **Capture-once camera fanout** (`camera.py` `CameraHub`): one upstream
  capture per camera, framed into JPEGs, fanned to all MJPEG clients *and*
  perception. Fixes the single-open `/dev/video0` "Device busy" failure that
  also bit two browser tabs.
- **Brain**: `perception.py` (frame loop, off-event-loop inference, per-label
  snapshot cooldown) + `detector.py` (pluggable backend: onnxruntime-gpu →
  OpenCV-DNN CPU fallback, shared YOLO11 letterbox/parse/NMS). New bus topics
  `perception.detections` / `perception.snapshot`; WS envelopes `detections` /
  `snapshot`; HTTP `/perception/{state,snapshots,snapshot/{id}}`; runtime
  on/off toggle to free the GPU for SLAM.
- **HUD**: `DetectionOverlay` (SVG boxes, viewBox-matched to object-contain),
  `SnapshotGallery` (captured object crops), sightings into the event log.
- **Process**: the Jetson-side ML environment bring-up (onnxruntime-gpu wheel,
  TRT engine build + benchmark) was delegated to a Claude Code agent running
  headless on the Jetson, in parallel with the PC-side build. See
  `docs/v2/DEV_WORKFLOW.md`.

## [V2 / Phase 3.5 — Drive latency squeeze] — 2026-06-02

End-to-end **keydown → motor at full speed** cut from ~300 ms to ~70 ms.

- HUD `useDriveInput` dispatches `onAxesChange` synchronously inside the
  keydown handler — first setpoint leaves in the same DOM task as the
  key press, no rAF or React render wait.
- HUD `useDriveTick` switched from a 50 ms `setInterval` to a rAF poll
  for the backup re-send path.
- UNO firmware ramp limiter: `RAMP_ACCEL_STEP_OK` 12 → 30 PWM/step.
- UNO firmware loop rate: `TASK_CONTROL_LOOP_HZ` 50 → 100 Hz (combined
  with the ramp bump, the practical ramp is 600 PWM/s → 3000 PWM/s).
- UNO firmware `KICKSTART_BOOST` 25 → 40 to break static friction
  immediately on the first setpoint after a stop.
- UART baud 115200 → 500000 on both UNO firmware and the Jetson
  `zip-brain` systemd env. 50-byte setpoint: 4.5 ms → 1.0 ms on the
  wire. (The original commit targeted 460800, which the ATmega328P @
  16 MHz cannot produce — UBRR=3 actually yields 500000 baud, an 8.5%
  delta well past UART tolerance. Plus two `#define` shadow bugs in
  `config.h` silently overrode the `-DSERIAL_BAUD=` and
  `-DTASK_CONTROL_LOOP_HZ=` build flags back to V1 defaults. Both
  fixed here: guards added, target baud realigned to an achievable
  exact UBRR value.)

## [V2 / Phase 3.3 — ESP32-S3 OV2640 as second camera] — 2026-06-02

- New firmware `robot/firmware/zip_esp32_cam_sta/`: STA-mode, joins
  home Wi-Fi, mDNS `zip-esp32-cam.local`, MJPEG via ESP-IDF
  `esp_http_server` on `:81/stream`. Replaces the V1 `zip_esp32_cam`
  AP-mode firmware for V2 use.
- Camera secrets go in gitignored `secrets.h`; template in
  `secrets.example.h`.
- Jetson `zip-brain` gained an HTTP proxy camera kind; `/cam/aft`
  proxies the ESP32 stream. Brain now exposes the camera list on
  `/cam/list`.
- HUD camera tile uses real `<img src>` for both cameras, with live /
  buffering indicators and error-driven cache-bust reconnect.
- Several HUD/brain bugs fixed along the way; details in
  [`docs/v2/KNOWN_ISSUES.md`](./docs/v2/KNOWN_ISSUES.md).

## [V2 / Phase 3.1+3.2 — Logitech C615 streaming + HUD] — 2026-06-02

- Jetson `zip-brain` module `camera.py`: GStreamer
  `v4l2src ! multipartmux ! fdsink` per active client, zero-transcode
  MJPEG passthrough. Endpoint `/cam/bow`.
- HUD `CameraFeed` switched from placeholder bezel to real multipart
  MJPEG rendering.
- Jetson camera registry env-driven (`ZIP_CAM_BOW_DEVICE` etc.) so a
  systemd unit can override defaults without touching code.

## [V2 / Phase 2 — Brain service + HUD] — 2026-06-02

- New repo `zip-brain` (cloned to `/jetson` here, gitignored by outer
  repo). Module layout: `bus`, `uno_link`, `motion` (gateway),
  `control_plane` (FastAPI + WebSocket). systemd unit, deploy.sh.
- WS protocol locked in (see [`docs/v2/PROTOCOLS.md`](./docs/v2/PROTOCOLS.md)).
- Sticky bus topics — `uno.status` and `telemetry.sample` replay last
  value to new subscribers, so freshly-connected HUDs aren't blank.
- New `app/v2/` HUD: cockpit-style layout with mission bar, telemetry
  panel (battery arc gauge, ultrasonic ranging bar, motor twin-rail),
  3D world viewport (R3F + Bloom + Vignette), drive panel (virtual
  joystick + WASD glyph + macros + rose-octagon E-STOP), bottom event
  log + UART console.
- Latency baseline established: ~300 ms keydown → motor (improved in
  3.5).

## [V2 / Phase 1 — Jetson bringup] — 2026-06-02

- Jetson Orin Nano Super flashed with JetPack 6.2.1, brought up over
  USB-C; characterised in [`docs/v2/JETSON_FACTS.md`](./docs/v2/JETSON_FACTS.md).
- Set up SSH key auth from PC; alias `zip-jetson` in `~/.ssh/config`.
- Two hardware gotchas discovered: L4T kernel doesn't ship
  `ch341.ko` (we built it from upstream source against the installed
  headers) and `brltty` udev rule eats CH340 devices.
- Jetson ↔ UNO UART exchange verified end-to-end via Python pyserial
  on the Jetson — same JSON protocol the PC used in V1.

## [V2 / Phase 0 — Firmware baseline] — 2026-06-02

- V1 firmware on both chips rebuilt cleanly through PlatformIO and
  re-uploaded; protocol verified via JSON ping/battery/ultrasonic
  cycle.
- Both repos initialised (PC-side `zip-v2`, Jetson `zip-brain`).
- Architecture decided: three-tier (UNO / Jetson / clients), Jetson
  owns intent, PC is observability only.
