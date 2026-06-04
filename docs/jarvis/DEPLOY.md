# Jarvis / OpenClaw — Jetson deployment & ops

Reproducible record of installing OpenClaw as a **100% local** agent on the Zip
Jetson, the **8 GB memory tuning** that made it fit, and the day-to-day runbook.
Done 2026-06-03. See [RESEARCH_AND_DECISIONS.md](RESEARCH_AND_DECISIONS.md) for
the "why".

## Target board (measured)

- Jetson Orin Nano Super, **8 GB unified RAM**, ~67 TOPS.
- JetPack 6.2 (**L4T R36.4.7**), Ubuntu 22.04.5 aarch64, power mode `MAXN_SUPER`.
- iGPU CUDA compute 8.7, driver 12.6.
- User `zip`, passwordless sudo. SSH aliases in the PC's `~/.ssh/config`:
  `zip-jetson` → `192.168.55.1` (USB-C bridge), `zip-jetson-wifi` →
  `192.168.86.47`.
- ⚠ `node` / `ollama` / `openclaw` are **not on the non-login PATH** — prefix
  SSH one-liners with `export PATH=$PATH:/usr/bin`.

## What got installed

| Component | Version | How |
|---|---|---|
| Node.js | 24.16 | NodeSource: `curl -fsSL https://deb.nodesource.com/setup_24.x \| sudo -E bash - && sudo apt-get install -y nodejs` |
| Ollama | 0.30.4 | `curl -fsSL https://ollama.com/install.sh \| sh` (auto-detects JetPack → CUDA build) |
| OpenClaw | 2026.6.1 | `sudo npm install -g openclaw@latest` → `/usr/bin/openclaw` |
| Model | `qwen3:4b-instruct-2507-q4_K_M` (2.5 GB) | `ollama pull …`, then a tuned derivative `zip-jarvis` (below) |

(Note: the Jetson did **not** have Ollama pre-installed despite older notes; both
Node and Ollama were installed fresh this session.)

## THE 8 GB FIGHT (do not re-derive)

A 4B Q4 model + KV cache + CUDA context is right at the edge of 8 GB unified
memory. The failures and fixes, in order:

1. **Desktop GUI fragments/reserves GPU memory** → even the 2.49 GB **weights**
   buffer fails `cudaMalloc`. **Fix = run headless:**
   ```bash
   sudo systemctl set-default multi-user.target   # persistent
   sudo systemctl stop gdm                         # immediate
   ```
   GPU-available rose 4.8 → **6.0 GiB**; used RAM dropped to ~0.9 GB. (The
   attached monitor now shows a console login — watch the agent via the dashboard
   from the PC instead. Revert with `set-default graphical.target` if ever needed.)

2. **Even headless, llama.cpp grabs one big contiguous CUDA buffer** → a
   practical ~3.7 GB per-load ceiling. Empirical max context by KV setting:
   - `q8_0` KV → **4096** ctx max
   - `q4_0` KV → **8192** ctx
   - `q4_0` KV **+ reduced `num_batch` (256)** → **16384** ctx (24576 still OOMs)

3. **Ollama service tuning** — drop-in
   `/etc/systemd/system/ollama.service.d/override.conf`:
   ```ini
   [Service]
   Environment="OLLAMA_FLASH_ATTENTION=1"
   Environment="OLLAMA_KV_CACHE_TYPE=q4_0"
   Environment="OLLAMA_KEEP_ALIVE=30m"
   Environment="OLLAMA_MAX_LOADED_MODELS=1"
   Environment="OLLAMA_CONTEXT_LENGTH=16384"
   ```
   `OLLAMA_MAX_LOADED_MODELS=1` is **critical** — otherwise a base + derived model
   double-load and OOM. Apply with
   `sudo systemctl daemon-reload && sudo systemctl restart ollama`.

