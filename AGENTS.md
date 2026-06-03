# AGENTS.md — Orientation for the next agent

If you are an AI agent (Claude, etc.) picking up this project, read this
**first**. It points you at the right docs in the right order without
making you re-derive context that's already captured.

## What this project is, in three sentences

ZIP V2 is an autonomous house robot built on the Elegoo SmartCar V4
chassis, with a Jetson Orin Nano Super as the on-robot brain and a
Next.js operator console running on a PC (or eventually web/phone). The
Arduino UNO does hard-real-time motor control; the Jetson does
perception, planning, the LLM agent, and voice; the PC is an
observability + control surface, not the brain. The robot is the agent —
PC/web is a window into it.

## Required reading, in order

1. [`README.md`](./README.md) — high-level overview, repo layout, quick start.
2. [`docs/v2/ARCHITECTURE.md`](./docs/v2/ARCHITECTURE.md) — three-tier
   split, ownership rules, PC/Jetson/UNO responsibilities, full phase plan.
3. [`docs/v2/PHASES.md`](./docs/v2/PHASES.md) — what's done, what's
   in-progress, what's blocked, what's next.
4. [`docs/v2/PROTOCOLS.md`](./docs/v2/PROTOCOLS.md) — every wire format
   between the layers (UART JSON, WebSocket envelopes, HTTP MJPEG).
5. [`docs/v2/KNOWN_ISSUES.md`](./docs/v2/KNOWN_ISSUES.md) — hardware /
   firmware gotchas the previous agent had to discover the hard way. Read
   this before debugging anything that smells weird.
6. [`docs/v2/DEPLOY.md`](./docs/v2/DEPLOY.md) — how to bring the system
   up from a fresh Jetson + cables. Also explains what's normally already
   set up.

## Repo layout (high level)

```
C:\Zip                       # this repo → github.com/steffenpharai/zip-v2
├── README.md
├── AGENTS.md                # ← you are here
├── CHANGELOG.md             # per-phase ship log
├── docs/v2/                 # current architecture + phase docs
│   ├── ARCHITECTURE.md
│   ├── PHASES.md
│   ├── PROTOCOLS.md
│   ├── DEPLOY.md
│   ├── DEV_WORKFLOW.md
│   ├── KNOWN_ISSUES.md
│   ├── JETSON_BRINGUP.md    # Phase 1 record
│   └── JETSON_FACTS.md      # captured hardware/software state
├── docs/archive/v1/         # legacy V1 docs (do NOT take as current)
├── robot/firmware/
│   ├── zip_robot_uno/       # ATmega328P motor controller (current)
│   ├── zip_esp32_cam_sta/   # ESP32-S3 STA-mode OV2640 (current, Phase 3.3)
│   ├── zip_esp32_cam/       # V1 AP-mode firmware (deprecated, kept for reference)
│   └── zip_esp32_bridge/    # V1 Wi-Fi/UART bridge (deprecated)
├── app/v2/                  # Next.js operator console (the HUD)
├── components/v2/           # HUD components: 3D viewport, gauges, etc.
├── lib/v2/                  # HUD hooks: WS client, drive input, telemetry
└── jetson/                  # nested repo → github.com/steffenpharai/zip-brain
                             #   (Python brain, gitignored by outer repo)
```

The **Jetson Python service** is its own repo at `jetson/`. It has its own
[`AGENTS.md`](./jetson/AGENTS.md), `README.md`, etc. Read those when you're
working on the brain side.

## Where things actually run

- **HUD** at `http://localhost:3000/v2` (Next.js dev server on the PC,
  served via `npm run dev:local`). Connects to the Jetson by default at
  `ws://192.168.55.1:8080/ws` (USB-C bridge).
- **Brain** as a `systemd` unit (`zip-brain.service`) on the Jetson at
  `/home/zip/zip`. Serves WebSocket + HTTP on `:8080`. Auto-starts on
  boot.
- **UNO** firmware is in flash; runs from cold start; connects to the
  Jetson via USB-A→USB-B cable through the SmartCar shield's CH340.
- **ESP32-S3** firmware is in flash; runs from cold start; joins the
  home Wi-Fi (`TellMyWifILoveHer`); advertises `zip-esp32-cam.local`;
  serves MJPEG on `:81/stream`.

## Hardware cabling, as currently set up (Phase 3 final state)

- **PC USB-A → ESP32 USB-C**: used for *flashing only*. The ESP32 then
  runs on shield 5 V and talks to the Jetson over Wi-Fi. The 4-pin
  CH340-to-ESP32 connector on the shield **stays unplugged** — it pins
  ESP32's GPIO0 low at boot, see KNOWN_ISSUES.
- **PC USB-B → Jetson USB-C**: ethernet-over-USB-C bridge. PC at
  192.168.55.100, Jetson at 192.168.55.1. This is the dev path.
- **Shield USB-B → Jetson USB-A**: how the Jetson talks to the UNO via
  the shield's CH340 at `/dev/ttyUSB0`. Required `ch341.ko` to be built
  from source against the L4T kernel (we did this; see KNOWN_ISSUES).
- **Logitech C615 USB → Jetson USB-A**: the primary camera at
  `/dev/video0`.

## How to do things safely

- **Don't break the on-robot autonomy contract.** If a change would make
  the robot unable to drive when the PC is off or the network drops,
  rethink it.
- **The UNO owns motor PWM. Don't try to close loops over Wi-Fi.**
- **Deadman TTL is sacred.** Every motion command has a TTL the UNO
  enforces. Never raise it beyond 500 ms.
- **`secrets.h` is gitignored.** Never put credentials in tracked files.
  `pw.txt` is also gitignored as a fallback drop point.
- **CH340 on Linux fights `brltty`.** Don't be surprised when a fresh
  Ubuntu install needs the brltty udev rule disabled to expose
  `/dev/ttyUSB0`. See KNOWN_ISSUES.
- **ESP32-S3 USB-Serial/JTAG is finicky.** It enters bootloader on any
  DTR toggle. Always reset it via the physical RST button if you need to
  see the boot banner.
- **GitHub auth on Jetson** is via the `zip` user's `~/.netrc`
  (HTTPS with token). Don't refactor this without confirming with the
  user — the `gh` auth tokens lack `admin:public_key` scope so SSH-key
  paths don't work without an interactive `gh auth refresh`.

## Memory files

The previous agent's persistent context lives in
`C:\Users\phara\.claude\projects\C--Zip\memory\MEMORY.md` and a few
per-topic files alongside it. Read these to understand decisions and
gotchas that aren't in the repo. They are NOT the canonical reference —
the repo docs are — but they explain *why* certain choices were made.

Key memory entries (relative paths in that dir):
- `project_zip_v2_hardware.md`
- `project_zip_v2_architecture_decisions.md`
- `project_zip_v2_decisions.md`
- `reference_jetson_brltty_ch340_gotcha.md`
- `reference_esp32_flash_hardware.md`
- `feedback_use_project_toolchain.md`
- `feedback_jetson_ssh_use_openssh.md`

## What to do next

Phase 4 (voice), Phase 5/6 (agent + LLM), Phase 7 (SLAM) are the natural
next forks. See [`docs/v2/PHASES.md`](./docs/v2/PHASES.md) for the
current state of each and the locked-in design decisions.

When in doubt, ask the user. When the user is clear, build small,
verify, commit.
