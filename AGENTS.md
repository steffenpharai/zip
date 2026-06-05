# AGENTS.md — Orientation for autonomous agents

If you are an AI agent (Claude, Codex, Cursor, OpenClaw, anything) picking
up work on this repo, **read this first**. It points you at the right
context in the right order and tells you what NOT to do.

## What this project is, in three sentences

Zip is a layered AI/robotics system. The headline component right now
is **[Jarvis](./jarvis/)** — a vision-first agent on a Jetson Orin Nano
Super (depth + perception + 3D Gaussian-splat reconstruction; LLM
exploration is dormant pending a hybrid PC-brain architecture). The
embodied side is **[Zip v2](./zip-v2/)** — an Elegoo Smart Car chassis
driven from a Next.js cockpit via a Python brain on the Jetson over a
WebSocket. **[Zip v1](./zip-v1/)** is the archived predecessor (OpenAI
voice + ROS 2), preserved as a reference predicate, not a migration
target.

## Required reading, in order

1. [`README.md`](./README.md) — elevator pitch + tree shape.
2. [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) — the umbrella picture:
   PC + Jetson + robot, who owns what, the bus, the pub/sub model.
3. [`docs/ROADMAP.md`](./docs/ROADMAP.md) — phase tracking across the
   robot, Jarvis vision, and Jarvis LLM tracks.
4. [`docs/GLOSSARY.md`](./docs/GLOSSARY.md) — terminology (Zip vs Jarvis
   vs OpenClaw, sticky topics, deadman, brain, HUD, etc.).
5. [`docs/KNOWN_ISSUES.md`](./docs/KNOWN_ISSUES.md) — gotchas. **Read
   this before debugging anything that smells weird.**
6. [`docs/adr/`](./docs/adr/) — decisions and the reasoning behind them.
   Skim the index; deep-read whichever ADR your change interacts with.

For component-level depth, also read:

- [`zip-v2/docs/PROTOCOLS.md`](./zip-v2/docs/PROTOCOLS.md) — every wire
  format (UART JSON, WebSocket envelopes, HTTP MJPEG).
- [`zip-v2/docs/DEPLOY.md`](./zip-v2/docs/DEPLOY.md) — cold-start a
  fresh Jetson.
- [`jarvis/README.md`](./jarvis/README.md) and component READMEs.
- The component's local `CLAUDE.md` if one exists.

## The three immovable rules (do not violate)

These have ADRs explaining why:

1. **UNO owns time** ([ADR 0002](./docs/adr/0002-uno-owns-time.md)) —
   PWM, motor ramps, the deadman watchdog live on the ATmega328P. Never
   duplicate motion logic in the brain or HUD.
2. **UART is exactly 500000 baud** ([ADR 0003](./docs/adr/0003-uart-500k-baud.md)) —
   not 460800 ("about that"). 500000.
3. **Wheels lock by default on the bench** ([ADR 0005](./docs/adr/0005-wheels-locked-default.md)) —
   `ZIP_MOTION_LOCKED=1` is the default. Don't silently un-default it.

If you find yourself wanting to break one of these, **stop and open an
ADR proposing the change**. Don't just do it.

## What you CAN proceed on without asking

- Documentation: cross-references, typo fixes, expanding examples in
  any `*.md` file.
- HUD UI polish that doesn't touch the WebSocket protocol.
- Adding tests (especially the empty V2 cockpit E2E coverage).
- Refactoring within a single file/module without changing public API.
- Per-component `CLAUDE.md` improvements in the directory you're
  editing in.

## What you SHOULD pause and ask about

- **Anything that touches the motion gateway** (`zip-v2/brain/zip_brain/motion.py`).
  Safety-critical. Default to no.
- **Anything that touches UNO firmware motor code** (`zip-v2/firmware/uno/src/main.cpp`).
  Real-time, hard to test, easy to brick the robot.
- **Anything that adds a new dependency to the brain** — the Jetson
  has 8 GB of unified memory and any package that grabs CUDA memory
  competes with perception. Ask first.
- **Anything that changes the wire format** (UART JSON, WebSocket
  envelopes). Triple-coupling: brain + HUD + firmware. Get sign-off
  before designing.
- **Anything that pushes to a remote, opens a PR, deploys, or runs
  destructive `git` operations.** Always ask.
- **Anything that unlocks the wheels without explicit human request.**

## What you should NEVER do

- Bypass the motion gateway (e.g., direct UART writes from a script).
- Silently change `ZIP_MOTION_LOCKED` default to `0`.
- Hardcode credentials. The `secrets.h` for ESP32 Wi-Fi is gitignored
  for a reason; the OpenAI key for the V1 routes is in `.env`.
