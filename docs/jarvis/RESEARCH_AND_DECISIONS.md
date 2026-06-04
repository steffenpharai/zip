# Jarvis — research & locked decisions

Captured 2026-06-03. This is the "why" behind the OpenClaw-on-Jetson build in
[DEPLOY.md](DEPLOY.md). Research was web-grounded (mid-2026 sources); the
deployment facts are measured on the actual board.

## The goal

A personal AI agent that runs on the standalone Jetson (backpack), emulating
**JARVIS from Iron Man** — voice-driven, agentic ("does things", not just chat),
with a special interest in the **engineering/CAD design** angle. Reference point
was "like OpenClaw, but…", which resolved into "use OpenClaw".

## The one hard truth

**You cannot run Claude locally.** Claude's weights are closed (API/apps only).
"Local" always means an *open* model (Qwen / Llama / Gemma / Nemotron). So:

| Want | Reality |
|---|---|
| "All the features Claude Code has" | ✅ the *harness* is replicable locally (OpenClaw) |
| "Run it locally / free" | ✅ local open model via Ollama, $0/token |
| "Talk to **Claude** locally" | ❌ impossible — local = an open model with a real capability gap |

(Cost aside: Claude Code on a **Max subscription** is a flat fee, not per-token —
the middle path if "don't pay tokens" is the real driver. Not what we chose.)

## Jarvis capability map → 2026 reality (summary)

| Capability | Feasible here? |
|---|---|
| Natural voice conversation | ✅ local cascade: wake → STT → LLM → TTS |
| Device / home / robot control | ✅ tools/skills (local) |
| **Voice-driven parametric CAD** (the showpiece) | ✅ via the **Onshape MCP** — real, editable B-rep ("design a 40 mm bracket with two M3 holes" → mass/CG/interference). Needs internet (cloud CAD API). |
| Engineering answers (mass, CG, interference) | ✅ exact via Onshape MCP |
| Knowledge + memory | ✅ local RAG + OpenClaw memory |
| Web / live info | ☁ needs internet |
| Run tasks / code / files | ✅ OpenClaw shell + skills (sandbox concerns noted) |
| Trigger Claude Code | ☁ on-demand only, when explicitly requested |
| FEA / CFD simulation | ✗ on-device; export STEP → cloud/desktop solver |

**CAD is the differentiator** — no off-the-shelf assistant turns voice into real
parametric CAD, and the Onshape MCP is already wired. Lead with it (later track).

## Local model selection (≤4 B, tool-calling first)

The original pick (Qwen2.5-3B) was **stale** — the field moved two generations.
Current pick, measured against tool-calling (BFCL) and Jetson fit:

| Model | Note |
|---|---|
| **Qwen3-4B-Instruct-2507** ✅ | non-thinking by design (lowest latency), strong tool-calling (BFCL-v3 61.9), ~2.5 GB Q4, best-documented Jetson path → **chosen** |
| Qwen3.5-4B | newer but **thinks by default** (latency tax for voice) and 3.4 GB — worse here unless thinking is pinned off |
| Granite-4.0-Micro 3B | lean fallback (~2 GB) if 4B won't fit |
| Qwen3.5-9B | only for an at-home big box (≈6 GB) |

**Thinking vs voice:** the user wants reasoning, but reasoning preambles wreck
turn latency on a 4B. Resolution: run the **non-thinking** 2507 for fast voice
turns; escalate hard reasoning to the cloud **on demand** (not built yet).

## Harness: OpenClaw vs NVIDIA NemoClaw

- **OpenClaw** (openclaw.ai, MIT, ~68k★, Peter Steinberger; was "Clawdbot"):
  open autonomous-agent harness — memory, shell, files, web, skills,
  model-agnostic (local Ollama **or** Claude/GPT/Gemini), runs on Pi/Jetson.
  Chat-app-first, **not voice-native** (we add voice). → **CHOSEN.**
- **NemoClaw** (NVIDIA, early preview 2026-03-16): NVIDIA's *governed* OpenClaw —
  runs OpenClaw/Hermes agents inside the **OpenShell** sandbox + Nemotron models
  + local↔cloud routing. **Targets DGX Spark / RTX-class boxes, not an 8 GB
  Jetson.** → deferred; the option for an at-home big-box deployment.

## Locked decisions (2026-06-03)

1. **Primary target = standalone backpack Jetson** (8 GB), time-shared w/ robot.
2. **Adopt OpenClaw** as the harness (don't build our own).
3. **Local LLM only** for now — `Qwen3-4B-Instruct-2507`, Ollama. Cloud escalation
   is an explicit, on-demand, later add.
4. **Voice after** the agent core works (wake-word + turn-taking; not full-duplex).
5. **Optimize hard for 8 GB** — see the tuning in [DEPLOY.md](DEPLOY.md).
6. **3D printer** (Moonraker/Klipper at a link-local IP) = lowest priority, a
   trivial tool-cluster to add later.

## Planned voice stack (next track)

- Wake word: **openWakeWord** (CPU, free, ships "hey jarvis").
- STT: **faster-whisper small.en** (CUDA).
- TTS: **Kokoro-82M** (the voice) / **Piper** (low-latency fallback).
- Integration: front-end wraps wake+STT+TTS around OpenClaw's local `:18789` API.
