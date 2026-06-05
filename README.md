# Zip

A small, layered AI system that lives in three places:

1. **[jarvis/](./jarvis)** — the AI friend, on a Jetson Orin Nano Super
2. **[zip-v2/](./zip-v2)** — the autonomous robot it can drive when it's around
3. **[zip-v1/](./zip-v1)** — the OpenAI-powered predecessor (archived reference)

## What's primary right now

**[jarvis/](./jarvis)** — a *vision-first* agent on the Jetson. When the robot
isn't around, Jarvis still sees the world through a Logitech C615 and runs
local perception:

- **[jarvis/depth-lab/](./jarvis/depth-lab)** — Depth Anything V2 Small on CUDA
- **[jarvis/perception-lab/](./jarvis/perception-lab)** — YOLO11n TRT FP16
- **[jarvis/splat-lab/](./jarvis/splat-lab)** — Depth Anything 3 → 3D Gaussian
  Splat → SuperSplat viewer in the browser  *(🔄 WIP: black-render bug —
  fix lives in `scripts/bake.py.knn-init-from-pc`, needs verification)*
- **[jarvis/llm/](./jarvis/llm)** — ⏸️ planned future brain; OpenClaw + local
  Qwen3-4B experiment installed but **not yet integrated** with the vision
  stack (see RESEARCH_AND_DECISIONS.md for the strategic verdict)

## The robot, when it's around

**[zip-v2/](./zip-v2)** — an Elegoo Smart Car V4.0 chassis driven over Wi-Fi:

- **[zip-v2/hud/](./zip-v2/hud)** — Next.js cockpit on the PC
- **[zip-v2/brain/](./zip-v2/brain)** — Python `zip_brain` on the Jetson
  *(git submodule → [zip-brain](https://github.com/steffenpharai/zip-brain))*
- **[zip-v2/firmware/](./zip-v2/firmware)** — UNO (ATmega328P) + ESP32-S3
  camera bridge

Current phase: **5.3a** (depth + wheel safety lock). Wheels lock by default
in desk mode; explicit `ZIP_MOTION_LOCKED=0` required to drive.

## The predecessor

**[zip-v1/](./zip-v1)** — OpenAI voice control + ROS2 + cloud LLM, archived
as the *predicate*. Full source preserved at the
[`v1-archive`](https://github.com/steffenpharai/zip/tree/v1-archive) tag.

## Three immovable rules

1. **UNO owns time** — PWM, motor slew, deadman watchdog. Never bypass.
2. **UART is exactly 500000 baud** (UBRR=3 on ATmega328P @ 16 MHz).
3. **Wheels locked by default** on the bench. Unlock explicitly.

## Quick links

- **Constellation architecture:** [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)
- **Roadmap (phases):** [docs/ROADMAP.md](./docs/ROADMAP.md)
- **Hardware inventory:** [docs/HARDWARE.md](./docs/HARDWARE.md)
- **Known issues:** [docs/KNOWN_ISSUES.md](./docs/KNOWN_ISSUES.md)
- **Agent orientation:** [AGENTS.md](./AGENTS.md)
- **Recent changes:** [CHANGELOG.md](./CHANGELOG.md)
