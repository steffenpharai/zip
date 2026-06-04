# Zip Jarvis — standalone local AI agent on the Jetson

A separate track from the Zip **robot**: run the **Jetson Orin Nano Super (8 GB)
by itself** — carried in a backpack — as a personal, voice-driven, agentic AI
assistant ("Jarvis"). Same physical Jetson as the robot, **time-shared** (robot
sidekick at home ↔ personal agent on the go).

> The robot is the autonomous sidekick. The Jetson is the brain you carry with
> you. This doc tree covers the brain-as-personal-agent use.

## Current status (2026-06-03)

✅ **Live and fully local.** [OpenClaw](https://openclaw.ai) is installed on the
Jetson and runs a complete agent turn against a **local Qwen3-4B** model — no
cloud, no API key, **zero token cost**. The web Control UI (dashboard) is up and
reachable from the PC.

What works end-to-end: `openWakeWord`-free text path today — wake/STT/TTS voice
layer is the next track. You talk to it via the OpenClaw dashboard / CLI now;
voice comes next.

## This doc tree

- [RESEARCH_AND_DECISIONS.md](RESEARCH_AND_DECISIONS.md) — why this shape: the
  Jarvis capability map, 8 GB feasibility, the local-model selection (and why
  Qwen2.5 was dropped), OpenClaw vs NVIDIA NemoClaw, and the locked decisions.
- [DEPLOY.md](DEPLOY.md) — the reproducible install, the hard-won **8 GB Ollama
  tuning**, the OpenClaw config, the gateway/dashboard ops runbook, known issues,
  and the roadmap.

## One-line architecture

```
mic ▶ [wake + STT]  ─(text)─▶  OpenClaw gateway (:18789)  ─▶  local Qwen3-4B (Ollama)
                                  │  harness: memory, shell, files,        (zip-jarvis)
                                  │  web, skills, dashboard
        speaker ◀─ [TTS] ◀────────┘   + on-demand cloud escalation (later)
```

Brackets `[ ]` = not built yet (voice track). Everything else is running.

## Quick ops

```bash
# from the PC (SSH alias in ~/.ssh/config):
ssh zip-jetson 'export PATH=$PATH:/usr/bin; openclaw daemon status'
ssh zip-jetson 'export PATH=$PATH:/usr/bin; openclaw agent --agent main -m "hello"'
# dashboard (open on PC browser):  http://<jetson-ip>:18789/#token=<gateway-token>
```

See [DEPLOY.md](DEPLOY.md) for the full runbook.
