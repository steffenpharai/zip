# PR description

## What changed

A clear one-paragraph summary. Link the issue or phase doc this is part
of.

## Why

What problem does this solve / what improvement does it bring? If this
implements an ADR, link it.

## Component impact

- [ ] HUD (`zip-v2/hud/`)
- [ ] Brain (`zip-v2/brain/` — submodule SHA bumped to `__________`)
- [ ] UNO firmware (`zip-v2/firmware/uno/`)
- [ ] ESP32 firmware (`zip-v2/firmware/esp32-cam/`)
- [ ] Wire protocol — **requires ADR**, link: ____________
- [ ] Jarvis labs
- [ ] Documentation only
- [ ] Repo tooling (.github, scripts, gitignore)

## Verification

What did you test? Be specific.

- [ ] **HUD changes:** `npm run typecheck` and `npm run build` pass;
      manual browser test against live/mocked brain
- [ ] **Brain changes:** systemd restart + 60 s clean journal log
- [ ] **UNO firmware:** size report attached; bench test with `pio
      device monitor -b 500000`; N=120 diagnostics show expected state
- [ ] **ESP32 firmware:** `/health` shows expected SSID + uptime;
      MJPEG `:81/stream` renders at expected FPS
- [ ] **Motion-related:** drive-tested on propped-up chassis (wheels
      off ground); confirmed `motion_lock` badge updates correctly;
      STOP path works
- [ ] **Documentation only:** broken-link check, spelling

## The three immovable rules check

Did this PR touch (or come anywhere near) any of these?

- [ ] **UNO owns time** ([ADR 0002](../docs/adr/0002-uno-owns-time.md)) —
      does this add motion logic outside the UNO?
- [ ] **UART 500000 baud** ([ADR 0003](../docs/adr/0003-uart-500k-baud.md)) —
      any serial config touched?
- [ ] **Wheels locked default** ([ADR 0005](../docs/adr/0005-wheels-locked-default.md)) —
      any change to `ZIP_MOTION_LOCKED` default or motion gateway lock check?

If yes to any → call out in the description; reviewer must explicitly
sign off.

## Screenshots / evidence

Required for HUD changes; encouraged for everything else.

## Follow-ups

What's NOT in this PR that should be? Open follow-up issues and link
them.

---

🤖 If this PR was generated or assisted by an AI agent, mention which
one in the body (e.g., "Generated with Claude Opus 4.7 (1M context)").
