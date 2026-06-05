# ADR 0006 — LLM-on-Jetson deferred; hybrid PC-brain architecture

**Status:** Accepted (2026-06-04, refining 2026-06-03 install decision)

## Context

The original "Jarvis" vision was a fully-local AI agent on the Jetson
that could chat, plan, and coordinate the robot — wake word triggered,
voice in/out, agentic tool calls. On 2026-06-03 the team installed
**OpenClaw 2026.6.1 + Qwen3-4B-Instruct-2507 via Ollama** on the
Jetson Orin Nano Super (8 GB) and got an end-to-end agent turn working
locally — no cloud, no token cost.

But by 2026-06-04 a multi-thread research pass converged on a
realization: **a capable fully-local agent doesn't comfortably fit on
8 GB**. The investigation surfaced:

- **Qwen3-4B with OpenClaw's 8-15.7 k base prompt** uses almost the
  entire 16384 ctx ceiling (the OpenClaw minimum). Real tool-using
  turns overflow.
- **The 16384 ceiling is hard.** Even with `OLLAMA_FLASH_ATTENTION=1`
  and `OLLAMA_KV_CACHE_TYPE=q4_0`, llama.cpp grabs a contiguous CUDA
  buffer; 24576 ctx OOMs the 8 GB.
- **Hybrids don't help.** NVIDIA Nemotron-3-Nano-4B-Hybrid promised
  smaller KV cache via Mamba; in practice it OOMs WORSE on Ollama
  due to known recurrent-state-buffer bugs in llama.cpp
  ([Ollama #12692](https://github.com/ollama/ollama/issues/12692),
  [llama.cpp #16416](https://github.com/ggerganov/llama.cpp/issues/16416)).
- **VLM + LLM cannot coexist on 8 GB** at usable contexts. This rules
  out a Jetson-only Jarvis that simultaneously sees and chats.
- **Reliable agentic models are dense 8-35B** (per multiple convergent
  evals). 4B models that fit on 8 GB loop, hallucinate, or silently
  fail on real agentic tasks.

The user already has an **NVIDIA RTX 4070 Ti SUPER 16 GB** in the PC
that's reachable over the home LAN — exactly the tier that runs 14-32 B
dense models comfortably.

## Decision

**LLM integration in `jarvis/` is deferred from "in flight" to "future
work" pending a hybrid architecture.**

The recommended architecture is:

- **Edge tier (Jetson, in [`jarvis/`](../../jarvis/))**
  - openWakeWord — local wake word detection
  - Whisper STT (small model) on GPU
  - Piper TTS on CPU
  - YOLO11 + DAv2 (already shipped)
  - A 1-3 B reflex / router model with a stable cacheable prompt for
    KV-prefix reuse — short, focused, latency-optimized for "what is
    the user asking, do I escalate?"

- **Brain tier (PC, future)**
  - 14-32 B dense LLM service on the RTX 4070 Ti SUPER
  - Serves over LAN to the Jetson
  - For heavy tool use (CAD, code, planning), full agentic loops
  - Tooling: vLLM or llama.cpp + grammars
  - Optional cloud frontier escalation for the really heavy stuff

The OpenClaw / Qwen3-4B install on the Jetson is **preserved** under
[`jarvis/llm/`](../../jarvis/llm/) as a working installation with full
docs (deploy steps, the 8 GB tuning, gateway/dashboard ops). It's
currently dormant (services disabled) but bootable as the edge-tier
reflex model when the hybrid wiring is built.

## Consequences

**Easier:**
- **Vision works alone.** Jarvis's vision stack (depth/perception/splat)
  isn't blocked on LLM decisions. The current "Jarvis when the robot
  isn't around" use case is vision-first, which the Jetson handles
  comfortably.
- **Right tool for the job.** A 32B model on the PC will be 10-50× more
  capable per turn than a 4B on the Jetson, with comparable per-turn
  latency once we factor in the Jetson's slow prefill.
- **Matches existing pattern.** This is the same PC-as-brain pattern
  already used for the robot — the HUD on PC, brain on Jetson, but
  for *capable* compute it's PC. Consistency.

**Harder:**
- **More moving parts.** PC LLM service needs to be a long-running
  daemon. The robot loses always-available capability when the PC is
  off — important to articulate to the user.
- **LAN latency budget.** A round-trip Jetson ↔ PC for every agentic
  step adds ~5-50 ms vs. local. Mitigated by streaming tokens and
  hiding latency behind TTS.
- **Bigger surface area to secure.** A LAN-exposed LLM service needs
  basic auth at minimum.

## What this does NOT preclude

- Keeping OpenClaw + Qwen3-4B running for narrow on-device assistance
  (e.g., when the PC is unavailable). Just don't expect "capable
  agent" from it.
- Backpack / portable Jarvis use case where the PC isn't around —
  ceiling is a modest 1-4B reflex assistant + thin harness. Realistic
  scope.

## Reference

- [`jarvis/llm/docs/RESEARCH_AND_DECISIONS.md`](../../jarvis/llm/docs/RESEARCH_AND_DECISIONS.md)
  — the full research-pass writeup with citations.
- [`jarvis/llm/docs/DEPLOY.md`](../../jarvis/llm/docs/DEPLOY.md) — the
  install steps + 8 GB tuning (still useful even with the deferral).
- [reference_openclaw_jetson_deploy.md](../../C:/Users/phara/.claude/projects/C--Zip/memory/reference_openclaw_jetson_deploy.md)
  — the hard-won operational details.

## Supersession path

If future Jetson hardware ships with materially more RAM (Orin AGX 32 GB,
Thor), revisit this decision. The architecture wins (consistent pattern,
clean tier separation) might still favor the hybrid even then, but at
least the memory ceiling stops being the forcing function.
