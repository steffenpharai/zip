# Zip

> A small, layered AI/robotics system: a vision-first agent that can
> drive a robot when the robot's around, and reconstruct the room when
> it isn't.

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![Status: Active](https://img.shields.io/badge/status-active-brightgreen.svg)](#status)
[![Phase: 5.3a](https://img.shields.io/badge/robot--phase-5.3a-cyan.svg)](./docs/ROADMAP.md)
[![Jarvis: vision](https://img.shields.io/badge/jarvis-vision--first-orange.svg)](./jarvis/README.md)
[![Code style: opinionated](https://img.shields.io/badge/code-opinionated-purple.svg)](./CONTRIBUTING.md)

## Where things live

| Directory | Role | Status |
|---|---|---|
| **[`jarvis/`](./jarvis)** | Vision-first AI agent on the Jetson | ⭐ **primary** |
| **[`zip-v2/`](./zip-v2)** | The autonomous robot it can drive | ✅ Phase 5.3a shipped |
| **[`zip-v1/`](./zip-v1)** | OpenAI-powered predecessor | 🗄️ archived |
| **[`docs/`](./docs)** | Umbrella docs (architecture, roadmap, ADRs) | 📚 |
| **[`.github/`](./.github)** | Issue / PR templates, workflows, code owners | 🔧 |

## What's primary right now: **Jarvis**

A vision-first agent on a Jetson Orin Nano Super (8 GB). When the
robot isn't around, Jarvis still sees the world through a Logitech
C615 and runs local perception:

| Lab | Role | Status |
|---|---|---|
| [`jarvis/depth-lab/`](./jarvis/depth-lab) | Depth Anything V2 Small (CUDA, ~7 FPS) | ✅ ship-ready |
| [`jarvis/perception-lab/`](./jarvis/perception-lab) | YOLO11n TRT FP16 (~34 ms) | ✅ ship-ready |
| [`jarvis/splat-lab/`](./jarvis/splat-lab) | DA3 → 3D Gaussian Splat → browser viewer | 🔄 **WIP: splat renders black**, k-NN-init fix unverified |
| [`jarvis/llm/`](./jarvis/llm) | OpenClaw + local Qwen3-4B | ⏸️ installed, deferred ([ADR 0006](./docs/adr/0006-llm-on-jetson-deferred.md)) |

**Current concrete goal:** unblock the splat black-render — scp the
k-NN-init `bake.py` (preserved at
[`jarvis/splat-lab/scripts/bake.py.knn-init-from-pc`](./jarvis/splat-lab/scripts))
to the Jetson, re-run the launcher, and confirm the splat actually
renders in the SuperSplat viewer.

## The robot, when it's around: **Zip v2**

An Elegoo Smart Car V4.0 chassis driven over Wi-Fi:

```
PC (HUD)  ──WebSocket──►  Jetson (brain)  ──UART 500k──►  UNO (motors)
                              │
                              └──HTTP MJPEG──►  ESP32-S3 (camera)
```

| Component | What | Path |
|---|---|---|
| HUD | Next.js 16 + React 19 cockpit | [`zip-v2/hud/`](./zip-v2/hud) |
| Brain | Python asyncio + FastAPI service | [`zip-v2/brain/`](./zip-v2/brain) (submodule → [`zip-brain`](https://github.com/steffenpharai/zip-brain)) |
| Firmware | ATmega328P (motors) + ESP32-S3 (camera) | [`zip-v2/firmware/`](./zip-v2/firmware) |

**Current phase: 5.3a.** Depth panel + wheel safety lock. Wheels lock
by default in desk mode; explicit `ZIP_MOTION_LOCKED=0` required to drive.

## Three immovable rules

1. **UNO owns time** ([ADR 0002](./docs/adr/0002-uno-owns-time.md)) —
   PWM, motor ramp, deadman watchdog on the MCU.
2. **UART is exactly 500000 baud** ([ADR 0003](./docs/adr/0003-uart-500k-baud.md)) —
   integer UBRR at 16 MHz, zero baud error.
3. **Wheels locked by default on the bench** ([ADR 0005](./docs/adr/0005-wheels-locked-default.md)) —
   `ZIP_MOTION_LOCKED=1` is the default.

## Documentation

| Doc | What |
|---|---|
| [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) | One-picture system view + ownership rules |
| [`docs/ROADMAP.md`](./docs/ROADMAP.md) | Phases shipped, in flight, queued — robot and Jarvis |
| [`docs/HARDWARE.md`](./docs/HARDWARE.md) | Bill of materials, pinouts, network topology |
| [`docs/KNOWN_ISSUES.md`](./docs/KNOWN_ISSUES.md) | Every gotcha that bit us once |
| [`docs/GLOSSARY.md`](./docs/GLOSSARY.md) | Terminology |
| [`docs/adr/`](./docs/adr/) | Architecture Decision Records |
| [`AGENTS.md`](./AGENTS.md) | Orientation for AI agents (Claude, Codex, Cursor, etc.) |
| [`CONTRIBUTING.md`](./CONTRIBUTING.md) | How to contribute |
| [`SECURITY.md`](./SECURITY.md) | Security policy + responsible disclosure |
| [`CODE_OF_CONDUCT.md`](./CODE_OF_CONDUCT.md) | Contributor Covenant |
| [`CHANGELOG.md`](./CHANGELOG.md) | Notable shipped milestones |

## Quick start

```bash
# Clone the monorepo + brain submodule
git clone --recurse-submodules https://github.com/steffenpharai/zip.git
cd zip

# HUD (Windows PC)
cd zip-v2/hud
npm install
npm run dev:local        # → http://localhost:3000/v2

# Brain (Jetson — already installed via systemd)
ssh zip-jetson
sudo systemctl restart zip-brain
sudo journalctl -u zip-brain -f

# UNO firmware
cd zip-v2/firmware/uno
pio run -e uno --target upload

# ESP32 camera firmware
cd zip-v2/firmware/esp32-cam
cp include/secrets.example.h include/secrets.h    # add Wi-Fi creds
pio run -e esp32cam_sta --target upload
```

For a fresh Jetson cold-start, see [`zip-v2/docs/DEPLOY.md`](./zip-v2/docs/DEPLOY.md).

## Repository hygiene

- **Private monorepo**, but written as if public — clear docs, no
  secrets in tree, every decision tracked as an ADR.
- **Conventional-ish commits** — see [CONTRIBUTING.md](./CONTRIBUTING.md).
- **CI** — typecheck + build on every HUD PR, firmware build on every
  firmware PR, docs link check on every markdown PR.
- **Dependabot** — npm + GitHub Actions, weekly, grouped to reduce
  PR noise.
- **CODEOWNERS** — safety-critical paths (motion gateway, UNO motor
  code, ADRs) flagged for explicit review.

## Status

- ✅ **Robot mainline functional** — drive, telemetry, perception,
  mapping, planner, depth panel.
- 🔄 **Jarvis splat-lab WIP** — black-render bug, fix unverified.
- ⏸️ **Jarvis LLM deferred** — pending hybrid PC-brain architecture
  ([ADR 0006](./docs/adr/0006-llm-on-jetson-deferred.md)).
- 🔧 **Open hardware tasks** — Jetson on-robot power; permanent camera
  mounts. See [`docs/HARDWARE.md`](./docs/HARDWARE.md).

---

**Repo URL history:** `steffenpharai/Zip` (V1) → `steffenpharai/zip-v1-archive`
+ `v1-archive` tag (2026-06-04). `steffenpharai/zip-v2` →
`steffenpharai/zip` (2026-06-04, canonical monorepo).
