# Team

> **Premise:** A solo founder + AI agents can match the velocity of a
> 5-10 person team — *if* the repo is instrumented for it.

This document describes how we work today, and how the team scales
without sacrificing the architectural discipline that makes Zip work.

## Today

**1 founder:** Steffen Pharai (pharaisteffen@gmail.com).

**Force multipliers:** Claude Code (Anthropic), Codex (OpenAI), Cursor,
and project-specific subagents configured at [`.claude/`](../.claude/README.md).

**Operating loop:**

```
Human:    sets direction, makes safety-critical decisions, drives hardware tests
   ↓
Agents:   explore code, write docs, build firmware, deploy brain, verify changes
   ↓
Human:    reviews diffs, signs off on safety-critical, runs the robot
   ↓
Agents:   commit, push, update docs, follow up
```

The human is in the loop at every safety gate (motion, baud, lock, push)
and out of the loop for everything mechanical.

## Why this works for *this* project

Hardware/software/firmware breadth is the natural enemy of solo
development. Most founders pick one layer and outsource the others.
We don't, because:

1. **The layering itself is the product.** Outsourcing the brain or
   the firmware loses the strict-layering discipline that makes Zip's
   safety story work.
2. **AI agents close the breadth gap.** A subagent with a focused
   prompt and a permission allowlist can compile firmware, deploy
   Python, edit React, and write docs faster than a human who has to
   switch contexts.
3. **The constraints force good architecture.** When the dev "team"
   is finite, you can't ship 17 frameworks. You ship the right one
   for each layer, and the integration points are clean by necessity.

The repo encodes this. The three immovable rules are in
[`AGENTS.md`](../AGENTS.md). Decisions live in
[`docs/adr/`](./adr/). Component-specific gotchas live in per-component
[`CLAUDE.md`](../zip-v2/hud/CLAUDE.md) files. New agents (or new
humans) come up to speed by reading those.

## The autonomous-dev configuration

See [`.claude/README.md`](../.claude/README.md) for the full list. In
short:

- **4 subagents:** `robot-tester`, `firmware-builder`, `splat-debugger`,
  `brain-deployer`. Each has scoped tools, an output format, and
  explicit "never do" rules.
- **6 slash commands:** `/jetson-status`, `/deploy-brain`,
  `/verify-splat`, `/firmware-build`, `/verify-changes`,
  `/autonomous-dev`.
- **2 skills:** `autonomous-dev` (the canonical work loop with
  three-rules guardrails), `drive-safety` (a hard veto on regressing
  motion-safety defaults).
- **33-entry permission allowlist** so common ops don't ping the
  human. Plus a deny list so destructive ops do.
- **A `drive-safety` skill that vetoes `ZIP_MOTION_LOCKED=0` patterns**
  before the diff even reaches code review.

## Team composition we'd grow into

A small, AI-native team of 3-5 people for the seed-to-Series-A
trajectory:

| Role | Why | When to hire |
|---|---|---|
| **Co-founder / engineering lead** | The CEO can't be the sole reviewer for safety-critical changes forever | Pre-seed |
| **ML engineer (vision / perception)** | DA3 → splat, fusion, Phase 6 anchored objects, eventually Phase 7 SLAM | Pre-seed / seed |
| **Hardware engineer (PCB, mount, power)** | Custom PCB for the next BOM tier, Jetson power topology, mechanical | Seed |
| **DX engineer / community lead** | Skill SDK, partner onboarding, docs polish, developer evangelism | Seed → Series A |
| **First non-founder ops / business** | Pilots, supply chain, eventual partnerships | Series A |

**Hiring philosophy:** AI-native, not just role-skilled. Every
engineer we hire works with subagents and slash commands by default.
We don't pay for typing speed; we pay for taste in what to ship and
what to skip.

## Compensation philosophy

Above-market equity, at-market cash. The team should feel like
co-builders, not employees. Early hires get senior-engineer equity
because they're taking startup risk.

Standard Anthropic / Stripe-style transparent leveling once we hit
~10 people.

## Working norms

- **Async-first.** Strong written docs (this whole repo is the
  receipt). Meetings are for decisions and 1:1s, not status.
- **Code review is mandatory** on safety-critical paths. CODEOWNERS
  enforces this at the GitHub layer.
- **ADRs for direction changes.** If you find yourself violating a
  pattern, write the new ADR first.
- **Hardware test cadence:** every safety-critical change must pass
  a real drive test before merging. We don't fake-test motion in CI.
- **One-rep maximum on the destructive stuff.** Force-pushing,
  deploying without verifying, unlocking wheels — all require a
  second human signing off.

## Diversity, culture, and bar

We're small enough that culture is what the founder demonstrates. We
hire for kindness and clarity as much as for skill. We say no to
candidates whose technical skill is real but whose pattern of
communication would erode the async, no-meetings, written-first culture.

When we grow past 10 people, we'll formalize. Until then, the bar is
set by the room.

## How to join us

If you're reading this as a potential hire, contributor, or partner:

- **Read** [`PITCH.md`](../PITCH.md) for the elevator pitch, then
  [`docs/VISION.md`](./VISION.md) for the long-form thesis.
- **Skim** [`docs/ARCHITECTURE.md`](./ARCHITECTURE.md) and the ADRs to
  see how we think.
- **Pick one open issue or one open hardware task** in
  [`docs/HARDWARE.md`](./HARDWARE.md) and propose how you'd approach
  it.
- **Email** pharaisteffen@gmail.com with that proposal.

We respond to specific, well-thought proposals fast. Generic "I'd love
to chat" emails go to the bottom of the queue.

## A note on AI-agent collaboration

This project would not exist at this maturity without LLM-based
coding agents. That's worth saying out loud:

- **The agents accelerated the boring work** (file moves, docs,
  scaffolding) so the human could focus on judgment calls
  (architecture, safety, hardware decisions).
- **The agents also force-multiplied clarity.** Writing AGENTS.md and
  per-component CLAUDE.md for the agents made the repo legible for
  humans, too.
- **The agents are not the team.** The decisions are the founder's.
  When the agent suggests bypassing the motion gateway or shipping
  without a test, the founder vetoes. The agent doesn't drive the
  ship; it pulls the oars at the founder's cadence.

This is the operating model we'll preserve as we hire. New engineers
join the dev loop with their own agent-collaboration tooling, not
replace it.
