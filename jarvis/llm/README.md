# jarvis/llm — planned future brain (not yet integrated)

**Status:** OpenClaw 2026.6.1 + Qwen3-4B-Instruct-2507 are installed on the
Jetson and answer prompts. They are **NOT** wired into the vision stack
([../depth-lab](../depth-lab), [../perception-lab](../perception-lab),
[../splat-lab](../splat-lab)) and **NOT** wired into the
[robot brain](../../zip-v2/brain).

Why this lives in its own folder: per the strategic verdict in
[docs/RESEARCH_AND_DECISIONS.md](./docs/RESEARCH_AND_DECISIONS.md), a
capable fully-local agent **does not fit comfortably on 8 GB**. The
recommended architecture is **hybrid** — keep the Jetson as an edge I/O
node (vision + wake word + reflex 1–3B model), escalate to the user's
**RTX 4070 Ti SUPER 16 GB PC over LAN** for real agentic work.

That's why "Jarvis when the robot isn't around" (in the parent README)
emphasizes vision, not chat — vision works alone on the Jetson; the LLM
side needs the brain tier to be capable.

## What's installed on the Jetson

- **Ollama 0.30.4** (CUDA build, Orin iGPU SM 8.7)
- **OpenClaw 2026.6.1** with onboarded `main` agent
- Models in `/usr/share/ollama/.ollama/models/`:
  - `zip-jarvis:latest` — custom Modelfile bake of qwen3-4b-instruct-2507
    with `num_ctx 16384` + `num_batch 256` (the only safe fit on 8 GB)
  - `qwen3:4b-instruct-2507-q4_K_M` — base
  - `hf.co/nvidia/NVIDIA-Nemotron-3-Nano-4B-GGUF:Q4_K_M` — hybrid,
    investigated then sidelined (Ollama hybrid OOM bug)
  - `gemma4:latest` — installed by OpenClaw onboarding default

Currently dormant — both `zip-brain` and `openclaw-gateway` are
`disabled+inactive` on the Jetson per the 2026-06-04 reversion.

## To wake the agent up

```bash
ssh zip-jetson
export PATH=$PATH:/usr/bin
export XDG_RUNTIME_DIR=/run/user/$(id -u)
# Optional: free ~700 MB by going headless
sudo systemctl set-default multi-user.target && sudo systemctl stop gdm
# Start the gateway (systemd USER unit, port 18789)
systemctl --user enable --now openclaw-gateway
# Run a turn
openclaw agent --agent main -m "hello"
```

Dashboard: `http://192.168.55.1:18789/#token=<TOKEN>` (token in
`~/.openclaw/openclaw.json` → `gateway.auth.token`).
The `.claude/launch.json` `openclaw-dash` entry SSH-tunnels :18789 to PC.

## Docs

- [docs/DEPLOY.md](./docs/DEPLOY.md) — install steps + the 8GB Ollama
  tuning that made it fit
- [docs/RESEARCH_AND_DECISIONS.md](./docs/RESEARCH_AND_DECISIONS.md) —
  why this architecture is the wrong tier for the goal (the strategic
  verdict that put this whole folder behind a `not-yet-integrated` flag)
