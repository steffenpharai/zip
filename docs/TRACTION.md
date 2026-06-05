# Traction

What has been built and measured. **Last updated: 2026-06-05.**

> "Show me the screenshots, not the slideware."

## Capabilities shipped

| Capability | Status | First shipped | Evidence |
|---|---|---|---|
| Real-time RGB streaming (bow + aft cameras) | ✅ Ship | Phase 2-3 | HUD camera feeds @ ~15-25 FPS via MJPEG |
| YOLO11n object detection (COCO-80, TensorRT FP16) | ✅ Ship | Phase 4 | 34 ms inference, 30+ FPS headroom on Jetson |
| Monocular depth (Depth Anything V2 Small, CUDA) | ✅ Ship | Phase 5.3a | 143 ms inference, 7 FPS sustained |
| IMU heading (MPU6050 + complementary filter) | ✅ Ship | Phase 5.0 | 10 Hz, sticky bus topic |
| Servo-swept ultrasonic radar | ✅ Ship | Phase 5.0 | Ping-pong sweep, sensor.scan topic |
| Occupancy mapping (IMU + dead-reckon + raycast) | ✅ Ship | Phase 5.1 | 5 cm grid, sparse dict, HUD overlay |
| A* trajectory planner (8-connected, inflated obstacles) | ✅ Ship | Phase 5.2 | Brain-side, click-to-go from HUD |
| Pure-pursuit path follower | ✅ Ship | Phase 5.2 | Reactive ultrasonic stop @ 18 cm |
| Click-to-go in HUD | ✅ Ship | Phase 5.2 | SVG map → goal → A* → execute |
| Wheel motion safety lock (default-on) | ✅ Ship | Phase 5.3a | Brain gateway + HUD badge + systemd default |
| HUD depth panel (manual capture) | ✅ Ship | Phase 5.3a | /depth/frame endpoint + DepthPanel.tsx |
| Snapshot gallery (perception output) | ✅ Ship | Phase 4 | Per-label cooldown, /var/lib/zip storage |
| Sticky-topic WebSocket bus | ✅ Ship | Phase 1 (refined Phase 4) | Reconnect → instant state, ADR 0004 |
| 100 Hz UNO control loop | ✅ Ship | Phase 3.5 | 10 ms cycle, deterministic |
| UART at 500 kbaud | ✅ Ship | Phase 3.5 | ~1 ms wire time for setpoints |
| **Latency: keydown → motor** | ✅ Measured | Phase 3.5 | **~70 ms total** |
| ESP32-S3 MJPEG camera (STA mode + mDNS + httpd) | ✅ Ship | Phase 3 | 15-25 FPS at VGA, zip-esp32-cam.local |
| Live "Jarvis" dashboard (RGB + depth + YOLO + tegrastats) | ✅ Ship | Jarvis track | nginx :8090 over SSH tunnel |
| Depth Anything 3 (DA3-Small) inference container | ✅ Ship | Jarvis splat-lab | 250 ms/frame at 504² FP16 |
| YOLO bbox → world-space hotspots (auto-annotate) | ✅ Ship | Jarvis splat-lab | DBSCAN cluster + SuperSplat schema |
| **3D Gaussian Splat reconstruction (DA3 → PLY)** | 🔄 1 bug | Jarvis splat-lab | Valid PLY produced; browser render blocked on k-NN fix |
| Local LLM agent (OpenClaw + Qwen3-4B) | ⏸️ Installed, deferred | Jarvis llm | Strategic verdict: hybrid PC brain (ADR 0006) |

## Performance numbers (measured, not extrapolated)

### Robot-side (Phase 5.3a)

| Path | Latency / throughput | Notes |
|---|---|---|
| Browser keydown → useDriveInput dispatch | < 1 ms | Synchronous in same browser task |
| WebSocket frame (browser → brain) | 2-5 ms | LAN |
| Brain motion gateway (rate limit + lock + UART encode) | < 1 ms | Python asyncio |
| UART setpoint on wire (50 bytes @ 500 kbaud) | ~1 ms | Phase 3.5 win vs ~4.5 ms @ 115k |
| UNO control loop cycle | 10 ms (100 Hz) | Phase 3.5 win vs 20 ms (50 Hz) |
| **Total keydown → PWM** | **~70 ms** | Reproducible |
| Drive setpoint TTL (deadman) | 300 ms default | Configurable |
| WebSocket reconnect → first sticky topic | ~50 ms | Brain replays cache |

### Jarvis-side (vision labs)

| Capability | Inference | RAM peak | Notes |
|---|---|---|---|
| YOLO11n TRT FP16 (640x640) | 34 ms | 280 MB | Detector backend |
| YOLO11n CUDA EP (onnxruntime-gpu) | 31 ms | 280 MB | Fallback |
| DAv2 Small (518x518 FP16) | 143 ms | 290 MB | Depth |
| DA3-Small (504x504 FP16, 1-view) | 250 ms | 278 MB | Splat init |
| DA3-Small (4-view) | 1.5 s | 531 MB | Multi-view |
| DA3-Small (6-view) | 1.75 s | 702 MB | Max safe on 8 GB |
| Live dashboard (RGB + depth + YOLO concurrent) | 6.7 FPS each | 4.3 / 7.6 GB | 16.2 W total |

### End-to-end scan (capture → bake → annotate)

| Stage | Time |
|---|---|
| 30 s of capture (v4l2 + YOLO score-gate) | ~32 s wall |
| DA3 bake (4 views) | ~5 s |
| Annotate (DBSCAN + project) | < 0.5 s |
| **Total** | **~38 s press-record to PLY** |

