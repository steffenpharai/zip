# ADR 0004 — Sticky pub/sub topics on the brain

**Status:** Accepted (Phase 1, refined Phase 4)

## Context

The brain has many subsystems (UART link, camera hub, perception loop,
mapping, planner, motion gateway, control plane) running concurrently
as asyncio tasks. They need to share state — the planner needs the
current pose; the HUD WebSocket handler needs the current motion lock
state; the perception loop needs the latest camera frame; the motion
gateway needs the current client setpoint.

Naive options:

1. **Shared mutable state.** A global `state` dict. Tightly couples
   every subsystem to every other. Race conditions galore.
2. **Direct asyncio.Queue per pair.** N² wiring. Tedious. New subsystem
   means touching everyone.
3. **Pure event bus.** Fire-and-forget. Works for events, breaks for
   state — a subsystem that starts late doesn't know the last value
   was published.

A separate concern: the **HUD reconnects often** (page reload, network
blip, dev iteration). Every reconnect should see the current robot
state (pose, motion lock, telemetry) immediately, not wait for the next
periodic update.

## Decision

The brain runs an in-process **asyncio pub/sub bus with sticky topics**
([`bus.py`](../../zip-v2/brain/zip_brain/bus.py)).

Topics are strings (e.g., `"motion.setpoint"`, `"map.pose"`,
`"motion.lock_state"`). Payloads are dicts.

Two flavors of topic:

- **Sticky topics** publish to a `_latest` cache. New subscribers get
  the cached value injected immediately on `subscribe(topic,
  replay_latest=True)`. Used for:
  - `uno.status` — `{connected, port}`
  - `telemetry.sample` — `{battery_mv, ultrasonic_cm, ts}`
  - `sensor.imu` — `{yaw_deg, ts}`
  - `map.pose` — `{x, y, theta, ts}`
  - `map.occupancy` — `{cell_m, occupied:[…], free_bounds, ts}`
  - `motion.lock_state` — `{locked}`
  - `plan.path`, `plan.status`

- **Stream topics** are fire-and-forget. No cache. Used for:
  - `motion.setpoint` — every drive command
  - `motion.stop` — every explicit stop
  - `perception.detections`, `perception.snapshot` — per-frame events
  - `uno.raw` — raw UART traffic for debugging

Publishers never block. Subscribers get unbounded `asyncio.Queue`
instances (default 256); on overflow, oldest message dropped.

## Consequences

**Easier:**
- **HUD UX.** Reconnect → instant state. No "blank for 2 s" while we
  wait for the next pose update. Critical for dev iteration.
- **Decoupling.** A new subsystem can subscribe without touching any
  publisher. The motion lock topic was added in Phase 5.3a without
  changing any subsystem that already published or consumed motion.
- **Testing.** Each subsystem can be tested in isolation by mocking the
  bus.
- **Inspection.** A debug WebSocket client can subscribe to every topic
  and dump the bus state. Done in the HUD's developer mode.

**Harder:**
- **No persistence across brain restart.** The `_latest` cache is
  in-memory. On systemd restart, the first HUD subscribe gets nothing
  for state topics until the producers publish again. Acceptable
  because brain restart is ~5 s and producers republish quickly.
- **Memory leak risk if subscribers don't unsubscribe.** Queues hold
  references. The control plane is careful to unsubscribe on WebSocket
  disconnect. New subscribers must do the same.
- **Topic naming discipline required.** No formal schema; topics evolve
  organically. Maintained by convention (dot-separated, present-tense).
  See [PROTOCOLS.md](../../zip-v2/docs/PROTOCOLS.md) for the canonical
  list.

## Alternative considered: external pub/sub

Redis, NATS, or ROS-style. Rejected for v2:

- ROS 2 was the v1 substrate; we're explicitly off it (see
  [ADR 0007](./0007-v1-archived-as-predicate.md)).
- Redis/NATS would add a daemon to the Jetson and serialization
  overhead with no clear benefit at one-process scale.

## Reference

- [`bus.py`](../../zip-v2/brain/zip_brain/bus.py) — the implementation
  (~50 lines).
- [`control_plane.py`](../../zip-v2/brain/zip_brain/control_plane.py) —
  the canonical example of subscribing-on-WS-connect and unsubscribing
  on disconnect.
