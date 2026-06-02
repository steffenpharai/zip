# Zip V2 — System Architecture

**Status:** Design phase (no code yet)
**Last updated:** 2026-06-02
**Premise:** The robot is autonomous. The PC and web are observability + control surfaces, not the brain.

---

## 1. Core premise

> **The robot is the agent.** It perceives, decides, and acts on its own.
> The PC, web HUD, and phone are observers + remote controls. They show what
> the robot is doing and can send it commands, but the robot does not
> depend on them being there to function.

Everything below follows from this. If a design choice would make the robot
non-functional when the network drops or the PC is off, it's wrong.

---

## 2. Hardware tiers

```
┌─────────────────────────────────────────────────────────────────────────┐
│  TIER 1 — REAL-TIME ACTUATION (the spine)                               │
│  Arduino UNO R3 + Elegoo SmartCar Shield v1.1                           │
│  ─ Motor PWM (TB6612FNG), slew limiting, deadman watchdog (TTL)         │
│  ─ Sensors: HC-SR04 ultrasonic, MPU6050 IMU, line, battery, servo       │
│  ─ JSON protocol over UART @ 115200 baud (unchanged from V1)            │
│  ─ Hard real-time; no AI; never blocks                                  │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │ UART (USB-CDC via shield CH340)
                                     │
┌────────────────────────────────────┴────────────────────────────────────┐
│  TIER 2 — ON-ROBOT INTELLIGENCE (the brain)                             │
│  Jetson Orin Nano Super (8GB LPDDR5, 67 TOPS, Ampere GPU + TRT)         │
│                                                                         │
│   ┌──────────────────┐  ┌──────────────────┐  ┌────────────────────┐    │
│   │ Camera + Vision  │  │ SLAM + Mapping   │  │ Agent / LLM        │    │
│   │ ──────────────   │  │ ──────────────   │  │ ──────────────     │    │
│   │ USB UVC / CSI    │  │ MASt3R-SLAM TRT  │  │ Claude API client  │    │
│   │  capture         │  │ Sensor fusion    │  │ Tool registry      │    │
│   │ YOLO TRT cont.   │  │  (IMU + visual   │  │ Planner            │    │
│   │ VLM client       │  │   odometry)      │  │ Memory             │    │
│   │  (Claude vision) │  │ Map persistence  │  │ Wake word          │    │
│   │ OCR              │  │                  │  │ Routing / safety   │    │
│   └──────────────────┘  └──────────────────┘  └────────────────────┘    │
│                                                                         │
│   ┌──────────────────────────────────────────────────────────────────┐  │
│   │ Control plane: gRPC/WebSocket server, telemetry, motion gateway  │  │
│   │ (rate-limit + deadman re-send; speaks UART to UNO; speaks WS to  │  │
│   │  clients)                                                        │  │
│   └──────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────┬──────────────────────────────────────────┘
                               │
                  Wi-Fi 5GHz / Tailscale / Cloudflare Tunnel
                               │
┌──────────────────────────────┼──────────────────────────────────────────┐
│  TIER 3 — CONTROL SURFACES (anywhere)                                   │
│                                                                         │
│   ┌──────────────────────────┴───────────────────────────┐              │
│   │              Web HUD (Next.js, React 19)             │              │
│   │   chat / voice • live camera • 3D map view •         │              │
│   │   telemetry • manual drive • debug consoles          │              │
│   └──────────────────────────────────────────────────────┘              │
│                                                                         │
│   PC (rich client + offline workshop):                                  │
│     - HUD runs locally (next dev / next start)                          │
│     - Browser at localhost:3000                                         │
│     - Offline jobs: Gaussian Splat training (RTX 4070 Ti SUPER, 16GB),  │
│       TensorRT engine builds for Jetson, dataset prep, model           │
│       fine-tuning                                                      │
│   Web browsers (any device, after Phase 10):                            │
│     - Same HUD code, served from PC or cloud                            │
│     - Auth-gated WebSocket to Jetson                                    │
│   Phone:                                                                │
│     - Same HUD as PWA                                                   │
└─────────────────────────────────────────────────────────────────────────┘
```

