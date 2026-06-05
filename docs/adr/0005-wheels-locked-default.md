# ADR 0005 — Wheels locked by default on the bench

**Status:** Accepted (Phase 5.3a)

## Context

During Phase 5 the robot lived on a desk for extended periods while
mapping, planning, and depth code was iterated. The HUD was repeatedly
reloaded, the brain repeatedly restarted, test scripts repeatedly
fired. On more than one occasion an errant setpoint — from a stale
HUD tab, a misfired test, or a re-baselined keymap — woke the wheels
and yanked the chassis toward the edge of the desk.

The instinctive fix is "don't have bugs." That doesn't scale.

The right fix is a **physical-state-aware safety mode** that prevents
drive commands from reaching the motors regardless of source, while
keeping servo and sensor commands functional (so you can still test
perception, mapping, depth).

## Decision

The brain has a **wheels-locked safety mode**:

- Controlled by `ZIP_MOTION_LOCKED` env var. `1` = locked (default),
  `0` = unlocked.
- Implemented in the **motion gateway** ([`motion.py`](../../zip-v2/brain/zip_brain/motion.py)):
  when `motion_locked` is True, all `client.motion.drive` and
  `client.motion.macro` events are dropped before they reach the UART
  writer. `client.motion.stop` is always allowed. Servo, scan,
  perception, and depth commands are unaffected.
- Published as the sticky topic `motion.lock_state` — `{locked: bool}`.
  The HUD subscribes and renders a visible **"⊘ WHEELS LOCKED"** badge
  in the mission bar.
- Default in systemd unit drop-in: `ZIP_MOTION_LOCKED=1`. Survives
  reboots. To unlock, edit the drop-in: `sudo systemctl edit
  zip-brain` → add `[Service]\nEnvironment="ZIP_MOTION_LOCKED=0"` →
  restart.

## Consequences

**Easier:**
- **Bench dev is safe.** Robot stays put while you iterate. Servo
  sweeps, ultrasonic radar, IMU, camera, depth, planner-without-execute
  all still work.
- **Visible state.** The HUD badge means you can't accidentally
  develop in unlocked mode and forget — the badge is always present
  when locked.
- **Defense in depth.** Even if a malicious or buggy WebSocket client
  sends drive commands, they're dropped at the gateway. The UNO never
  sees them.

**Harder:**
- **Drive tests require an explicit unlock.** Multi-step process: edit
  systemd drop-in, restart brain, verify HUD badge cleared. Adds ~30 s
  before any drive test. Acceptable.
- **"My drive command isn't working" debug step.** The first thing to
  check is `motion_lock` topic in the HUD. Documented in
  [DEPLOY.md](../../zip-v2/docs/DEPLOY.md).
- **Test fixtures must respect the lock.** Automated tests that
  exercise drive must explicitly unlock and re-lock. Helper functions
  TBD.

## Anti-patterns explicitly forbidden

- Bypassing the motion gateway. Any new drive path must go through
  `motion.py` so the lock is honored.
- Setting `ZIP_MOTION_LOCKED=0` as the "convenient default" in dev
  environments. The default is locked, period. Unlock explicitly per
  session.
- Hiding the HUD badge. It's there to be annoying when you're
  developing with the wheels locked — that's its job.

## Future work

- Physical interlock (microswitch under the chassis: only allow
  unlock when wheels are NOT on the desk). Hardware task.
- Per-axis lock — wheels locked, but servo still rotates head — already
  the case. Could imagine "wheels locked, but ramp-only mode for
  testing PWM at very low power" but YAGNI right now.

## Reference

- [`motion.py`](../../zip-v2/brain/zip_brain/motion.py) — the lock check.
- [`zip-v2/hud/components/v2/MissionBar.tsx`](../../zip-v2/hud/components/v2/MissionBar.tsx)
  — the HUD badge.
- Commit `16a2726` — initial badge.
- Commit `f039e7c` (brain) — wheel-motion lock implementation.
