---
name: Feature request
about: Propose a new feature or enhancement
title: '[FEATURE] '
labels: enhancement
assignees: ''
---

## What problem does this solve

Describe the problem from the user's / operator's / robot's perspective.
Why does this matter now?

## Proposed solution

A clear description of what you want to happen. Include UI mockups,
protocol additions, or code snippets if relevant.

## Which track / phase

- [ ] Robot (Zip v2) — proposed phase: X.Y
- [ ] Jarvis vision (depth / perception / splat)
- [ ] Jarvis LLM (deferred per [ADR 0006](../../docs/adr/0006-llm-on-jetson-deferred.md) — proposing
      revision?)
- [ ] Repo tooling / docs / CI

## Component impact

Which parts of the system change?

- [ ] HUD (`zip-v2/hud/`)
- [ ] Brain (`zip-v2/brain/` — submodule, separate PR)
- [ ] UNO firmware
- [ ] ESP32 firmware
- [ ] Wire protocol (UART JSON / WebSocket envelopes) — **needs ADR**
- [ ] Jarvis labs
- [ ] Documentation

## Alternatives considered

What else did you think about? Why is the proposed solution better?

## Does this need an ADR?

Architecturally significant or trade-off-heavy changes need an
[ADR](../../docs/adr/). Use this checklist:

- [ ] Touches motion safety
- [ ] Changes wire format
- [ ] Adds heavy dependency to brain (CUDA memory or RAM)
- [ ] Changes a default that affects safety (e.g., wheels-locked)
- [ ] Re-evaluates a previously rejected approach
