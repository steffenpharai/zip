---
name: Bug report
about: Something is broken or behaving wrong
title: '[BUG] '
labels: bug
assignees: ''
---

## What's broken

A clear, one-paragraph description of the bug.

## Steps to reproduce

1. ...
2. ...
3. ...

## Expected behavior

What you expected to happen.

## What actually happened

What actually happened. Include exact error text, screenshots, video.

## Environment

- **Component:** HUD / brain / UNO firmware / ESP32 firmware / Jarvis (depth / perception / splat / llm) / docs / other
- **Commit SHA:** `git log -1 --pretty=%h`
- **Submodule SHA (if brain):** `cd zip-v2/brain && git log -1 --pretty=%h`
- **OS:** Windows 11 / Jetson L4T R36.4.7 / other
- **Hardware:** UNO firmware version (from N=120 diagnostics), Jetson power mode, battery voltage

## Logs / evidence

```
(paste journalctl -u zip-brain output, or browser console, or pio monitor capture, etc.)
```

## Have you checked

- [ ] [`docs/KNOWN_ISSUES.md`](../../docs/KNOWN_ISSUES.md) — is this a known gotcha?
- [ ] Is the brain reachable? (`ssh zip-jetson "systemctl status zip-brain"`)
- [ ] Is the UNO reachable? (HUD shows "UNO: connected"?)
- [ ] Are the wheels locked? (`motion_lock` topic in HUD; check if relevant)
