---
description: End-to-end verify whatever you just changed (HUD / brain / firmware)
argument-hint: (auto-detects from the git diff)
---

Read `git diff origin/master..HEAD --stat` to figure out what changed,
then dispatch the right subagent(s):

| If changed | Run |
|---|---|
| `zip-v2/hud/**` | `npm run typecheck && npm run build` inside `zip-v2/hud/` |
| `zip-v2/brain` (submodule SHA bump) | `brain-deployer` agent |
| `zip-v2/firmware/uno/**` | `firmware-builder` agent (UNO) |
| `zip-v2/firmware/esp32-cam/**` | `firmware-builder` agent (ESP32) |
| `jarvis/splat-lab/**` | `splat-debugger` agent |
| `docs/**` or `*.md` only | grep for broken intra-repo links |
| Any motion-touching change | also dispatch `robot-tester` agent |

After all checks, produce a single verdict block:

```
=== VERIFICATION SUMMARY ===
Changes detected: <list>
Checks run:       <list>
Result:           ✅ all-clear | ⚠️ warnings | ❌ broken

Per-check:
- HUD typecheck:    ...
- HUD build:        ...
- UNO firmware:     ...
- ESP32 firmware:   ...
- Brain deploy:     ...
- Robot test:       ...

Three immovable rules check:
- [ ] UNO owns time (no motion logic outside firmware?)
- [ ] UART 500000 baud (no baud changes?)
- [ ] Wheels locked default (no MOTION_LOCKED=0 introduced?)

Ready to commit: yes | no, fix the above first
```