### Hardware tier ownership rules (invariants)

1. **UNO owns time.** PWM cycles, motion slew, the safety watchdog — all in the UNO firmware. Never depend on the network for these.
2. **Jetson owns intent.** Perception → decision → motion command happens entirely on the Jetson. The network is just for observability and high-level commands.
3. **Clients own presentation.** HUDs render state, send high-level commands, never execute motor control logic themselves.

### What about the ESP32-S3 cam?

Deprecated for V2. The Jetson takes over camera (USB / CSI) and Wi-Fi.
The ESP32 module can remain physically on the shield (it doesn't hurt
anything) but no V2 service uses it. If we ever want a second viewpoint or
a redundant command channel, the firmware is still in the repo and
working.

---

## 3. Robot software architecture (on the Jetson)

Layered, each layer with a clean contract so we can swap implementations.

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Layer 5: AGENT                                                         │
│    LLM brain (Claude API) + tool registry + planner + memory            │
│    Tools: motion.go_to(pose), vision.describe(), map.locate(query),     │
│           speak(text), listen(), web.search(query), memory.*            │
└──────────────────────────────────┬──────────────────────────────────────┘
                                   │ tool calls
┌──────────────────────────────────┴──────────────────────────────────────┐
│  Layer 4: WORLD MODEL                                                   │
│    - Robot pose (from sensor fusion)                                    │
│    - Map (sparse SLAM points + named regions)                           │
│    - Item registry (detections anchored to map coords, persisted)       │
│    - Recent observations (rolling window)                               │
│    - Long-term memory (SQLite)                                          │
└──────────────────────────────────┬──────────────────────────────────────┘
                                   │ state queries + updates
┌──────────────────────────────────┴──────────────────────────────────────┐
│  Layer 3: PERCEPTION + SLAM                                             │
│    ┌───────────────────┐  ┌────────────────────┐  ┌──────────────────┐  │
│    │ camera_capture    │  │ object_detection   │  │ slam             │  │
│    │ (V4L2 / GStreamer)│  │ (YOLO11 TRT FP16)  │  │ (MASt3R-SLAM TRT │  │
│    │  → frame bus      │  │  → detection bus   │  │  / RTAB-Map)     │  │
│    └───────────────────┘  └────────────────────┘  │  → pose bus      │  │
│    ┌───────────────────┐  ┌────────────────────┐  └──────────────────┘  │
│    │ vlm_describe      │  │ ocr                │  ┌──────────────────┐  │
│    │ (on-demand, API)  │  │ (on-demand, local) │  │ sensor_fusion    │  │
│    └───────────────────┘  └────────────────────┘  │ (IMU + odometry  │  │
│                                                   │  + visual SLAM)  │  │
│                                                   └──────────────────┘  │
└──────────────────────────────────┬──────────────────────────────────────┘
                                   │ ros2 topics / zmq pubsub / asyncio queues
┌──────────────────────────────────┴──────────────────────────────────────┐
│  Layer 2: MOTION                                                        │
│    motion_gateway: enforces rate limit, deadman re-sending, audit log,  │
│                    motion safety (reject commands violating policy)     │
│    motion_planner: short-horizon planner (waypoint → setpoint stream)   │
│    safety_guard:   real-time obstacle stop (vision + ultrasonic)        │
└──────────────────────────────────┬──────────────────────────────────────┘
                                   │ JSON setpoints over UART
