# ADR 0007 — V1 archived as predicate, not migrated

**Status:** Accepted (2026-06-04)

## Context

Zip V1 ([`steffenpharai/zip-v1-archive`](https://github.com/steffenpharai/zip-v1-archive),
tag `v1-archive` at commit `62869583`, 2026-01-19) was a meaningfully
different project:

- **OpenAI Realtime API** for voice control
- **ROS 2** workspace for vision, voice, orchestration, control
- **MCP integrations** for tools and observability
- Same Elegoo robot hardware, different software approach

When V2 was started in May 2026, we faced the standard "rewrite vs.
incremental" question. The answer was:

- **V2 is a redesign**, not a refactor. ROS 2 is out. OpenAI is out
  (default). The control architecture (UNO owns time) is new.
- **The hardware is the same**, so V1 firmware patterns are directly
  reusable. The chassis wiring, the IMU, the camera mount, the battery
  topology — same.
- **Operational knowledge is gold.** V1 ran. It had a working voice
  loop. Many of the gotchas in [KNOWN_ISSUES.md](../KNOWN_ISSUES.md)
  were learned in V1.

So V1 is treated as a **predicate**: the thing that came before, the
foundation of accumulated knowledge, the reference for "wait, how did
we handle that?" questions. Not a migration target.

## Decision

**V1 is archived, not migrated.** Specifically:

1. The V1 GitHub repo `steffenpharai/Zip` was renamed to
   `steffenpharai/zip-v1-archive`. Full source preserved.
2. The V1 master HEAD was tagged `v1-archive` at commit `62869583` so
   the canonical archival point is referenceable.
3. The monorepo at `github.com/steffenpharai/zip` includes a
   [`zip-v1/`](../../zip-v1/) folder with:
   - V1 meta docs (README, CHANGELOG, agent guides, troubleshooting)
   - A directory listing (`structure.txt`)
   - SHA + date pinning
   - A README pointing back at the archive tag
4. No V1 source code is duplicated in the monorepo (full source lives
   only at the tag).
5. V1 is read-only. No new commits, no bug fixes, no feature backports.

## Consequences

**Easier:**
- **No migration backlog.** We don't owe anyone a "V1 still works"
  promise. Effort goes entirely to V2.
- **Reference value preserved.** Anyone wanting to see how V1 handled
  voice or ROS 2 wiring can clone the archive tag and read.
- **Clean V2.** The monorepo isn't bloated with two parallel systems
  trying to share code that doesn't really share concerns.
- **Onboarding signal.** New contributors can read `zip-v1/README.md`
  to understand the project's history and why V2 looks the way it does.

**Harder:**
- **Users of V1.** There weren't any other than the original author;
  this is a private project. If V1 had users, the calculus would
  differ.
- **Resurrection if needed.** If a V1 feature turns out to have been
  load-bearing and we want to bring it back, we'd have to manually
  port it from the archive — no clean upstream merge path.

## What was NOT brought forward from V1

- ROS 2 workspace and all colcon packages (`build/`, `install/`,
  `log/`, `ros2_packages/` — deleted from V2).
- OpenAI voice loop (`lib/openai/`, `app/api/realtime/*` exist in V2
  as dormant code from the V1→V2 transition; will be removed in a
  cleanup phase).
- LangChain orchestration backends (kept as dormant code; will be
  revisited when the hybrid LLM brain lands per
  [ADR 0006](./0006-llm-on-jetson-deferred.md)).
- ROS-style topic/service abstractions (replaced by the asyncio bus
  per [ADR 0004](./0004-sticky-bus-topics.md)).

## What was brought forward

- Hardware patterns (chassis, IMU, motor wiring — all unchanged).
- UART JSON protocol concept (refined: V1's binary protocol was
  removed in V2 for UNO RAM savings).
- Memory of which hardware fixes work (brltty/CH340, ch341.ko
  building, GPIO0 latch, PIO `-D` shadow — all in
  [KNOWN_ISSUES.md](../KNOWN_ISSUES.md)).
- Voice + LLM aspirations (deferred to hybrid PC-brain per
  [ADR 0006](./0006-llm-on-jetson-deferred.md), not abandoned).

## Reference

- [`zip-v1/README.md`](../../zip-v1/README.md) — the V1 archive folder
- [`zip-v1/meta/`](../../zip-v1/meta/) — V1 meta docs preserved
- [v1-archive tag on GitHub](https://github.com/steffenpharai/zip-v1-archive/tree/v1-archive)
  — full V1 source
- [reference_zip_v1_repo.md](../../C:/Users/phara/.claude/projects/C--Zip/memory/reference_zip_v1_repo.md)
  — V1 reference notes from the V1→V2 transition
