# ZIP V2

> An autonomous robot car you control from a browser. Drives around your house,
> sees through two cameras, runs on a Jetson, looks like a fighter-jet cockpit.

## What this repo contains

The **PC-side** half of ZIP V2: documentation, the operator-console HUD
(Next.js), and the UNO + ESP32 firmware that ships on the robot. The
**on-robot Python brain** lives in a sibling repo at
[`steffenpharai/zip-brain`](https://github.com/steffenpharai/zip-brain),
mounted here at [`/jetson`](./jetson) as a nested git repo (gitignored by the
outer one so the two are deployable independently).

## Where to start as a human or an agent

| If you're… | Read first |
| --- | --- |
| New to the project | [`docs/v2/ARCHITECTURE.md`](./docs/v2/ARCHITECTURE.md) |
| An agent picking up this work | [`AGENTS.md`](./AGENTS.md) |
| Bringing the robot up from cold | [`docs/v2/DEPLOY.md`](./docs/v2/DEPLOY.md) |
| Looking for what's done vs. next | [`docs/v2/PHASES.md`](./docs/v2/PHASES.md) |
| Working on wire protocols | [`docs/v2/PROTOCOLS.md`](./docs/v2/PROTOCOLS.md) |
| Hitting weird hardware behaviour | [`docs/v2/KNOWN_ISSUES.md`](./docs/v2/KNOWN_ISSUES.md) |
| Modifying a specific layer | [`docs/v2/DEV_WORKFLOW.md`](./docs/v2/DEV_WORKFLOW.md) |
| Working on the standalone Jetson AI agent ("Jarvis") | [`docs/jarvis/README.md`](./docs/jarvis/README.md) |
| Looking for V1 (deprecated) | [`docs/archive/v1/`](./docs/archive/v1/) |

## Three-tier architecture

```
PC / Web HUD  ←—WebSocket—→  Jetson Orin Nano Super  ←—UART—→  Arduino UNO
   (operator                  ("zip-brain": camera,        (motor PWM,
    console only)               agent, planner brain)        deadman safety)
                                       │
                                  Wi-Fi 5GHz
                                       │
                              ESP32-S3 OV2640 cam
                              (independent stream)
```

Three iron rules:

1. **UNO owns time.** PWM, slew, deadman — all on-MCU, never over the network.
2. **Jetson owns intent.** Perception, planning, motion commands, voice. The
   PC never closes a motor loop.
3. **PC/web is an observability + control surface.** The robot keeps working
   without the PC.

See [`docs/v2/ARCHITECTURE.md`](./docs/v2/ARCHITECTURE.md) for the full
diagram and rationale.

## Quick start (assuming hardware is already paired)

```bash
# On the PC: dev server for the HUD
npm install
npm run dev:local
# → http://localhost:3000/v2

# On the Jetson: the brain is a systemd service
sudo systemctl status zip-brain        # already auto-starts
sudo journalctl -u zip-brain -f        # follow logs
```

Cold-start from a freshly-flashed Jetson and unpaired hardware →
[`docs/v2/DEPLOY.md`](./docs/v2/DEPLOY.md).

## What's working as of this snapshot

- Phase 0–3 complete: clean firmware build pipeline, Jetson brain running
  as a systemd service, full V2 HUD operator console, manual drive over
  Wi-Fi/USB-C, **both cameras live** (Logitech C615 USB UVC + ESP32-S3
  OV2640 over Wi-Fi).
- Drive responsiveness: **~70 ms keydown→full-speed** (originally ~300 ms;
  see [`docs/v2/PHASES.md`](./docs/v2/PHASES.md) for the optimization trail).

## What's next

Phase 4 (voice loop), Phase 5/6 (agent skeleton + LLM tool calling),
Phase 7 (SLAM via MASt3R-SLAM). The phase plan and decisions are tracked
in [`docs/v2/PHASES.md`](./docs/v2/PHASES.md) and
[`docs/v2/ARCHITECTURE.md`](./docs/v2/ARCHITECTURE.md).

## License

The original V1 was MIT-licensed; V2 inherits the same.