┌──────────────────────────────────┴──────────────────────────────────────┐
│  Layer 1: HARDWARE I/O                                                  │
│    uno_link:       UART driver, JSON encode/decode, reconnect handling  │
│    uno_telemetry:  decode N=21..23 + IMU + battery, publish on bus      │
└─────────────────────────────────────────────────────────────────────────┘
```

### Process model on the Jetson

Each layer runs in its own process. Communication via a local pub/sub bus.
Likely starting candidate: **NATS or zmq for the internal bus, plain
WebSocket for clients**. (Optionally ROS 2 Humble if we want the rich
robotics ecosystem — to be decided in Phase 1 based on dev experience.)

| Process | Role | Restart policy |
|---|---|---|
| `zip-uno-link` | UART driver + protocol | restart-on-failure |
| `zip-motion` | Gateway + planner + safety | restart-on-failure |
| `zip-camera` | Camera capture + MJPEG/H.264 encoder | restart-on-failure |
| `zip-perception` | YOLO TRT continuous | restart-on-failure |
| `zip-slam` | SLAM + sensor fusion + map persistence | restart-on-failure |
| `zip-agent` | LLM tool-calling loop + memory | restart-on-failure |
| `zip-voice` | Wake word + STT + TTS (if robot-side audio) | optional |
| `zip-control-plane` | WebSocket server for clients, auth | restart-on-failure |

All managed by **systemd**, logs to journald.

---

## 4. Client architecture (PC, web, phone)

The HUD is **one codebase** that runs everywhere. PC just hosts it on
localhost during dev.

### HUD (Next.js + React 19)

```
┌────────────────────────────────────────────────────────────────────────┐
│ Top bar: connection status • battery • mode • emergency stop          │
├────────────────────────────────────────────────────────────────────────┤
│ Left rail: tools, debug consoles, settings                            │
│ ┌─────────────────────────────────────────┐  Right rail: chat /       │
│ │                                         │  voice                    │
│ │     Live camera feed +                  │  ────────                 │
│ │     YOLO bbox overlay                   │  message list,            │
│ │     (MJPEG or H.264 via WebRTC)         │  text input,              │
│ │                                         │  push-to-talk button,     │
│ │                                         │  (eventually wake word    │
│ ├─────────────────────────────────────────┤   via browser audio)      │
│ │                                         │                           │
│ │     3D map view (Three.js)              │                           │
│ │     - sparse points / mesh / splat      │                           │
│ │     - robot pose marker                 │                           │
│ │     - detected items as 3D labels       │                           │
│ │     - planned path overlay              │                           │
│ │                                         │                           │
│ ├─────────────────────────────────────────┤                           │
│ │  Telemetry: battery, motors, ultrasonic, IMU, fps, latency          │
│ ├─────────────────────────────────────────┤                           │
│ │  Manual drive: joystick / WASD / preset macros                      │
└────────────────────────────────────────────────────────────────────────┘
```

### PC-specific role

The PC is a **rich client + offline workshop**. Things only the PC does:
- HUD with dev/debug tools (latency graphs, raw bus inspector, replay)
- Gaussian Splat training (offline, GPU-bound, takes hours)
- TensorRT engine builds for Jetson (cross-build on PC, deploy `.engine` to Jetson)
- Dataset prep (label studio, annotation tools)
- Model fine-tuning (YOLO on custom classes, voice cloning)

Nothing on the PC is in the robot's runtime critical path.

### Web/phone client

Same HUD code, served from PC (or a cloud host later). Connects to the
Jetson's WebSocket. Limited to non-dev features.

---

## 5. Protocols / wire formats

### Jetson ↔ UNO (UART, 115200 baud)

JSON-over-UART, **unchanged from the firmware we already proved**:

| Direction | Example | Meaning |
|---|---|---|
| out | `{"N":200,"D1":150,"D2":0,"T":200}` | Drive setpoint (v=150, w=0, TTL=200ms) |
| out | `{"N":201,"H":"stop"}` | Emergency stop |
| out | `{"N":210,"D1":2,"D2":200,"T":5000}` | Macro (SPIN_360, intensity 200, 5s TTL) |
| out | `{"N":300,"D1":90}` | Servo angle 90° |
| out | `{"N":21,"H":"u","D1":2}` | Read ultrasonic |
| in | `{u_42}` | Response: ultrasonic = 42 cm |
| in | `{batt_7200}` | Response: battery = 7.2 V |

### Jetson ↔ Clients (WebSocket, eventually authenticated)

Single duplex WebSocket per client. Message envelopes:

```jsonc
// Client → Server (commands)
{ "type": "cmd",
  "id": "cmd_abc123",
  "name": "motion.drive",
  "args": { "v": 0.2, "w": 0.0, "ttl_ms": 200 } }

