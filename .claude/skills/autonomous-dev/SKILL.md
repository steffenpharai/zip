---
name: autonomous-dev
description: Reusable autonomous-development loop for the Zip robot/AI stack. Use when the user wants Claude Code to drive a feature or fix end-to-end (plan → execute → verify → commit) with built-in safety stops at the three immovable rules and any push-to-remote operation. Reads the umbrella docs and ADRs as context.
---

# Autonomous development skill

When the user asks for autonomous development on this repo, follow this
skill. It's a thinner version of `/autonomous-dev`: same loop, no
ceremony.

## Loop

```
loop {
  understand → plan (with safety flags) → ask if unclear
       → execute (use sub-agents for verification)
       → verify before claiming done
       → commit incrementally
       → repeat until done or blocked
       → report
}
```

## Sub-agents to prefer

| Need | Agent |
|---|---|
| Code archaeology | `Explore` |
| Firmware build / size check | `firmware-builder` |
| Brain deploy + journal verify | `brain-deployer` |
| Splat render diagnosis | `splat-debugger` |
| Live hardware verification | `robot-tester` |

## Hard stops (ask before proceeding)

- Anything that changes `ZIP_MOTION_LOCKED` default
- Any motion-logic addition outside the UNO firmware
- Any UART baud change
- Any push to a remote master branch
- Any submodule bump that hasn't been independently reviewed
- Any new brain dependency (it competes for the Jetson's 8 GB)

## Verification standard

A change is NOT done until:

- [ ] Type checks / builds pass
- [ ] If brain change: clean systemd journal for 30 s post-restart
- [ ] If firmware change: size report attached + bench-test plan
- [ ] If motion-adjacent: `motion.lock_state.locked === true` confirmed
- [ ] The three-rules checklist passed (UNO-owns-time, 500k baud,
      wheels locked default)

## Commit cadence

Each commit is one logical change. Format:

```
<prefix>: <imperative summary>

<why, not what>

Co-Authored-By: <model name> <noreply@anthropic.com>
```

Prefixes: `phase:`, `fix:`, `safety:`, `docs:`, `refactor:`, `firmware:`,
`chore:`, or omitted for compound topics.

## Memory

If a memory subsystem is available, look for:

- `project_zip_v2_session_handoff.md`
- `reference_repo_rename_2026_06_04.md`
- `reference_openclaw_jetson_deploy.md`
- `reference_jetson_perception_deploy.md`

These are snapshots; verify against current code before asserting.
