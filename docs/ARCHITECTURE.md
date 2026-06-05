# Architecture

How the pieces of [Zip](../README.md) fit together. This is the
umbrella-level picture. Component-level architecture lives in
[`zip-v2/docs/ARCHITECTURE.md`](../zip-v2/docs/ARCHITECTURE.md) (the
robot) and component READMEs under [`jarvis/`](../jarvis/).

## One picture

```
┌─────────────────────────────────────────────────────────────────┐
│  PC (Windows)                                                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  zip-v2/hud — Next.js 16 + React 19 cockpit              │   │
│  │  • drive input (keyboard / joystick)                     │   │
│  │  • telemetry sparklines                                  │   │
│  │  • 3D viewport + 2D occupancy map                        │   │
│  │  • camera feeds (bow + aft)                              │   │
│  │  • detection overlay + snapshot gallery                  │   │
│  │  • depth panel (Phase 5.3a)                              │   │
│  │  • motion-lock state badge                               │   │
│  └─────────────┬────────────────────────────────────────────┘   │
└────────────────┼────────────────────────────────────────────────┘
                 │ WebSocket ws://192.168.55.1:8080/ws (USB-C)
                 │           ws://192.168.4.1:8080/ws  (Wi-Fi)
                 │ + HTTP GET /cam/* /perception/* /depth/* /health
                 ▼
┌─────────────────────────────────────────────────────────────────┐
│  Jetson Orin Nano Super 8GB  (JetPack 6.2.1)                    │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  zip-v2/brain — Python (asyncio + FastAPI)               │   │
│  │  ┌─────────────────────────────────────────────────────┐ │   │
│  │  │  internal asyncio pub/sub bus (sticky topics)       │ │   │
│  │  └──┬──────────┬──────────┬──────────┬──────────┬──────┘ │   │
│  │     │          │          │          │          │        │   │
│  │  ┌──▼──┐  ┌────▼───┐  ┌───▼────┐ ┌───▼────┐ ┌───▼─────┐  │   │
│  │  │UART │  │ Camera │  │Motion  │ │Percept-│ │Mapping/ │  │   │
│  │  │link │  │ Hub    │  │Gateway │ │ion     │ │Planner  │  │   │
│  │  │     │  │(GST)   │  │+ Lock  │ │YOLO11n │ │A*+pure- │  │   │
│  │  │     │  │+ fanout│  │+ TTL   │ │+TRT FP16│ │pursuit │  │   │
│  │  └──┬──┘  └────┬───┘  └───┬────┘ └────────┘ └─────────┘  │   │
│  │     │          │          │                              │   │
│  │     │          │          │  ┌────────────────────────┐  │   │
│  │     │          │          │  │ FastAPI control plane  │  │   │
│  │     │          │          │  │  /ws, /cam/*, /health, │  │   │
│  │     │          │          │  │  /perception/*, /depth │  │   │
│  │     │          │          │  └────────────────────────┘  │   │
│  └─────┼──────────┼──────────┼──────────────────────────────┘   │
│        │ USB cam  │ HTTP cam │ UART 500000 baud (/dev/ttyUSB0)  │
│  ┌─────▼──────────▼──────────┼──────────────────────────────┐   │
│  │  Optional: jarvis/  (lives on same Jetson, time-shared)  │   │
│  │  depth-lab / perception-lab / splat-lab / llm (dormant)  │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────┼───────────────────────────────┘
                                  │ JSON-over-UART (N=0..210)
                                  ▼
┌─────────────────────────────────────────────────────────────────┐
│  Elegoo Smart Car V4.0                                          │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  UNO (ATmega328P @ 16 MHz)                               │   │
│  │  • 100 Hz control loop                                   │   │
│  │  • TB6612FNG dual H-bridge motor driver                  │   │
│  │  • MPU6050 IMU @ I²C 0x68                                │   │
│  │  • Ultrasonic + line + battery sensors                   │   │
│  │  • Hardware deadman (8 s) + software deadman (300 ms TTL)│   │
│  │  • Motion macros (figure-8, spin, wiggle)                │   │
│  └──────────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  ESP32-S3 OV2640 camera (STA mode)                       │   │
│  │  • Joins home Wi-Fi, mDNS zip-esp32-cam.local            │   │
│  │  • MJPEG :81/stream (httpd, ~15-25 fps at VGA)           │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

## The three immovable rules (with rationale)

### 1. UNO owns time

PWM, motor ramp/slew, the deadman watchdog, and motion macros all live
on the ATmega328P at a deterministic 100 Hz. The brain *intends*; the
UNO *executes*.

**Why:** The brain runs Linux. Linux ≠ deterministic. A blocked async
task that delayed a motor stop by 500 ms is a wheel-cracked-shin event.
The UNO is real-time — it cannot oversleep on a setpoint. If you find
yourself wanting to add PWM logic to the brain, you're about to break
this rule; instead, add a new `N=…` JSON message and implement it on
the UNO.

### 2. UART is exactly 500000 baud

Not 460800 ("about that"). 500000.

**Why:** At 16 MHz, the UNO's UBRR register evaluates to integer 3
(with U2X=1) for 500000 baud — zero baud error. 460800 rounds to the
same UBRR=3, but the actual rate is 500000 → 8.5% off from the requested
460800, breaking differential drive timing. See
[ADR 0003](./adr/0003-uart-500k-baud.md) and
[reference_avr_baud_math.md](../../C:/Users/phara/.claude/projects/C--Zip/memory/reference_avr_baud_math.md)
for the math.

### 3. Wheels locked by default on the bench

`ZIP_MOTION_LOCKED=1` is the brain's default. The motion gateway drops
all drive and macro commands; only `stop` and servo/sensor commands
get through. The HUD shows a "⊘ WHEELS LOCKED" badge.

**Why:** The robot lives on a desk during development. A test agent
that misfires a setpoint shouldn't yank a powered chassis off the desk.
Wheels stay locked until a human types `sudo systemctl edit zip-brain`
and sets `ZIP_MOTION_LOCKED=0` (or sets the env in the systemd drop-in).

See [ADR 0005](./adr/0005-wheels-locked-default.md).

## Data ownership map

| Concern | Owned by | Reasoning |
|---|---|---|
| Motor PWM / direction | UNO firmware | Deterministic real-time |
| Motor ramp / slew | UNO firmware | Same |
| Deadman watchdog | UNO firmware + brain re-send | Defense in depth |
| Motion intent (drive command) | Brain motion gateway | Single choke point for rate limit + lock |
| Wheels-locked state | Brain config | Persistent via systemd drop-in |
| IMU heading | UNO firmware → brain (sticky topic) | UNO polls MPU6050 @ 10 Hz, brain fuses |
| Ultrasonic distance | UNO firmware → brain (sticky topic) | UNO polls @ 2-4 Hz, brain consumes |
| Servo angle | UNO firmware (set by brain) | Mechanical state, no fusion needed |
| Camera frames | Brain CameraHub | Single capture, reference-counted fanout |
| Object detections | Brain perception loop | YOLO11n TRT FP16 inference |
| Snapshots (per-class crops) | Brain perception (`StateDirectory=zip`) | Persisted to `/var/lib/zip/snapshots/` |
| Occupancy map | Brain mapping | IMU + dead-reckon + ultrasonic raycast |
| Planned path | Brain planner | A* over inflated obstacles + pure-pursuit |
| Click-to-go goal | HUD → brain `client.goto` | Stateless, brain replans |
| Depth frames (on-demand) | Brain depth | DAv2 Small, lazy load, off-loop inference |
| Telemetry | HUD only | View-only; brain has the truth |

## Pub/sub bus (the brain's nervous system)

The brain has an in-process asyncio bus ([bus.py](../zip-v2/brain/zip_brain/bus.py)).
Topics are strings; payloads are dicts. Two flavors:

- **Sticky topics** publish to a "latest" cache. New subscribers
  immediately get the last value via `replay_latest=True`. Used for
  state snapshots (`uno.status`, `telemetry.sample`, `sensor.imu`,
  `map.pose`, `map.occupancy`, `motion.lock_state`). HUD reconnects
  see current state instantly.
- **Streams** are fire-and-forget. No replay. Used for events
  (`motion.setpoint`, `motion.stop`, `uno.raw`, `perception.snapshot`).

Subscribers get unbounded `asyncio.Queue` instances. Overflow drops
oldest. Publishers never block.

## Wire formats

| Hop | Protocol | Spec |
|---|---|---|
| HUD ↔ Brain | WebSocket JSON | [zip-v2/docs/PROTOCOLS.md](../zip-v2/docs/PROTOCOLS.md) |
| Brain → UNO | JSON-over-UART, 500 k baud | `{n:NNN,…}\n`, see PROTOCOLS.md |
| UNO → Brain | Fixed-field text replies | `{batt_mv:5023}`, `{ultra_cm:42}`, `{imu_-451}` (yaw × 10), `{tag_ok}` |
| Brain → ESP32 cam | HTTP proxy | upstream `:81/stream` MJPEG |
| ESP32 cam → world | mDNS + HTTP | `zip-esp32-cam.local:81/stream` |

## Failure modes (designed-in)

- **HUD disconnects:** brain has no active client → motion gateway
  emits `client.motion.stop` automatically after `client_timeout_s`
  (default 600 ms). Robot halts.
- **Brain crashes:** systemd restarts in ≤5 s. UNO's hardware watchdog
  (8 s) and TTL deadman (300 ms) ensure motion stops well before brain
  is back.
- **UNO firmware hangs:** hardware watchdog (8 s) resets the
  ATmega. Brain sees `uno.status.connected=false` until UART relink.
- **Ultrasonic reads ≤ 18 cm during follow:** planner emits STOP and
  re-plans. Reactive layer, independent of A*.
- **Camera process dies:** CameraHub auto-restarts the upstream
  GStreamer subprocess. Subscribers see a few frames of black, then
  recovery.
- **Submodule out of date:** the outer repo pins a specific brain SHA.
  CI flags drift on PR.

## Why a monorepo (with a submodule)

The brain is a separately-deployable Python service — it lives in its
own repo (`zip-brain`) so it can be pulled onto the Jetson independent
of the rest of this tree (the Jetson doesn't need the HUD, the firmware
toolchain, or the v1 archive).

But the brain's protocol is co-evolved with the HUD and the firmware.
A change to `N=200` setpoint encoding touches all three. A monorepo
with the brain as a submodule lets us:

- pin a specific brain version to a specific HUD / firmware version,
- atomically land cross-cutting protocol changes (brain PR, then bump
  submodule pointer in the outer repo's PR),
- still deploy the brain on the Jetson without dragging in the rest.

See [ADR 0001](./adr/0001-monorepo-with-submodule.md) for the trade-offs.

## What's NOT in this picture (yet)

- **LLM brain.** Jarvis's `llm/` exploration installed OpenClaw + Qwen3-4B
  on the Jetson but the strategic verdict (see
  [RESEARCH_AND_DECISIONS.md](../jarvis/llm/docs/RESEARCH_AND_DECISIONS.md))
  was: 8 GB is the wrong tier for a capable local agent. The future
  picture has a thin reflex model on the Jetson and the heavy lifting on
  the user's RTX 4070 Ti SUPER 16 GB PC over LAN.
- **SLAM (Phase 7).** Today's pose fusion is open-loop dead-reckoning;
  no loop closure, drift accumulates. MASt3R-SLAM was evaluated and
  rejected as too heavy for 8 GB; the replacement is TBD.
- **Hardware-mounted Jetson power.** Jetson currently sits on the desk
  with USB-C from the wall; on-robot deployment needs 5V/3-5A regulated
  USB-C or a 9-19V barrel — the 2S motor pack can't deliver this.
- **Voice (wake word + STT + TTS).** Designed in the architecture
  decisions doc, not yet implemented. openWakeWord + Whisper + Piper
  are the planned components.
- **Anchored objects (Phase 6).** Depth is shipped (5.3a); the next step
  is using depth + perception to pin object detections to map cells with
  metric coordinates.

## Reading order for a new contributor

1. [README.md](../README.md) — the elevator pitch.
2. This file.
3. [zip-v2/docs/PROTOCOLS.md](../zip-v2/docs/PROTOCOLS.md) — wire format.
4. [zip-v2/docs/DEPLOY.md](../zip-v2/docs/DEPLOY.md) — how to cold-start.
5. [docs/KNOWN_ISSUES.md](./KNOWN_ISSUES.md) — gotchas before you debug.
6. [docs/adr/](./adr/) — why the system looks the way it does.