{ "type": "cmd",
  "id": "cmd_xyz789",
  "name": "agent.say",
  "args": { "text": "Go check the kitchen" } }

// Server → Client (state, telemetry, events)
{ "type": "telemetry",
  "ts": 1735234567890,
  "battery_v": 7.42,
  "ultrasonic_cm": 45,
  "imu": { "roll": 0.1, "pitch": -0.05, "yaw": 1.23 },
  "motors": { "left": 0, "right": 0 } }

{ "type": "perception",
  "ts": 1735234567890,
  "detections": [
    { "class": "person", "conf": 0.92, "bbox": [120, 80, 240, 410] }
  ] }

{ "type": "pose",
  "ts": 1735234567890,
  "x": 1.42, "y": 0.85, "yaw": 1.57, "frame": "map" }

{ "type": "agent_event",
  "ts": 1735234567890,
  "kind": "tool_call",
  "tool": "vision.describe",
  "args": {} }

{ "type": "ack", "id": "cmd_abc123", "ok": true }
```

Media streams (camera) are separate:
- **MJPEG** initially over HTTP `GET /stream` (simple, works in any browser)
- **H.264 via WebRTC** later (lower bandwidth, supports peer-to-peer through Tailscale)

### Jetson ↔ Claude API

Standard `https://api.anthropic.com/v1/messages` with tools. The Jetson holds the API key. The PC/web never sees it.

---

## 6. Network topology

### Phase 1 (LAN only)

```
Jetson ── Wi-Fi 5GHz ── Home AP ── Wi-Fi/Ethernet ── PC
                                                      └── browser localhost:3000
                                                          (Next.js dev server)
```

PC's HUD connects to `ws://<jetson-lan-ip>:8080/ws`.

### Phase 10 (Internet reachability)

```
Jetson ─── Tailscale ─── Tailscale Funnel / Cloudflare Tunnel
                                  │
                                  ▼
                          public https URL
                                  │
                                  ▼
                  Browser (any device, any network)
                          authenticates with
                  user identity (Tailscale SSO / OAuth)
```

The PC also becomes optional at this point — anyone with an authorized
identity can use the HUD from anywhere.

---

## 7. Persistence and state

| Lives where | What | Format |
|---|---|---|
| Jetson | Robot's world model (current pose, recent obs) | In-memory + SQLite snapshots |
| Jetson | Map (sparse SLAM points + named regions) | SQLite + binary blob |
| Jetson | Item registry (detections anchored to map) | SQLite |
| Jetson | Long-term memory (facts user told it) | SQLite + vector index |
| Jetson | Agent transcripts | append-only JSONL |
| Jetson | Audit log (every motion command, every tool call) | append-only JSONL |
| PC | Gaussian Splat outputs (`.ply`, `.splat`) | binary files |
| PC | Recorded sessions (for replay / dataset) | mp4 + JSONL |
| Cloud / origin | Backups of Jetson state | nightly rsync to user's storage |

---

## 8. Phase plan (revised, Jetson-as-brain from day 1)

