# GitHub Copilot / Cursor / AI agent instructions

This file is read automatically by GitHub Copilot, Cursor, and other
IDE-integrated AI agents. It points them at the right context fast.

## TL;DR

**Read [`AGENTS.md`](../AGENTS.md) at the repo root first.** It's the
canonical, comprehensive orientation for any AI agent working in this
repo. This file is a short index; AGENTS.md is the source of truth.

## Repo shape (post 2026-06-04 restructure)

```
jarvis/      Vision-first AI on Jetson (PRIMARY current focus)
  depth-lab/ perception-lab/ splat-lab/ llm/
zip-v2/      The autonomous robot
  hud/       Next.js 16 cockpit (Windows PC)
  brain/     Python service on Jetson (git submodule -> zip-brain)
  firmware/  UNO (Arduino) + ESP32-S3 (PlatformIO)
  bridge/    Legacy Node.js robot bridge (not in current loop)
zip-v1/      Archived predecessor (read-only)
docs/        Umbrella docs (ARCHITECTURE, ROADMAP, KNOWN_ISSUES, ADRs, ...)
.github/     Repo tooling
```

## The three immovable rules (do not violate)

1. **UNO owns time** — motion control lives on the ATmega328P, not the brain
   or HUD. See [ADR 0002](../docs/adr/0002-uno-owns-time.md).
2. **UART is exactly 500000 baud** — not 460800. See
   [ADR 0003](../docs/adr/0003-uart-500k-baud.md).
3. **Wheels locked by default on the bench** — `ZIP_MOTION_LOCKED=1` is
   the default. See [ADR 0005](../docs/adr/0005-wheels-locked-default.md).

If you find yourself wanting to break one, **pause and ask the human**.

## Where things live now

| You want to edit | Path |
|---|---|
| HUD pages/components | `zip-v2/hud/app/`, `zip-v2/hud/components/v2/` |
| HUD hooks / state / WS | `zip-v2/hud/lib/v2/` |
| Brain Python | `zip-v2/brain/zip_brain/` (submodule — separate PR) |
| UNO firmware | `zip-v2/firmware/uno/src/main.cpp`, `include/config.h` |
| ESP32 camera firmware | `zip-v2/firmware/esp32-cam/src/main.cpp` |
| Jarvis vision labs | `jarvis/depth-lab/`, `jarvis/perception-lab/`, `jarvis/splat-lab/` |
| OpenClaw / Qwen exploration | `jarvis/llm/` (deferred per ADR 0006) |
| Architecture docs | `docs/ARCHITECTURE.md`, `docs/adr/` |
| Known gotchas | `docs/KNOWN_ISSUES.md` |
| Phase tracking | `docs/ROADMAP.md`, `zip-v2/docs/PHASES.md` |
| Protocols (wire formats) | `zip-v2/docs/PROTOCOLS.md` |

## Common verification commands

```bash
# HUD
cd zip-v2/hud
npm install
npm run typecheck
npm run build

# UNO firmware
cd zip-v2/firmware/uno
pio run -e uno

# ESP32 camera firmware
cd zip-v2/firmware/esp32-cam
pio run -e esp32cam_sta

# Brain (on Jetson)
ssh zip-jetson
sudo systemctl restart zip-brain
sudo journalctl -u zip-brain -f
```

## Code style highlights

- **TypeScript:** strict mode; no `any` without a comment.
- **Python:** type hints on public functions; async-first.
- **C++ (firmware):** no dynamic alloc in motor paths; guard every
  `-D`-overridable macro with `#ifndef`.

## What you should NEVER do

- Bypass the motion gateway (direct UART writes from a script).
- Change `ZIP_MOTION_LOCKED` default to `0` "for convenience."
- Commit `node_modules/`, `.pio/`, `.venv/`, `*.engine`, `*.onnx`,
  `*.pt`, `models/`, or anything heavy. Respect `.gitignore`.
- Force-push to `master`.
- "Fix" `next lint` — it's a known Next.js 16 bug; the placeholder
  script is intentional.
- Use `460800` baud anywhere. It silently transmits at 500000 on AVR.
  See [ADR 0003](../docs/adr/0003-uart-500k-baud.md).

## When you're done

- Self-review the diff before requesting human review.
- Fill the [PR template](./PULL_REQUEST_TEMPLATE.md) honestly,
  especially the "three immovable rules check."
- For safety-critical changes (motion, firmware, brain motion gateway),
  ALWAYS request explicit human review even if CI is green.

## Memory / state

If your agent has persistent memory across sessions, look for these
memory files at `C:\Users\<user>\.claude\projects\C--Zip\memory\`:

- `project_zip_v2_session_handoff.md` — current state
- `reference_repo_rename_2026_06_04.md` — URL history
- `reference_openclaw_jetson_deploy.md` — 8 GB Ollama tuning
- `reference_jetson_perception_deploy.md` — YOLO on Jetson recipe
- `feedback_jetson_ssh_use_openssh.md` — use stock Windows OpenSSH

These are point-in-time snapshots; verify against the current code
before asserting as fact.
