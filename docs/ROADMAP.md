# Roadmap

Where Zip is going. Two parallel tracks: the **robot** (zip-v2) and
**Jarvis** (the vision/LLM agent). Per-phase detail lives in
[`zip-v2/docs/PHASES.md`](../zip-v2/docs/PHASES.md) for the robot.

> Dates use ISO format. The current date is **2026-06-04**.

## Status snapshot

| Track | Last shipped | In flight | Next |
|---|---|---|---|
| **Robot (Zip v2)** | Phase 5.3a (depth + wheel safety lock) | — | 5.4: aft camera in mapping |
| **Jarvis vision** | depth-lab + perception-lab + live dashboard | splat-lab k-NN init fix (unverified) | Verify splat render, ship walk-through |
| **Jarvis LLM** | OpenClaw + Qwen3-4B installed | strategic verdict: defer | Hybrid (Jetson edge + PC brain) |

## Robot track (zip-v2)

### Shipped

- **Phase 0** — Bring-up: UNO reflash, brain boot, HUD WebSocket handshake.
- **Phase 1** — Robot IO + manual drive (keyboard → setpoint → motors).
- **Phase 2** — First camera live in HUD (bow / Logitech C615 via USB).
- **Phase 3** — Second camera (aft / ESP32-S3 OV2640 via Wi-Fi).
- **Phase 3.5** — Latency win: UART 500 k baud + 100 Hz control loop.
  Got keydown→motor down to ~70 ms.
- **Phase 4** — Perception: YOLO11n on Jetson via onnxruntime-gpu CUDA EP.
  Detection overlay in HUD, snapshot gallery, per-label cooldown.
- **Phase 5.0** — IMU heading (MPU6050 complementary filter) + servo-swept
  ultrasonic radar.
- **Phase 5.1** — Occupancy mapping: IMU heading + dead-reckoned
  translation + ultrasonic raycast. 5 cm cells, sparse dict, sticky
  `map.occupancy` topic.
- **Phase 5.2** — A* trajectory planner (8-connected, inflated obstacles)
  + pure-pursuit follower + click-to-go in HUD.
- **Phase 5.3a** — Monocular depth: Depth Anything V2 Small via
  onnxruntime-gpu CUDA. Manual-capture button in HUD's `DepthPanel`.
  Wheel-motion safety lock (`ZIP_MOTION_LOCKED=1` default) + HUD badge.

### In flight

Nothing currently active — the depth + safety lock landing closed
Phase 5.3a. Hardware-mounted Jetson power is the open prerequisite for
the next drive-test phases (see [HARDWARE.md](./HARDWARE.md)).

### Queued (priority order)

- **Phase 5.3b** — Visual VIO / loop-closure. Reduce open-loop drift
  before serious driving.
- **Phase 5.4** — Aft camera coverage in mapping. Today the planner only
  knows what the bow sees; adding aft makes back-up safer.
- **Phase 6** — Anchored object locations. Use Phase 5.3a depth + Phase
  4 perception to pin detections to specific map cells with metric
  coordinates. Enables "go to the chair" instructions.
- **Phase 7** — SLAM. Open-loop dead-reckoning won't scale past one
  room. MASt3R-SLAM was evaluated and rejected (too heavy for 8 GB);
  replacement is TBD. Candidates: ORB-SLAM3, KISS-ICP, fast3R-Lite.

### Won't do (formally rejected)

- **ROS 2 in v2.** v1 used it; v2 deliberately doesn't. The build
  complexity was disproportionate to the value for a one-robot project.
- **MASt3R-SLAM on this Jetson.** Doesn't fit in 8 GB alongside
  perception. See [zip-v2/docs/PHASE5_PLAN.md](../zip-v2/docs/PHASE5_PLAN.md).
- **Binary UART protocol.** JSON is sufficient; binary saved ~96 bytes
  on UNO RAM but doubled debug surface area.

## Jarvis vision track

### Shipped

- **depth-lab** — DAv2 Small ONNX/CUDA on Jetson. ~7 FPS sustained.
  `DepthEstimator.estimate(bgr) -> HxW float32`.
- **perception-lab** — YOLO11n TRT FP16 engine. ~34 ms inference.
  `Detector.detect(bgr) -> [{label, confidence, box}]`.
- **splat-lab live dashboard** — RGB + depth + YOLO overlay + tegrastats
  telemetry, served by nginx at `:8090` over SSH tunnel for
  WebGPU-secure-context.
- **splat-lab capture pipeline** — v4l2 lockdown + GStreamer MJPEG +
  YOLO11n score-gate frame selector.
- **splat-lab DA3 inference** — Depth Anything 3 Small in a custom
  container, 250 ms / frame at 504² FP16, 278 MB peak.
