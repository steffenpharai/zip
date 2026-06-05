# .claude/

This directory configures Claude Code for autonomous development on
the Zip monorepo.

## Contents

| Path | What |
|---|---|
| [`settings.json`](./settings.json) | Permission allowlist + deny list. Pre-authorizes safe read-only ops + brain SSH; denies destructive `git`, `rm`, and the `ZIP_MOTION_LOCKED=0` pattern. |
| [`launch.json`](./launch.json) | SSH-tunnel launch configs: `openclaw-dash` (:18789), `jetson-splat` (:8090 + :8443 for secure-context WebGPU). |
| [`agents/`](./agents) | Project-specific subagents Claude Code can spawn. |
| [`commands/`](./commands) | Slash commands you can invoke (`/jetson-status`, `/deploy-brain`, `/verify-splat`, etc.). |
| [`skills/`](./skills) | Reusable skill loops (`/autonomous-dev`, `/drive-safety`). |
| [`hooks/`](./hooks) | Stop/PostToolUse hooks (currently empty). |

## Agents

| Agent | When to use |
|---|---|
| [`robot-tester`](./agents/robot-tester.md) | Verify a motion/brain change works end-to-end on the live Jetson. Read-only on the live system; reports verdict + evidence. NEVER unlocks wheels. |
| [`firmware-builder`](./agents/firmware-builder.md) | Build (and optionally flash) UNO or ESP32-S3 firmware. Size-checks. Stops before upload for confirmation. |
| [`splat-debugger`](./agents/splat-debugger.md) | Diagnose the splat-lab black-render bug. Knows the WebGPU transmittance underflow story and the k-NN-init fix plan. |
| [`brain-deployer`](./agents/brain-deployer.md) | Push the brain submodule to the Jetson, restart `zip-brain.service`, verify clean restart, confirm wheels still locked. |

## Slash commands

| Command | Effect |
|---|---|
| `/jetson-status` | Compact Jetson snapshot (services, GPU, models, network, wheels-locked state). |
| `/deploy-brain` | Push current submodule SHA to Jetson + verify (uses `brain-deployer`). |
| `/verify-splat [scan-id]` | Deploy k-NN-init `bake.py` to Jetson, run launcher, validate PLY (uses `splat-debugger`). |
| `/firmware-build uno\|esp32\|both` | PlatformIO build + size report (uses `firmware-builder`). Stops before upload. |
| `/verify-changes` | Auto-detect what changed in the diff and dispatch the right verification (HUD typecheck/build, firmware build, brain deploy, etc.). |
| `/autonomous-dev "<goal>"` | Full plan → execute → verify → commit loop, with hard stops at safety-critical decisions. |

## Skills

- [`autonomous-dev`](./skills/autonomous-dev/SKILL.md) — the canonical
  loop for end-to-end feature work, with sub-agent dispatch and
  three-rules guardrails.
- [`drive-safety`](./skills/drive-safety/SKILL.md) — hard veto on
  motion-defaults regression + drive-test readiness checklist.

## Permission model

`.claude/settings.json` pre-authorizes:

- All read-only `git` queries (status, diff, log, branch, fetch, etc.)
- `npm` typecheck/build/test in `zip-v2/hud/`
- `pio run` for both firmware envs
- `ssh zip-jetson` and `scp` to/from the Jetson
- `gh api` for the three project repos (zip, zip-brain, zip-v1-archive)

And denies:

- Force pushes
- `git reset --hard`, `git clean -f`, `git checkout master`
- `rm -rf` against system paths
- Any command containing `ZIP_MOTION_LOCKED=0`

You can add local overrides in `.claude/settings.local.json` (gitignored).

## How an autonomous session works

```
User: /autonomous-dev "land splat k-NN fix and verify in browser"
  ↓
Claude reads:
  - AGENTS.md (the three immovable rules)
  - docs/ROADMAP.md (current phase context)
  - jarvis/splat-lab/REPORT.md.pc-mirror (the bug story)
  - jarvis/splat-lab/CLAUDE.md (splat-specific guidance)
  ↓
Claude plans (TaskList):
  1. Confirm the k-NN bake.py exists locally
  2. Confirm Jetson reachable (/jetson-status)
  3. scp bake.py to Jetson via splat-debugger agent
  4. Run launcher.sh on Jetson
  5. validate_ply on the resulting PLY
  6. Pause and prompt human to verify browser render
  ↓
Claude executes, asking before each safety-critical step
  ↓
Claude reports verdict + remaining manual step
```

The user stays in control at every safety gate.
