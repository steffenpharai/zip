# CLAUDE.md — HUD-specific guidance

You're editing the Next.js 16 + React 19 cockpit at `zip-v2/hud/`. This
file gives you the local context. For the umbrella picture and rules,
see [`/AGENTS.md`](../../AGENTS.md).

## Where things live

| Concern | Path |
|---|---|
| **Live HUD entry** | [`app/v2/page.tsx`](./app/v2/page.tsx) — the active cockpit |
| Legacy V1 HUD (dormant) | `app/(hud)/page.tsx` → `components/hud/` |
| Robot diagnostics (sidecar) | `app/robot/page.tsx` → `components/robot/` |
| API routes (V1 era, mostly dormant) | `app/api/` |
| **Active components** | [`components/v2/`](./components/v2) — 26 components |
| WebSocket / state hooks | [`lib/v2/`](./lib/v2) — 17 custom hooks |
| Wire-format types | [`lib/v2/types.ts`](./lib/v2/types.ts) |

## The WebSocket model

The HUD opens a WebSocket to the brain at `ws://192.168.55.1:8080/ws`
(USB-C) or `ws://192.168.4.1:8080/ws` (Wi-Fi robot AP, V1-era retained).

- **`useZipBrain()`** — the main connection. Reads/writes typed
  `ClientMessage` / `ServerMessage` envelopes.
- **`useServerMessageBus()`** — in-memory listener registry; lets
  multiple components subscribe to the same topic without each opening
  a socket.
- **`useParallelWsBus()`** — secondary WS for low-rate sticky topics
  (avoids contending with the drive path).

Sticky topics from the brain replay their last value on subscribe
(see [ADR 0004](../../docs/adr/0004-sticky-bus-topics.md)). On HUD
reconnect, the badge / pose / motion lock state appears instantly.

## The drive path (latency-sensitive)

```
keydown/keyup (browser event)
  → useDriveInput dispatches onAxesChange SYNCHRONOUSLY in the same
    browser task (sub-ms; no requestAnimationFrame defer)
  → useZipBrain.send({type:"drive", v, w, ttl_ms})
  → WebSocket frame
  → brain motion gateway (rate limit, lock check)
  → brain → UNO via UART (500000 baud, ~1 ms wire time)
  → UNO control loop (next 10 ms tick)
  → motor PWM
```

Total measured: **~70 ms keydown → motor** after Phase 3.5 tuning. If
you find yourself adding `setTimeout` or `requestAnimationFrame` to the
drive path, you're regressing this win.

`useDriveTick()` re-sends the current setpoint at 30 Hz to keep the UNO's
deadman TTL fresh during sustained input.

## Common edits

### Add a new component to the cockpit

1. Drop the component in `components/v2/`.
2. Subscribe to whatever topics it needs via `useServerMessageBus()`.
3. Mount it in `app/v2/page.tsx`.
4. If it needs new data from the brain, **stop and design the wire
   format first** — see [`zip-v2/docs/PROTOCOLS.md`](../docs/PROTOCOLS.md).
   Don't ad-hoc invent topic names.

### Add a new keyboard shortcut

Wire into `useDriveInput()` or `useKeyboard()`. Watch out for
collisions with browser shortcuts (e.g., Ctrl-W closes the tab).

### Polish a panel

Pure-CSS / Tailwind work is safe. The bezel + glow utility classes
live in `app/globals.css` (`.zip-glow-cyan`, `.zip-pulse-dot`,
`.zip-num`, `.zip-label`). Don't introduce new design tokens without
agreeing them with the maintainer.

## Gotchas

- **`next lint` is broken.** Known Next.js 16.1.1 bug. The `lint` npm
  script is a placeholder that exits 0 with a message. Don't try to
  "fix" it. Linting still runs as part of `next build`.
- **Sticky topic latency.** On reconnect, the brain sends sticky
  snapshots first. Your component renders blank for 1-2 frames before
  the first sticky arrives. Use a loading state or a "—" placeholder.
- **R3F (`@react-three/fiber`) is marked external on the server side**
  in `next.config.js`. Don't import three.js inside a server component;
  it'll throw at build time.
- **serialport is marked external on the client side.** Same idea —
  don't import it in a component, only in an API route.
- **Dev server port is 3000** by default; `npm run dev:local` binds to
  `0.0.0.0` so other devices on your network can hit it.

## What NOT to touch without thinking

- **`useZipBrain.ts`** — connection lifecycle. Subtle. Has exponential
  backoff, message dispatch, send queue. Read carefully before
  changing.
- **`useDriveInput.ts`** — synchronous dispatch is intentional (see
  drive path above). Don't "modernize" it with rAF.
- **`MissionBar.tsx`** — has the WHEELS LOCKED badge. Don't hide it
  or weaken its visibility. See [ADR 0005](../../docs/adr/0005-wheels-locked-default.md).
- **`MapView.tsx`** — click-to-set-goal is the planner's only
  user-visible input. Calculations must match the brain's coordinate
  system exactly.

## Testing

- `npm run typecheck` — strict TS. Run before every PR.
- `npm run build` — full production build (includes type check + lint
  via `next build`).
- `npm run test:e2e` — Playwright. **V2 cockpit currently has no
  E2E coverage.** That's a TODO; adding one means mocking the brain
  WebSocket. Existing tests cover V1 HUD and vision panels only.

## Browser console

Open devtools, look at the Network → WS tab. You should see one
sustained WebSocket connection plus periodic image requests for
camera frames. If you see WebSocket reconnect loops, check
journalctl on the brain.

## When to escalate

- **You're touching the WebSocket message types.** Triple-coupling
  with brain + firmware. Open an issue or ADR first.
- **You see a build error related to `serialport` or `better-sqlite3`.**
  These are native modules; they may need a rebuild. `npm rebuild` first.
- **Production build fails but dev works.** Look for client-only code
  that snuck into a server component.