(Browser walkthrough quality currently blocked by k-NN init fix; once
verified, end-to-end UX is ~40 s for a viewable scan.)

## Hardware traction

| Asset | Status |
|---|---|
| Elegoo Smart Car V4.0 chassis | ✅ Functional |
| ATmega328P UNO firmware | ✅ Phase 3.5 tuned |
| ESP32-S3 OV2640 camera (STA mode) | ✅ Phase 3 functional |
| Logitech C615 USB camera (bow) | ✅ Phase 4 functional |
| MPU6050 IMU | ✅ Phase 5.0 yaw fusion |
| HC-SR04 ultrasonic on servo | ✅ Phase 5.0 sweep |
| TB6612FNG motor driver | ✅ Functional |
| Jetson Orin Nano Super (8 GB) | ✅ Deployed, dormant when not in use |
| Jetson chassis mount | 🔄 Open hardware task |
| Jetson power topology (regulated 5V/3-5A on robot) | 🔄 Open hardware task |
| Permanent camera mount geometry | 🔄 Open hardware task |
| Wheel encoders | ⏸️ Future (would replace dead-reckoning) |

## Repository / code traction

| Metric | Value |
|---|---|
| Total commits on `master` | (see `git log --oneline | wc -l`) |
| Architecture Decision Records | 7 ADRs covering core decisions |
| Component CLAUDE.md files | 4 (hud, firmware, splat-lab, llm) |
| Submodule | 1 (zip-brain) |
| GitHub Actions workflows | 3 (HUD typecheck/build, firmware build, docs link check) |
| Issue templates | 3 (bug, feature, hardware) |
| Slash commands for autonomous dev | 6 |
| Project-specific subagents | 4 |
| Reusable skills | 2 (autonomous-dev, drive-safety) |
| Permission allowlist entries | 33 pre-authorized read-only / build ops |

## Test traction (and gaps)

| Test | Status |
|---|---|
| HUD typecheck on PR | ✅ CI |
| HUD build on PR | ✅ CI |
| UNO firmware build on PR | ✅ CI (PlatformIO) |
| ESP32 firmware build on PR | ✅ CI (PlatformIO, stubbed secrets) |
| Markdown link check on PR | ✅ CI (warnings only) |
| HUD V1 layout E2E | ✅ Playwright (existing) |
| **HUD V2 cockpit E2E** | ❌ Gap — needs WebSocket mock |
| Brain unit / integration | ❌ Gap — manual smoke only |
| Firmware HIL (hardware-in-loop) | ❌ Gap |
| End-to-end drive simulation | ❌ Gap |

The test gap is real and prioritized for the next dev cycle.

## Documentation traction

| Doc | Status |
|---|---|
| Umbrella README + AGENTS.md + CONTRIBUTING + SECURITY + CODE_OF_CONDUCT | ✅ |
| docs/ARCHITECTURE.md + ROADMAP + HARDWARE + KNOWN_ISSUES + GLOSSARY | ✅ |
| docs/adr/ (7 ADRs) | ✅ |
| zip-v2/docs/ (PROTOCOLS, DEPLOY, DEV_WORKFLOW, JETSON_FACTS, PHASES, PHASE5_PLAN) | ✅ |
| jarvis/ READMEs + per-lab READMEs | ✅ |
| .claude/ autonomous dev setup | ✅ |
| PITCH.md + VISION.md + TRACTION.md (this file) + TEAM.md | ✅ |

## What's NOT shipping yet (named honestly)

- **Splat browser render.** PLY pipeline produces valid output; the
  WebGPU viewer shows black due to dense-coplanar Gaussians. Fix
  (k-NN-init `bake.py`) is staged but unverified on Jetson.
- **LLM agent integrated with the robot.** OpenClaw + Qwen3-4B
  installed on Jetson; per ADR 0006, deferred to hybrid PC-brain
  architecture (not yet built).
- **Multi-room navigation (SLAM).** Phase 7 queued. Current planner
  works within one mapped area; drift accumulates over time.
- **Voice (wake word + STT + TTS).** Designed in architecture
  decisions, not started.
- **Aft camera coverage in mapping (Phase 5.4).** Queued; current
  planner only uses bow.
- **Custom hardware (PCB, mount, power).** Open hardware tasks; will
  ship as a dedicated phase.
- **Pilot deployments.** Robot lives on a desk. Real-home pilots are
  Year 2.

## Compared to plan

The original V2 plan (Phase 0 → 7) called for shipping through Phase
5.3a by mid-2026. **We are on the plan.** Phase 5.3a (depth + wheel
safety lock) landed 2026-06-03. The restructure + professionalization
pass landed 2026-06-04 → 2026-06-05.

The Jarvis vision-first labs were not in the original plan — they
emerged in parallel because the same Jetson hardware serves both. The
splat reconstruction is the most ambitious not-yet-shipping piece;
once the k-NN fix verifies, that becomes a major capability
differentiator.

## Capital efficiency

Bill of materials shipped to date: well under $1k of hardware (one
robot, one Jetson, one camera, mounts, cables). No external
infrastructure dependencies (no AWS, no GCP, no third-party APIs in
the runtime). No subscription costs to run.

This is the unit economics story we'll be able to tell at scale: the
hardware is cheap because we picked it carefully, the software runs
locally so there's no per-user cloud cost, and the dev velocity is
high because the architecture is clean.