- **splat-lab auto-annotate** — YOLO bboxes through DA3 extrinsics into
  world coords, DBSCAN clustering, SuperSplat hotspot JSON.
- **SuperSplat Viewer** — built + deployed; renders test cubes correctly.

### In flight (the current bug)

- **splat-lab black-render fix.** The DA3 → backproject → PLY pipeline
  produces a valid PLY that renders BLACK in the SuperSplat WebGPU
  viewer. Root cause: dense co-planar Gaussians collapse the WebGPU
  tile compositor's transmittance. Fix: k-NN-init for Gaussian scale.
  - **Status:** k-NN-init `bake.py` exists at
    [`jarvis/splat-lab/scripts/bake.py.knn-init-from-pc`](../jarvis/splat-lab/scripts).
  - **Blocker:** needs scp to Jetson, re-run launcher, eyeball verify
    in browser.

### Queued

- **depth + perception fusion** for anchored object metric coords (also
  the enabler for robot-side Phase 6).
- **Stream `live.sog` updates.** SuperSplat Viewer has a `/live/`
  channel that re-loads on WebSocket ping; useful for "polaroid-developing"
  UX during a scan.
- **Quest browser test.** Walk-through in WebXR (existing splats render
  fine; needs DA3 splat to actually render first).

## Jarvis LLM track

### Shipped

- **OpenClaw 2026.6.1** installed on Jetson with `main` agent onboarded.
- **Ollama 0.30.4** with `zip-jarvis` custom Modelfile (Qwen3-4B-Instruct-2507
  + `num_ctx 16384` + `num_batch 256` — the only safe fit on 8 GB).
- **8 GB tuning** locked in: `OLLAMA_FLASH_ATTENTION=1`,
  `OLLAMA_KV_CACHE_TYPE=q4_0`, `OLLAMA_MAX_LOADED_MODELS=1`. Headless
  mode (`multi-user.target`) for ~700 MB GPU savings.
- **Gateway daemon** (`openclaw-gateway` user systemd unit) on port
  `:18789` with token auth. Dashboard reachable via `localhost:18789`
  through the `openclaw-dash` SSH tunnel in `.claude/launch.json`.

### Strategic verdict (deferred)

Per [RESEARCH_AND_DECISIONS.md](../jarvis/llm/docs/RESEARCH_AND_DECISIONS.md),
**a capable fully-local agent does not fit on an 8 GB Jetson**.
OpenClaw's base prompt at 8-15.7 k tokens + Qwen3-4B's 16 k ctx ceiling
leaves almost no headroom. The recommended architecture is **hybrid**:

- **Edge tier (Jetson):** thin reflex agent (1-3 B model) + wake word
  (openWakeWord) + STT (Whisper) + TTS (Piper).
- **Brain tier (PC):** 14-32 B dense model on the RTX 4070 Ti SUPER 16 GB
  over LAN. Or cloud frontier for the heavy stuff.

This matches the PC-as-brain pattern already chosen for the robot.

### Queued

- **Wake word + STT + TTS** on the Jetson with KV-prefix caching for a
  thin, fast reflex loop.
- **PC brain service.** Run a 14-32 B model server on the home PC,
  expose over LAN. Tooling: vLLM or llama.cpp + grammars.
- **Bridge from Jarvis vision to LLM.** When the vision stack sees
  something interesting, escalate to the brain.

### Won't do

- **Nemotron-3-Nano-4B-Hybrid on Jetson.** Looks great on paper (small
  KV cache) but Mamba-hybrid recurrent state in llama.cpp/Ollama is a
  known OOM bug; investigated, set aside.
- **VLM + LLM coexistence on Jetson.** Confirmed: vision (YOLO + DA3)
  and even a small LLM cannot share 8 GB at usable context lengths.

## Cross-cutting

### Documentation
- ✅ Monorepo restructure with clear `jarvis/`, `zip-v2/`, `zip-v1/`
  separation (2026-06-04).
- ✅ Umbrella docs (ARCHITECTURE, ROADMAP, HARDWARE, KNOWN_ISSUES,
  GLOSSARY) — landing now.
- ✅ ADRs for major decisions.
- 🔄 Per-component CLAUDE.md / AGENTS.md for AI-agent affordances.

### Tooling
- 🔄 GitHub Actions CI (typecheck HUD + firmware build smoke).
- ⏸️ Issue / PR templates.
- ⏸️ Hardware-in-the-loop test harness (long-horizon).

### Hardware
- 🔄 Mount the Jetson on the robot (5V/3-5A regulated USB-C or
  9-19V barrel — 2S motor pack alone won't do it).
- ⏸️ Bow + aft camera mount geometry (currently bow C615 is loose on
  the chassis).
- ⏸️ Wheel encoders (would replace dead-reckoning, drastically improve
  pose).
