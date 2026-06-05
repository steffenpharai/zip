# Zip v2 — the autonomous robot

The embodied side of [Zip](../README.md): an Elegoo Smart Car V4.0 chassis
driven from a Next.js cockpit over Wi-Fi, with the Jetson as on-board brain.

## Three components

| Path | What it is | Lives on |
|---|---|---|
| **[hud/](./hud)** | Next.js 16 cockpit (drive input, telemetry, 3D viewport) | PC |
| **[brain/](./brain)** | Python `zip_brain` — perception + motion + planner | Jetson (submodule) |
| **[firmware/](./firmware)** | UNO (motor control) + ESP32-S3 (camera bridge) | Robot |

## Three immovable rules

1. **UNO owns time** — PWM, motor slew, deadman watchdog. Never bypass.
2. **UART is exactly 500000 baud** (UBRR=3 on ATmega328P @ 16 MHz).
   Any serial tweak must preserve this exact rate (Phase 3.5 latency win).
3. **Wheels locked by default** on the bench. `ZIP_MOTION_LOCKED=0` on
   Jetson explicitly required to drive (Phase 5.3a desk-mode safety).

## How to run it

```bash
# 1) HUD (PC, Windows)
cd hud
npm install
npm run dev:local            # → http://localhost:3000/v2

# 2) Brain (Jetson — managed by systemd)
ssh zip-jetson
sudo systemctl enable --now zip-brain
sudo journalctl -u zip-brain -f

# 3) Firmware (PlatformIO, USB)
cd firmware/uno
pio run -e avr_smartcar --target upload

cd ../esp32-cam
pio run -e esp32s3_ov2640 --target upload
```

## Where it talks

- **HUD ↔ Brain:** WebSocket `ws://192.168.55.1:8080/ws` (USB-C) or robot
  AP `ws://192.168.4.1:8080/ws` (Wi-Fi). Sticky bus topics replay last
  value to new subscribers — no blank-start.
- **Brain ↔ UNO:** UART `/dev/ttyUSB0` @ 500000 baud, JSON protocol.
- **Brain ↔ ESP32 camera:** HTTP proxy `http://zip-esp32-cam.local:81/stream`
  (mDNS, ESP32 joins home Wi-Fi as STA).

## Phase status

See [docs/PHASES.md](./docs/PHASES.md). Current: **5.3a shipped** (depth
panel + wheel safety lock). Queued: 5.4 (AFT cam coverage), 6 (anchored
object locations), 7 (SLAM).

## Docs

- [ARCHITECTURE.md](./docs/ARCHITECTURE.md) — three-tier ownership
- [PROTOCOLS.md](./docs/PROTOCOLS.md) — UART JSON + WebSocket envelopes
- [DEPLOY.md](./docs/DEPLOY.md) — cold-start from fresh Jetson
- [DEV_WORKFLOW.md](./docs/DEV_WORKFLOW.md) — build, test, deploy
- [KNOWN_ISSUES.md](./docs/KNOWN_ISSUES.md) — hardware gotchas
- [JETSON_FACTS.md](./docs/JETSON_FACTS.md) — captured Jetson state
- [JETSON_BRINGUP.md](./docs/JETSON_BRINGUP.md) — Phase 1 detailed steps
- [PHASE5_PLAN.md](./docs/PHASE5_PLAN.md) — Phase 5 deep-dive
- [ELEGOO_MOTION_CONTROL.md](./docs/ELEGOO_MOTION_CONTROL.md) — chassis ref

## Legacy

- [`bridge/`](./bridge) — Node.js robot bridge daemon from the V1→V2
  transition; kept as a reference, NOT used in current Phase-5.x flow
  (brain owns UART directly via pyserial-asyncio).
- [`legacy/`](./legacy) — old standalone motor tests, V1 robot tools.
