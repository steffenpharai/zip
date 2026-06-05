# ADR 0001 — Monorepo with `zip-brain` as submodule

**Status:** Accepted (2026-06-04)
**Authors:** @steffenpharai (+ Claude restructure pass)

## Context

By June 2026 the Zip project had grown to four loosely-coupled concerns:

- A **Next.js HUD** that runs on Windows and talks to the Jetson.
- A **Python brain** that runs on the Jetson, owns the UART link to the
  robot, and serves the HUD over WebSocket.
- **Firmware** for the Arduino UNO and the ESP32-S3 camera.
- A growing **Jarvis** track of vision experiments (depth-lab,
  perception-lab, splat-lab) and an LLM exploration (OpenClaw).

These had ended up scattered across the repo root, with V1 cruft mixed
in. The Python brain lived as a gitignored nested clone at `jetson/`. The
splat-lab work was completely untracked.

Two repo-shape options were considered:

**A. Many repos.** One repo per concern (zip-hud, zip-brain, zip-firmware,
zip-jarvis, etc.). Tight encapsulation. Each can ship independently.

**B. Monorepo.** Everything in one repo with clear top-level concerns.

Within (B), the brain is the natural exception — it needs to be cloneable
standalone onto a Jetson without dragging in the HUD, firmware toolchain,
or v1 archive.

## Decision

We adopt **B** — a monorepo at `github.com/steffenpharai/zip` with:

- `jarvis/` — vision-first agent and labs (primary current focus)
- `zip-v2/` — the robot (hud, brain submodule, firmware, bridge, legacy)
- `zip-v1/` — predicate snapshot + meta docs, full source at the
  `v1-archive` tag
- `docs/` — umbrella documentation
- `.github/` — repo tooling

The brain stays in its own repo (`steffenpharai/zip-brain`) and is
mounted as a **proper git submodule** at `zip-v2/brain/`. This is the
*only* submodule.

## Consequences

**Easier:**
- **Cross-cutting changes.** A protocol change touches brain, HUD, and
  firmware — now in one commit history (with a brain-side PR for the
  submodule bump).
- **Documentation.** Single home for all docs; one ARCHITECTURE.md to
  rule them all.
- **Discovery.** New contributors / AI agents have one clone to grok.
- **Atomic versioning.** The outer repo's commit pins a specific brain
  SHA, HUD code, and firmware version that all worked together.

**Harder:**
- **Submodule UX.** Devs must remember `git submodule update --init` on
  fresh clones. PRs touching the brain require a two-step landing.
- **Repo size.** v1 snapshot + jarvis docs + lab Python = bigger clone,
  even though heavy assets (models, build outputs) are gitignored.
- **Discoverability of the brain alone.** External devs landing on
  `zip-brain` directly might not realize it's part of a larger system —
  the brain README needs to point back here.

**Trade-offs explicitly accepted:**
- Subtree-merge of the brain (absorb full history into this repo) was
  considered and rejected — it would break the "deploy brain alone on
  Jetson" property which is operationally important. Submodule overhead
  is preferred to losing standalone deployability.
- Splitting v1 into its own `zip-v1-archive` repo was considered and
  rejected for full archival; instead we keep meta docs + structure +
  tag pointer in `zip-v1/` of the monorepo, with the renamed
  `steffenpharai/zip-v1-archive` repo holding the full source at the tag.

## Migration history

- `steffenpharai/Zip` (V1, capital Z) → renamed to
  `steffenpharai/zip-v1-archive`, tagged `v1-archive` at commit
  `62869583`.
- `steffenpharai/zip-v2` → renamed to `steffenpharai/zip` (new canonical).
- `steffenpharai/zip-brain` → unchanged, now mounted as submodule.
- Restructure commits: `621aa38` (the move), `bf33a67` (path fixes).