4. **`num_batch` has no env var** → bake it into a custom model. `Modelfile`:
   ```
   FROM qwen3:4b-instruct-2507-q4_K_M
   PARAMETER num_ctx 16384
   PARAMETER num_batch 256
   ```
   `ollama create zip-jarvis -f Modelfile`. Loads **3.3 GB, 100 % GPU, 16384
   ctx**. OpenClaw points at `ollama/zip-jarvis`.

## OpenClaw configuration

Non-interactive onboarding (local-only, LAN dashboard, daemon, all skills):
```bash
openclaw onboard --non-interactive --accept-risk --flow quickstart \
  --mode local --auth-choice ollama --gateway-bind lan --install-daemon
```
- `--auth-choice ollama` is built in. ⚠ Onboarding auto-pulled its own default
  model (`gemma4`) — we overrode it.
- Set the model:
  `openclaw config set agents.defaults.model.primary "ollama/zip-jarvis"`
- Config file: `~/.openclaw/openclaw.json`. State/creds:
  `~/.openclaw/state/openclaw.sqlite`. Gateway token (plaintext):
  config path `gateway.auth.token`.
- Agent workspace "brain" files: `~/.openclaw/workspace/` —
  `AGENTS.md`, `SOUL.md`, `IDENTITY.md`, `TOOLS.md`, `USER.md`, `HEARTBEAT.md`,
  `BOOTSTRAP.md` (these shape the persona).

## Gateway & dashboard

- Gateway = **systemd *user* service** `openclaw-gateway.service` (lingering
  enabled), port **18789**, bind **lan (0.0.0.0)**, token auth.
- Manage: `openclaw daemon {status,restart}`.
- Dashboard URL: `http://<jetson-ip>:18789/#token=<gateway-token>` — open on the
  PC. (Token is a URL **fragment** with key `token`.)
- Previewing from a Claude session: SSH-tunnel the port and load it — see
  `.claude/launch.json` (`ssh -N -L 18789:localhost:18789 zip-jetson`), then point
  the preview at `http://localhost:18789/#token=…`.

## Run a turn

```bash
openclaw agent --agent main -m "In one sentence, introduce yourself."
# → "I'm your local Jetson AI agent, built for smart, fast, and on-device
#    intelligence right where you need it most."
```

**Provider circuit-breaker:** repeated model errors put the ollama provider "in
cooldown" → `openclaw daemon restart` clears it. Always warm a freshly-tagged
model with a direct `curl localhost:11434/api/generate` **before** pointing
OpenClaw at it.

## Known issues / open items

- **Latency:** first agent turn ≈ **54 s** — prompt-eval of OpenClaw's large
  system prompt + *all* skills at 16384 ctx on a 4B is the bottleneck. Not yet
  optimized. Tension: "all features" (huge toolset) vs an 8 GB 4B. Likely fix =
  curate the skill set + measure warm/cached-prompt turns.
- **Context-window mismatch:** the dashboard shows `16k / 262.1k` — OpenClaw reads
  Qwen3's *native* 262 k max, not our **16384** cap, so its history-compaction is
  tuned to the wrong ceiling (caused the early overflows). TODO: tell OpenClaw the
  real context is 16384.
- **`MEMORY.md` missing** in the agent workspace (dashboard flags it).
- **Robot time-share:** `zip-brain` was **stopped** to free RAM for the agent.
  Running both competes for the 8 GB — the robot↔agent "mode manager" is still an
  open design item.

## Roadmap (this track)

1. Fix the OpenClaw context-window setting (→ 16384) for reliable turns.
2. Persona pass via `SOUL.md` / `IDENTITY.md` (Jarvis voice & behavior).
3. Latency: profile warm turns, curate skills for the 4B.
4. **Voice layer** — wake (openWakeWord) + STT (faster-whisper) + TTS
   (Kokoro/Piper) wrapped around the `:18789` API.
5. **Onshape CAD skill** — the showpiece (voice → parametric CAD).
6. Robot↔agent mode manager (arbitrate the 8 GB).
7. On-demand cloud (Claude) escalation lane.
8. (Low priority) 3D-printer Moonraker tool-cluster.
