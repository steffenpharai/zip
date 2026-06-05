# Glossary

Terminology used across [Zip](../README.md). Bold terms are the canonical
spelling/casing used in code and docs.

## Project names

- **Zip** — the umbrella name for the system. The repo is
  `github.com/steffenpharai/zip`.
- **Zip v2** — the autonomous robot. Lives under [`zip-v2/`](../zip-v2/).
- **Zip v1** — the predecessor (OpenAI voice control + ROS 2). Archived;
  source preserved at the `v1-archive` tag.
- **Jarvis** — the vision-first AI agent that runs on the Jetson with or
  without the robot. Lives under [`jarvis/`](../jarvis/).
- **OpenClaw** — third-party local-LLM agent runtime ([openclaw.com](https://openclaw.com)).
  Installed on the Jetson but **not yet integrated** with the vision stack.
- **zip-jarvis** — custom Ollama Modelfile name baking Qwen3-4B-Instruct-2507
  with `num_ctx 16384` + `num_batch 256` (the only safe fit on 8 GB).

## Hardware

- **UNO** — Arduino UNO clone with an ATmega328P, the motor controller
  on the Elegoo shield. Owns the 100 Hz control loop and the deadman
  watchdog.
- **ESP32-S3** — the OV2640 camera bridge. Joins home Wi-Fi in STA mode
  and serves MJPEG at `:81/stream`.
- **Jetson** — NVIDIA Jetson Orin Nano Super (8 GB unified memory).
  JetPack 6.2.1, CUDA 12.2 (system) / 12.6 (some labs).
- **Bow / Aft cameras** — bow is the forward-facing Logitech C615
  (USB, `/dev/video0`), aft is the ESP32-S3 OV2640 (rear-facing via
  Wi-Fi proxy). Nautical terms because the robot is described as a
  little vehicle.
- **MAXN_SUPER** — the highest Jetson power mode. Used during heavy
  perception / splat work.

## Architecture / pattern terms

- **Three-tier** — PC (cockpit + observability) / Jetson (intent + brain)
  / robot (time + motors). See [ARCHITECTURE.md](./ARCHITECTURE.md).
- **Sticky bus topic** — a topic on the brain's internal asyncio pub/sub
  bus that replays its last value to new subscribers. Means an HUD
  reconnect immediately gets the current motion lock state, pose,
  occupancy, etc. without waiting for the next update.
- **Motion gateway** — the brain's choke point for all wheel-motion
  commands. Implements rate limit + TTL re-send + client timeout +
  wheels-locked safety. See [zip-v2/brain motion.py].
- **Deadman** — the firmware-side watchdog. If no setpoint arrives in
  `ttl_ms` (default 300 ms), motors are stopped. Independent of any
  brain or HUD watchdog.
- **`ZIP_MOTION_LOCKED`** — the brain env var that defaults the wheels to
  locked. `1` = locked (bench-safe default), `0` = unlocked.
- **Drop-in** — a systemd override file under
  `/etc/systemd/system/<unit>.d/override.conf`. Used to persist
  `ZIP_MOTION_LOCKED` across reboots.

## Protocol terms

- **N=…** — the JSON message-type tag on the UART protocol between the
  brain and the UNO. `N=0` ping, `N=200` setpoint, `N=201` stop, etc.
  See [zip-v2/docs/PROTOCOLS.md](../zip-v2/docs/PROTOCOLS.md).
- **TTL** — time-to-live on a setpoint. The brain re-sends every
  ~100 ms; if it stops, the UNO's deadman cuts motion after the TTL.
- **UBRR** — the UNO's UART baud rate register. UBRR=3 with U2X=1 on a
  16 MHz ATmega328P gives exactly 500000 baud.
- **MJPEG** — Motion JPEG, the over-the-wire format for camera feeds.
  Multipart-mixed-replace HTTP stream.

## ML terms used here

- **YOLO11n** — the nano (n) variant of Ultralytics' YOLO v11 object
  detector. ONNX-exported, FP16 TRT-engine on Jetson, ~34 ms inference.
- **DAv2 Small** — Depth Anything V2 Small (~28 M params), ONNX/CUDA on
  Jetson, ~143 ms inference at 518² for per-pixel relative depth.
- **DA3 Small** — Depth Anything 3 Small (80 M params, Apache 2.0), the
  successor used in `jarvis/splat-lab/` for per-frame depth + pose +
  intrinsics. ~250 ms/frame at 504² FP16.
- **3DGS** — 3D Gaussian Splatting. A scene representation as a cloud of
  oriented Gaussians, rendered in real-time on GPU.
- **PLY** — Polygon File Format, the on-disk format for 3DGS scenes.
  PlayCanvas SuperSplat Viewer reads this directly.
- **SOG** — Streamed Octree Gaussians, PlayCanvas's compressed splat
  format. Optional output of `bake.py` for LOD streaming.
- **k-NN init** — the standard 3D Gaussian Splat initialization that sets
  each Gaussian's scale to the average distance to its K=3 nearest
  neighbors. The fix for the current black-render bug in
  `jarvis/splat-lab/`.

## Phases

The robot side is tracked in numbered phases. Active phase is shown in
[docs/ROADMAP.md](./ROADMAP.md). See [zip-v2/docs/PHASES.md](../zip-v2/docs/PHASES.md)
for the detailed per-phase work.

| Phase | Headline |
|---|---|
| 0 | Bring-up: firmware reflash, brain boot, HUD WebSocket handshake |
| 1 | Robot IO + manual drive |
| 2 | First camera live in HUD |
| 3 | Second camera (aft) |
| 3.5 | Latency win: UART 500 k baud + 100 Hz control loop |
| 4 | Perception: YOLO11n on Jetson + HUD overlay + snapshot gallery |
| 5.0 | IMU heading + servo-swept radar |
| 5.1 | Occupancy mapping (pose fusion + raycast) |
| 5.2 | A* + pure-pursuit planner + click-to-go |
| 5.3a | Depth panel (DAv2 Small) + wheel safety lock |
| 5.4 | (queued) Aft camera in mapping |
| 6 | (queued) Anchored object locations |
| 7 | (queued) SLAM |

## Operational terms

- **Desk mode** — robot wheels OFF the ground, `ZIP_MOTION_LOCKED=1`
  on the brain. Servos and sensors still active; safe to develop.
- **Bench test** — physical robot with wheels OFF the ground but
  unlocked. Confirms motor PWM and deadman behavior.
- **Drive test** — wheels on the ground, robot moving. Requires
  charged battery and explicit unlock.
- **Fast restart** — `sudo systemctl restart zip-brain` — typically
  ≤5 s back to a working WebSocket. The systemd unit's `TimeoutStopSec=5`
  is what makes this snappy.

## Common acronyms

| Acronym | Meaning |
|---|---|
| ADC | Analog-to-digital converter (used on the UNO for battery voltage) |
| ADR | Architecture Decision Record (see [adr/](./adr/)) |
| AP | Wi-Fi Access Point mode (V1 ESP32 bridges; v2 uses STA) |
| BoM | Bill of Materials (see [HARDWARE.md](./HARDWARE.md)) |
| CRLF | Carriage Return + Line Feed (Windows line endings) |
| DTR | Data Terminal Ready (UART line that triggers UNO auto-reset) |
| EP | Execution Provider (onnxruntime backend: TRT EP, CUDA EP, CPU EP) |
| FP16 | 16-bit floating point (TRT inference dtype on Jetson) |
| HUD | Heads-Up Display (the Next.js cockpit at zip-v2/hud) |
| I2C | Inter-Integrated Circuit (bus between UNO and MPU6050 IMU) |
| IMU | Inertial Measurement Unit (the MPU6050 gyro/accel on the chassis) |
| MCU | Microcontroller Unit |
| mDNS | Multicast DNS (`zip-esp32-cam.local`) |
| ORT | ONNX Runtime |
| PSK | Pre-Shared Key (Wi-Fi password) |
| PWM | Pulse Width Modulation (motor speed control) |
| RSSI | Received Signal Strength Indicator (Wi-Fi signal quality) |
| SAB | SharedArrayBuffer (browser requirement for splat viewer) |
| SDK | Software Development Kit |
| SLAM | Simultaneous Localization And Mapping |
| STA | Wi-Fi Station mode (client; the ESP32 cam joins existing AP) |
| TRT | TensorRT (NVIDIA's GPU inference engine) |
| TTS / STT | Text-To-Speech / Speech-To-Text |
| UART | Universal Asynchronous Receiver/Transmitter (the serial line) |
| VLM | Vision-Language Model |
| WAI | Working As Intended |
| WS | WebSocket |
| YOLO | You Only Look Once (the object detector family) |