| Phase | Lands | Proves |
|---|---|---|
| 0. Firmware baseline ✅ | UNO + ESP32 rebuilt + uploaded + JSON commands working | The chain is alive |
| **1. Jetson bringup** | Jetson on network, SSHable from PC; CUDA/TRT versions confirmed; Jetson↔UNO UART exchange working (same JSON commands) | Jetson can talk to robot |
| 2. Robot service skeleton | `zip-uno-link` + `zip-motion` + `zip-control-plane` on Jetson; web HUD on PC drives the robot from a browser | First closed loop via Jetson |
| 3. Camera + first vision | USB or CSI camera + `zip-camera` MJPEG + `zip-perception` YOLO TRT continuous, overlay in HUD | Pixels and inference work on Jetson |
| 4. Sensor fusion + obstacle avoidance | UNO telemetry + IMU + visual cues → pose estimate. Local safety stop on ultrasonic + vision | First real autonomy |
| 5. Voice loop | Browser-side STT/TTS (push-to-talk Phase 1), wake word later. Agent stub: echo + canned tools | Audio loop closed without robot-side mic |
| 6. Agent skeleton | Claude tool-calling on Jetson, tool registry: `motion.*`, `vision.*`, `speak`, `memory.*` | Conversational behaviors work |
| 7. SLAM on Jetson | MASt3R-SLAM TRT engine (or RTAB-Map fallback) | Robot knows where it is |
| 8. Goal-directed driving | Path planner over the sparse map, `motion.go_to(name|pose)` tool | Robot drives purposefully |
| 9. Item registry | YOLO detections anchored to map coords, persisted, queryable | Spatial memory works |
| 10. Internet reachability | Tailscale Funnel or Cloudflare Tunnel; auth on WebSocket | HUD works from anywhere |
| 11. Dense reconstruction | Gaussian Splat training on PC, output served to HUD | Pretty rooms |
| 12. Autonomous behaviors | Schedules, patrols, find-and-report, routines | True autonomy |
| 13. Polish | Personality, long-term memory, voice tuning, mobile-friendly HUD | It's a being, not a tool |

Each phase should end with a demo-able state. If it doesn't, the phase isn't done.

---

## 9. Open questions (to resolve during Jetson bringup)

- **JetPack version** (6.0 / 6.1 / 6.2) — determines CUDA + TensorRT versions and our PyTorch / Ultralytics compatibility
- **Storage**: NVMe (recommended), eMMC, or SD card?
- **Wi-Fi**: built-in M.2 module or USB dongle?
- **Camera choice**:
  - USB UVC webcam (Logitech C920 ≈ $70) — easy, decent quality
  - Intel RealSense D435i (~$300) — RGBD, IMU, ideal for SLAM
  - Orbbec Gemini 335 (~$200) — cheaper RGBD alternative
  - Arducam IMX477 CSI ($30-80) — high quality, needs ribbon routing
- **ROS 2 vs custom internal bus**: ROS 2 Humble has tooling but is heavy; zmq/NATS pubsub is lighter and easier to integrate with Python asyncio. To decide after Phase 2 prototyping.
- **Audio strategy**: PC speakers (V1), browser audio (V2), I²S on robot (V3)?
- **Power**: Jetson draws ~15W. Robot battery sizing review needed before mounting.

---

## 10. What stays the same from V1

- UNO firmware (`zip_robot_uno`) — re-used as-is
- JSON-over-UART protocol — exact same
- Next.js HUD patterns — heavy reuse from V1 `app/` directory
- Claude API usage — same SDK, similar tool definitions
- Tool registry pattern — reused conceptually
- Permission tiers (READ / WRITE / ACT) — reused
- LangGraph-style agent orchestration — reused if it served us well in V1

## 11. What's new for V2

- Jetson Orin Nano Super as the on-robot brain (V1 used direct USB to Jetson but only briefly; V2 makes it the architectural pillar)
- WebSocket-first client/server contract (vs V1's tight Next.js coupling)
- Auth from day 1 (planning for internet reachability)
- SLAM as a real subsystem (V1 had vision but no localization)
- Item registry with spatial anchoring (V1 had vision but no persistent spatial memory)
- Wake word (V1 was push-to-talk-style)
- Gaussian Splat dense reconstruction (V1 didn't attempt)
- ESP32-cam deprecated (V1 had it; V2 doesn't need it)
