# CLAUDE.md — jarvis/llm guidance

You're working on the LLM exploration at `jarvis/llm/`. **Read this
before touching anything in OpenClaw or Ollama on the Jetson.**

For framing: this whole folder is currently **deferred** per
[ADR 0006](../../docs/adr/0006-llm-on-jetson-deferred.md). The Jetson
is the wrong tier for a capable local agent. We're not building toward
"big LLM on Jetson"; we're keeping the install warm in case it's useful
as a thin reflex model on the edge once the hybrid PC-brain architecture
lands.

If you're trying to make the Jetson smarter at chat without changing
the architecture, **pause** — re-read the ADR and the
[RESEARCH_AND_DECISIONS.md](./docs/RESEARCH_AND_DECISIONS.md), then
escalate to the human.

## What's installed on the Jetson

(Per memory file `reference_openclaw_jetson_deploy.md`.)

- **Ollama 0.30.4** (CUDA build for Orin iGPU SM 8.7) at `:11434`
- **OpenClaw 2026.6.1** at `/usr/bin/openclaw`
- Config: `~/.openclaw/openclaw.json`
- State / SQLite: `~/.openclaw/state/openclaw.sqlite`
- Models (in `/usr/share/ollama/.ollama/models/`):
  - `zip-jarvis:latest` — custom Modelfile (Qwen3-4B-Instruct-2507 +
    `num_ctx 16384` + `num_batch 256`)
  - `qwen3:4b-instruct-2507-q4_K_M` — base
  - `hf.co/nvidia/NVIDIA-Nemotron-3-Nano-4B-GGUF:Q4_K_M` — investigated,
    sidelined
  - `gemma4:latest` — onboarding default
- Gateway: systemd USER unit `openclaw-gateway` (port 18789, token auth)
- Dashboard: `http://192.168.55.1:18789/#token=<TOKEN>` (token in config)

## Current state

**Both services are dormant** as of 2026-06-04:

- `default.target` = `graphical.target` (desktop showing on Jetson)
- `zip-brain.service` (robot): **disabled + inactive**
- `openclaw-gateway.service` (agent): **disabled + inactive**
- Ollama: **active** but idle, no model resident, GPU free

To bring the agent back:

```bash
ssh zip-jetson
export PATH=$PATH:/usr/bin
export XDG_RUNTIME_DIR=/run/user/$(id -u)

# Optional: free ~700 MB GPU memory by going headless
sudo systemctl set-default multi-user.target
sudo systemctl stop gdm

# Start the gateway daemon
systemctl --user enable --now openclaw-gateway

# Run a turn
openclaw agent --agent main -m "hello"
```

To go back to desktop:

```bash
sudo systemctl set-default graphical.target
sudo systemctl start gdm
```

## The 8 GB tuning (DO NOT REGRESS)

Ollama systemd drop-in at `/etc/systemd/system/ollama.service.d/override.conf`:

```ini
[Service]
Environment="OLLAMA_FLASH_ATTENTION=1"
Environment="OLLAMA_KV_CACHE_TYPE=q4_0"        # q8_0 caps at 4096 ctx
Environment="OLLAMA_KEEP_ALIVE=30m"
Environment="OLLAMA_CONTEXT_LENGTH=16384"
Environment="OLLAMA_MAX_LOADED_MODELS=1"        # CRITICAL — without this, base+derived double-load → OOM
```

Custom Modelfile (already built into `zip-jarvis:latest`):

```
FROM qwen3:4b-instruct-2507-q4_K_M
PARAMETER num_ctx 16384
PARAMETER num_batch 256
```

These are the result of multiple bring-up sessions and a known Ollama
bug where `num_ctx` doesn't propagate via OpenAI-compat API. Baking it
into the Modelfile is the workaround.

## Operational notes

- **Provider circuit-breaker.** If you see repeated model errors,
  Ollama puts itself in "cooldown" via OpenClaw. Fix: `openclaw daemon
  restart`.
- **Always warm a model before pointing OpenClaw at it.** Test with a
  direct `curl localhost:11434/api/generate` first.
- **First turn is slow** (~54 s). Prompt-eval of OpenClaw's large
  system prompt + ALL skills at 16384 ctx on a 4B model is the
  bottleneck. NOT yet optimized.
- **Tools profile matters.** `tools.profile = "minimal"` (only
  `session_status`) or `"coding"` (fs/exec/web) reduces the prompt
  budget dramatically. Default loads more.

## Common operations

| Task | Command |
|---|---|
| Start gateway | `systemctl --user start openclaw-gateway` |
| Stop gateway | `systemctl --user stop openclaw-gateway` |
| Restart gateway | `openclaw daemon restart` |
| Check status | `openclaw daemon status` |
| Single agent turn | `openclaw agent --agent main -m "..."` |
| Onboard (one-shot) | `openclaw onboard --non-interactive --accept-risk --flow quickstart --mode local --auth-choice ollama --gateway-bind lan --install-daemon` |
| List models | `ollama list` |
| Test model directly | `curl localhost:11434/api/generate -d '{"model":"zip-jarvis","prompt":"hi"}'` |

## What NOT to do

- **Don't bump `num_ctx` past 16384.** OOMs Ollama on 8 GB. Tested.
- **Don't use Nemotron-3-Nano-4B-Hybrid** without re-reading the
  research doc. Mamba-hybrid recurrent state has known OOM bugs in
  llama.cpp / Ollama that bite worse than dense.
- **Don't run a VLM (vision-language model) alongside Qwen.** Confirmed
  by research: VLM + LLM cannot coexist on 8 GB at usable context.
- **Don't enable the desktop GUI while OpenClaw is loaded.** Costs
  ~700 MB GPU memory; pushes Qwen3-4B over the edge.
- **Don't install `openclaw`/`ollama` to user-local paths.** Both are
  installed system-wide via official installers; `~/.local/bin` shadows
  cause hard-to-debug behavior.

## What to do instead (the hybrid roadmap)

If you want to make Jarvis smarter, the recommended path is:

1. **Edge (Jetson):** keep a *thin* 1-3 B reflex model here. Short,
   stable, KV-cacheable prompt. Wake word + STT + TTS around it.
2. **Brain (PC):** stand up a 14-32 B dense model service on the
   RTX 4070 Ti SUPER 16 GB. Serve over LAN. This is where real agentic
   work happens.
3. **Bridge:** route prompts to edge for reflexes, escalate to brain
   for everything else.

This work is not yet started. The Jetson-side install in this folder
is the edge tier ready to plug in.

## Reference docs

- [`docs/DEPLOY.md`](./docs/DEPLOY.md) — install steps + 8 GB tuning
- [`docs/RESEARCH_AND_DECISIONS.md`](./docs/RESEARCH_AND_DECISIONS.md)
  — strategic verdict + research citations
- [`/docs/adr/0006-llm-on-jetson-deferred.md`](../../docs/adr/0006-llm-on-jetson-deferred.md)
  — the decision in canonical form
- [reference_openclaw_jetson_deploy.md](../../../C:/Users/phara/.claude/projects/C--Zip/memory/reference_openclaw_jetson_deploy.md)
  — the hard-won operational details from the bring-up session
