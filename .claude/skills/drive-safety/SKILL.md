---
name: drive-safety
description: Safety guardrails for any change that touches the robot's drive path — UNO firmware motor code, brain motion gateway, HUD drive input, or anything that could affect the wheels-locked default. Refuses dangerous changes and forces a checklist before any drive test.
---

# Drive safety skill

This skill activates when the planned change touches anything in the
motion path. It is a hard veto on dangerous defaults.

## When this skill triggers

Activate if the edit set includes any of:

- `zip-v2/firmware/uno/src/main.cpp` (motor/loop code)
- `zip-v2/firmware/uno/include/config.h` (timing/safety macros)
- `zip-v2/brain/zip_brain/motion.py` (motion gateway)
- `zip-v2/brain/zip_brain/uno_link.py` (UART writer)
- `zip-v2/hud/lib/v2/useDriveInput.ts` (drive dispatch)
- `zip-v2/hud/components/v2/DrivePanel.tsx` (drive UI)
- Anything that touches `ZIP_MOTION_LOCKED`

## What this skill enforces

### Hard veto

The skill VETOES (refuses to proceed without explicit human override):

1. Any change that sets `ZIP_MOTION_LOCKED` to `0` as a default in
   code, systemd drop-in, env example, or docs.
2. Any change to `SERIAL_BAUD` away from `500000`.
3. Any removal of the `STBY=HIGH` enforcement in motor writes.
4. Any removal of the deadman TTL check.
5. Any change that lets a non-`motion.py` code path send setpoints to
   the UNO.

### Hard checklist before any drive test

Before issuing or facilitating a drive test (wheels actually move),
walk through this checklist with the human. Refuse to proceed if any
item is "no":

```
DRIVE-TEST READINESS:
  [ ] Robot is on a propped-up chassis (wheels off the ground)? — first test
  [ ] OR robot is on the floor with clear space? — subsequent tests
  [ ] Battery voltage > 6.5 V?
  [ ] motion.lock_state.locked is true (verify in HUD before unlock)?
  [ ] HUD WebSocket is connected?
  [ ] UNO is responding to N=120 diagnostics?
  [ ] Camera feed is live (so you can see what the robot sees)?
  [ ] Human has line-of-sight to the robot?
  [ ] STOP key (HUD E-Stop button) is bound and tested?
```

### Post-test wheel re-lock

After any drive test, automatically prompt the human to re-lock the
wheels via:

```bash
ssh zip-jetson "sudo systemctl edit zip-brain"  # remove the unlock override
# OR
ssh zip-jetson "sudo systemctl restart zip-brain"  # re-applies default
```

Confirm `motion.lock_state.locked === true` in the HUD before declaring
the test complete.

## Output discipline

When this skill is active, your responses about the changed code MUST:

- Mention "wheels-locked default" explicitly
- Confirm or call out the three immovable rules
- Suggest the verification chain (build → typecheck → restart → drive-test
  checklist)

Don't be silent on safety just because the local change "looks fine."
The motion-safety story is reinforced by repetition.

## Reference

- [`docs/adr/0002-uno-owns-time.md`](../../../docs/adr/0002-uno-owns-time.md)
- [`docs/adr/0003-uart-500k-baud.md`](../../../docs/adr/0003-uart-500k-baud.md)
- [`docs/adr/0005-wheels-locked-default.md`](../../../docs/adr/0005-wheels-locked-default.md)