- Add a "convenience" PWM control path that doesn't go through
  `motion.py`.
- Commit `node_modules/`, `.pio/`, `.venv/`, `models/`, `*.engine`,
  `*.onnx`, or other build/runtime artifacts. `.gitignore` covers
  these; respect it.
- Force-push to `master` or rewrite shared history.
- "Fix" `next lint` (it's a known upstream bug; the placeholder script
  is intentional).

## How to verify your changes

| You changed | Verification |
|---|---|
| HUD code | `cd zip-v2/hud && npm run typecheck && npm run build` (and visual test against live or mocked brain) |
| Brain (Python) | `ssh zip-jetson && sudo systemctl restart zip-brain && journalctl -u zip-brain -f` for 60 s without exceptions |
| UNO firmware | `pio run -e uno` (size report), then upload + `pio device monitor -b 500000` and exercise N=120 diagnostics |
| ESP32 firmware | `pio run -e esp32cam_sta`, upload, check `http://zip-esp32-cam.local/health` |
| splat-lab Python | scp to Jetson, run launcher, eyeball SuperSplat viewer in browser |
| Docs only | `grep -r "broken-link-i-just-created" .` to avoid dangling refs |

## Workflow conventions

### Use the right tool for the job

- File reads / searches: `Read`, `Grep`, `Glob`. NOT `cat`, `grep`,
  `find` via `Bash`.
- Edits: `Edit` for surgical changes; `Write` only for new files or
  full rewrites (and `Read` first if the file exists).
- Bash: for git, npm, ssh, pio, complex pipes. Not for read/edit.

### Commits

- One logical change per commit.
- First line: imperative, ≤72 chars, prefix like `phase:`, `fix:`,
  `safety:`, `docs:`, `refactor:`.
- Body explains **why**, not what. Reference the relevant ADR or phase
  doc.
- Co-author your work with the model that did it (per the repo
  convention; see existing log).

### When using subagents (parallel research)

- Use `Agent` tool with `Explore` subagent for read-only code surveys.
- Use `Agent` with `general-purpose` for multi-step research.
- Brief the subagent like a smart colleague — include file paths, the
  question, and the desired output format. Don't say "based on your
  findings, implement X" — synthesis is your job.

### When you're stuck

- The robot is on a desk; you can't drive-test from a remote session.
  Mock the brain, or stop and ask the human to drive-test on hardware.
- The Jetson may be unreachable (powered off / USB-C disconnected). If
  `ssh zip-jetson` times out, try `ssh zip-jetson-wifi`. If both fail,
  the human needs to power the Jetson back on — you can't.
- Don't go in circles: if you've tried the same approach 3 times and
  it hasn't worked, switch strategies or escalate.

## Per-component agent docs

If a directory has a `CLAUDE.md`, prefer its guidance over this file
for changes in that directory:

- [`zip-v2/hud/CLAUDE.md`](./zip-v2/hud/CLAUDE.md) — HUD-specific
- [`zip-v2/firmware/CLAUDE.md`](./zip-v2/firmware/CLAUDE.md) — firmware-specific
- [`jarvis/splat-lab/CLAUDE.md`](./jarvis/splat-lab/CLAUDE.md) — splat-lab-specific
- [`jarvis/llm/CLAUDE.md`](./jarvis/llm/CLAUDE.md) — OpenClaw / Ollama specific

## Memory (per-agent persistent state)

If you have a memory system (e.g., Claude's `C:\Users\<user>\.claude\
projects\C--Zip\memory\`), you'll find:

- `project_zip_v2_session_handoff.md` — current sprint state pointer
- `reference_repo_rename_2026_06_04.md` — URL history (zip-v2 → zip,
  Zip → zip-v1-archive)
- `reference_openclaw_jetson_deploy.md` — the hard-won 8 GB Ollama
  tuning
- `reference_jetson_perception_deploy.md` — YOLO on Jetson recipe
- `reference_avr_baud_math.md` — why 460800 is a trap
- `feedback_jetson_ssh_use_openssh.md` — use stock Windows OpenSSH

These are *snapshots* from past sessions. Verify against current code
before asserting as fact — files may have moved, branches may have
changed.

## Final advice

The author cares about safety, clarity, and not breaking working
things. When in doubt, **default to small, reversible, well-explained
changes** and ask before doing anything that could destroy work,
embarrass on production, or unlock the wheels.

Welcome aboard.
