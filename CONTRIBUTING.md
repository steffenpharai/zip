# Contributing to Zip

Zip is a private monorepo for a layered AI/robotics system. The maintainers
welcome internal contributions and may eventually open the project up for
external ones. This guide describes the workflow that keeps the repo
shippable.

## Before you start

1. Read [README.md](./README.md) for the constellation overview.
2. Read [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) for the three-tier
   picture (PC + Jetson + robot, who owns what).
3. Read [AGENTS.md](./AGENTS.md) — directives for both human and AI
   contributors (the three immovable rules, what NOT to touch).
4. Skim [docs/ROADMAP.md](./docs/ROADMAP.md) so you know which phase the
   work belongs to.

## Three immovable rules (do not violate)

1. **UNO owns time.** PWM, motor slew rate, and the deadman watchdog live
   on the ATmega328P. Never duplicate motion logic in the brain or HUD.
2. **UART is exactly 500000 baud** (UBRR=3, U2X=1 on the 16 MHz ATmega).
   Don't "round" to a nearby baud — the timing breaks differential drive.
3. **Wheels lock by default on the bench.** `ZIP_MOTION_LOCKED=1` is the
   safe default on the brain. PRs must not silently un-default this.

These are enforced socially, not by lint. If you find yourself wanting to
break one, open an [ADR](./docs/adr/) and propose the change — don't just
do it.

## Development setup

### HUD (PC)

```bash
cd zip-v2/hud
npm install
npm run dev:local        # http://localhost:3000/v2
npm run typecheck        # tsc --noEmit
npm run test:e2e         # Playwright (needs a live brain or mock)
```

### Brain (Jetson)

```bash
ssh zip-jetson
cd ~/zip
.venv/bin/python -m zip_brain         # foreground / dev
# or
sudo systemctl restart zip-brain      # production / managed
sudo journalctl -u zip-brain -f       # tail logs
```

The submodule at `zip-v2/brain/` is a clone of
[`zip-brain`](https://github.com/steffenpharai/zip-brain). PRs there land
separately; bump the submodule pointer in this repo when merging.

### Firmware

```bash
cd zip-v2/firmware/uno
pio run -e uno --target upload        # UNO motor controller

cd ../esp32-cam
cp include/secrets.example.h include/secrets.h    # add your Wi-Fi creds
pio run -e esp32cam_sta --target upload
```

### Jarvis vision labs

The vision labs live on the Jetson at `~/depth-lab/`, `~/perception-lab/`,
`~/splat-lab/`. Edits sync via `scp` or `rsync`:

```bash
# Push a local edit to Jetson
scp jarvis/splat-lab/scripts/bake.py zip-jetson:~/splat-lab/scripts/

# Pull Jetson state down to host
ssh zip-jetson "tar czf /tmp/splat-lab.tgz \
  --exclude=models --exclude=__pycache__ \
  --exclude='*.log' --exclude='*.png' --exclude='*.jpg' splat-lab/"
scp zip-jetson:/tmp/splat-lab.tgz /tmp/ && \
  tar xzf /tmp/splat-lab.tgz -C jarvis/
```

## Branch model

- **`master`** is always shippable to the home test environment.
- Feature branches: `phase/<phase-num>-<slug>` (e.g. `phase/5.4-aft-cam-fusion`).
- Fix branches: `fix/<slug>`.
- Research/exploration: `explore/<slug>` (these may never merge).
- Submodule bumps land as their own commit with the brain SHA in the
  message body.

## Commit style

We use loosely-conventional commits. The first line is a short imperative
(≤72 chars). Prefix is one of: `phase:`, `fix:`, `safety:`, `docs:`,
`refactor:`, `restructure:`, `firmware:`, `chore:`, or omitted for a
bare topic (e.g. "Jarvis: install OpenClaw …").

Examples from history:

```
Phase 5.3a: HUD depth panel
safety: WHEELS LOCKED badge in the HUD
docs: Phase 5.3a depth + wheel safety lock + hardware-mount note
restructure: monorepo with jarvis/ as primary, zip-v2/, zip-v1/
Jarvis: install OpenClaw as a 100% local AI agent on the Jetson
```

For non-trivial work, the body should answer **why**, not what (the diff
shows the what). For phase commits, link the relevant doc:

```
Phase 5.3a: HUD depth panel

Adds DepthPanel component subscribing to /depth/frame. Manual capture
button only — no streaming yet. See zip-v2/docs/PHASES.md → 5.3a for the
rationale (we need depth before anchored objects in Phase 6).
```

Squash-merge feature branches into `master` so the log stays linear.
Don't amend published commits.

## Pull-request workflow

1. **Push the branch** and open a PR against `master`.
2. **Fill out the template** (see [.github/PULL_REQUEST_TEMPLATE.md](./.github/PULL_REQUEST_TEMPLATE.md))
   — what changed, why, what was tested, hardware required for review.
3. **Self-review the diff** before requesting review. Re-read your own
   description as if you'd never seen the code.
4. **At least one human review** on PRs that touch motion, firmware, or
   the brain's motion gateway. Pure HUD-cosmetic or docs-only changes
   may self-merge after CI passes.
5. **Test artifacts:** include a screenshot for HUD changes, a sample
   `journalctl` output for brain changes, and an oscilloscope or pio
   monitor capture for firmware timing changes.

## What MUST be tested

| Change touches | Required verification |
|---|---|
| Motion gateway / motion lock | Drive on a propped-up robot (wheels off the ground). Confirm `motion_lock` topic in HUD. Confirm STOP works. |
| UNO firmware (any motor code) | Bench test: motor PWM scope or visual ramp + deadman timeout. Battery-state PWM cap exercised at 5V supply. |
| UNO firmware (UART) | Confirm `pio device monitor -b 500000` shows clean JSON. No `\357` mojibake. |
| Brain (perception, mapping, planner) | Live test with HUD; verify topics flow, no exceptions in journalctl over 60 s of operation. |
| HUD (any) | `npm run build` passes; manual browser test against a live or mocked brain. |
| Firmware build flags | Confirm `pio run` size report; ensure no `-D` shadow regression (see [docs/KNOWN_ISSUES.md](./docs/KNOWN_ISSUES.md#pio--d-shadow-trap)). |

## What does NOT need a PR

- Memory files in `C:\Users\<you>\.claude\projects\C--Zip\memory\` — these
  are per-session agent state, not project artifacts.
- Local-only `.env` or `secrets.h` (these are gitignored anyway).
- Experimental scripts under `jarvis/splat-lab/` while you're iterating
  (commit when stable).

## Code style

- **TypeScript (HUD):** strict mode; no `any` without a comment; prefer
  named exports.
- **Python (brain):** Type hints on public functions; async-first;
  `asyncio.gather` over manual task lists.
- **C++ (firmware):** No dynamic allocation in motor paths. RAM budget is
  ~2 KB on the UNO — every `String` matters. Guard `-D` overrides with
  `#ifndef`.

Formatter / linter pass before opening a PR:

```bash
# HUD
cd zip-v2/hud && npm run typecheck

# Firmware
cd zip-v2/firmware/uno && pio check
```

## Questions

Open a [discussion](https://github.com/steffenpharai/zip/discussions) or
ping a maintainer.
