# Zip v1 — the predicate

The OpenAI-powered voice-controlled robot. Predecessor to [Zip v2](../zip-v2).
Kept as a reference for what we built before; not run anymore.

## Where the source lives

Full v1 codebase is preserved on GitHub at the
[`v1-archive`](https://github.com/steffenpharai/zip/tree/v1-archive) tag,
pointing at commit
**`62869583`** (2026-01-19, "feat: Complete robot control integration via
chat and remove old bridge").

```bash
# Clone v1 source
git clone --branch v1-archive https://github.com/steffenpharai/zip.git zip-v1-source
```

## What's in this folder

- **[meta/](./meta)** — v1's README, CHANGELOG, agent guides, contrib
  guidelines, troubleshooting docs (preserved for context)
- **[legacy-docs/](./legacy-docs)** — the v1 doc tree from `docs/v1/`
- **[structure.txt](./structure.txt)** — directory listing of the v1
  codebase (3 levels deep, sans `.git` / `node_modules`)
- **[HEAD_SHA.txt](./HEAD_SHA.txt)** — exact commit the snapshot was
  taken from
- **[HEAD_DATE.txt](./HEAD_DATE.txt)** — commit timestamp

## What v1 was

- **AI-powered voice control** — OpenAI Realtime API + Whisper STT + TTS
- **ROS 2** workspace for vision, voice, orchestration, control
- **Elegoo robot car** with custom Arduino firmware
- **Next.js HUD** with three.js, Framer Motion, panels
- **MCP integrations** for tools and observability

## Why we moved on

- ROS 2 build complexity vs the value it delivered for a one-robot project
- Cloud LLM round-trip latency on every interaction
- The voice stack was a vertical that didn't compose with the embodied
  control loop the way v2's WebSocket + sticky-bus model does

V2 starts from the chassis up: UNO owns time, Jetson owns intent, PC is
observability only. See [../README.md](../README.md) for the new picture.
