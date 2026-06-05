# ADR 0002 — UNO owns time

**Status:** Accepted (Phase 1, formalized 2026-06-04)

## Context

The robot has three places that can plausibly run motion control:

1. **The PC** (HUD) — easy to develop, has all the typing affordances.
2. **The Jetson** (brain) — Linux, lots of CPU, asyncio, Python.
3. **The UNO firmware** — ATmega328P, 16 MHz, ~2 KB RAM, bare metal.

The PC and Jetson both run general-purpose Linux/Windows. Neither is
real-time. A garbage collection pause, a Python coroutine that doesn't
yield, an asyncio task that blocks on I/O — any of these can delay a
motor command by tens to hundreds of milliseconds. For drive control,
that's a powered chassis that doesn't stop when you let go of the key.

The UNO has no OS, no GC, no preemption. Its 100 Hz control loop is
deterministic. PWM updates happen on schedule, every 10 ms, period.

## Decision

**Motor PWM, motor ramp/slew, and the deadman watchdog all live on the
UNO firmware.** The brain *intends* (sends setpoints with TTL); the UNO
*executes* (interprets setpoints in real time, ramps PWM smoothly,
stops on TTL expiry).

Specifically:

- **PWM generation.** Hardware PWM, ATmega328P timer/counter peripherals.
- **Ramp / slew.** Configurable accel/decel steps per 10 ms loop iteration
  (default: 30 PWM units per step at full battery).
- **Deadman.** Each setpoint includes `ttl_ms`. If no new setpoint
  arrives within that window, the UNO sets both motors to 0. Independent
  of any host-side watchdog.
- **Hardware watchdog.** The ATmega's internal WDT is enabled at 8 s as
  a last-resort: if the firmware itself hangs, the chip resets.
- **Battery-aware PWM cap.** UNO measures battery voltage every cycle and
  reduces max PWM in LOW/CRITICAL states. Brain doesn't need to know.

The brain may re-send setpoints periodically (default every 100 ms) to
keep the UNO's TTL alive during sustained input. This is a refresh, not
a control loop.

## Consequences

**Easier:**
- **Safety.** Brain crash, HUD disconnect, Wi-Fi drop, kernel panic —
  none of these can leave wheels spinning. The UNO will stop within
  300 ms of the last setpoint.
- **Latency.** Setpoint → PWM update is bounded by the 10 ms UNO loop
  cycle, not by Python's GIL or libuv's scheduling.
- **Testability.** The UNO firmware can be tested standalone (push raw
  N=200 setpoints over USB, observe PWM with a scope). No Linux stack
  needed.

**Harder:**
- **Iteration speed for motion logic.** Touching motor ramp requires a
  firmware reflash, not just a Python edit. Mitigated by `pio run -t
  upload` being ~30 s end-to-end.
- **Sensor fusion.** Anything that needs heavy compute (IMU integration,
  occupancy raycasting, A*) has to live on the brain, then send a
  setpoint to the UNO. Round-trip latency is visible. So far this has
  been fine because everything is downstream of the setpoint, not in
  the control loop itself.
- **Protocol design tax.** Every motion concept needs a JSON message
  type (`N=200` setpoint, `N=201` stop, `N=210` macro, `N=999` direct
  PWM). Adding a new one means firmware + brain + HUD changes.

**Anti-patterns this rule rules out:**
- Brain computing PWM ramps in Python and streaming them to the UNO.
  (The brain isn't real-time; the ramp would jitter.)
- HUD sending raw motor PWM directly via WebSocket. (No safety
  envelope; bypasses the motion gateway.)
- Adding a software watchdog in the brain that's supposed to replace
  the UNO's deadman. (Defense in depth ≠ pick one.)

## Reference

- [zip-v2/docs/PROTOCOLS.md](../../zip-v2/docs/PROTOCOLS.md) — full
  `N=…` message catalog.
- [zip-v2/firmware/uno/src/main.cpp](../../zip-v2/firmware/uno/src/main.cpp)
  — the actual loop.
