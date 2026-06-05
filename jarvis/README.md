# Jarvis

The vision-first AI agent that lives on the Jetson Orin Nano Super 8GB.
Runs whether or not the [robot](../zip-v2) is around.

## What ships today

| Lab | Role | Status |
|---|---|---|
| **[depth-lab/](./depth-lab)** | DAv2 Small ONNX/CUDA → per-frame depth at ~7 FPS | ✅ ship-ready |
| **[perception-lab/](./perception-lab)** | YOLO11n TRT FP16 → bbox detections at ~34 ms | ✅ ship-ready |
| **[splat-lab/](./splat-lab)** | DA3-Small → 3D Gaussian Splat → SuperSplat viewer | 🔄 WIP — black render |
| **[llm/](./llm)** | OpenClaw + local Qwen3-4B on Ollama | ⏸️ installed, not integrated |

## What "Jarvis when the robot isn't around" means

The Jetson + a C615 USB webcam, on their own, do:

- Real-time RGB stream with YOLO bbox overlays (`live_stream.py` daemon)
- Real-time monocular depth heatmap (DAv2 Small)
- Live tegrastats telemetry (RAM / GPU / power)
- Browser-served dashboard at `localhost:8090` over SSH tunnel
- Capture → reconstruct a walk-through of a scene as a 3DGS splat
- Auto-annotate detected objects in the splat with world-space hotspots

The LLM piece is a separate concern in [llm/](./llm) — currently a working
local Qwen3-4B install but not wired to the vision stack. See its
RESEARCH_AND_DECISIONS.md for why "capable agent on 8GB" is the hard part.

## Reach the Jetson

```
ssh zip-jetson          # 192.168.55.1 via USB-C
ssh zip-jetson-wifi     # 192.168.86.47
```

User `zip`, passwordless sudo. Add `export PATH=$PATH:/usr/bin` for
non-login shells (claude / openclaw aren't on the default path).

## Open the live dashboard

```bash
# SSH tunnel for secure-context localhost (WebGPU + SAB need it):
ssh -L 8090:127.0.0.1:8090 -L 8443:127.0.0.1:8443 -N zip-jetson
# then open http://localhost:8090/ in Chromium
```

The `.claude/launch.json` `jetson-splat` entry sets this up for you.

## Where the labs live

The full lab trees (with model weights, build envs, captures, scenes) live
on the Jetson at `~/depth-lab/`, `~/perception-lab/`, `~/splat-lab/`. This
repo holds the **code, docs, and reproducibility recipes** — heavy artifacts
(`models/`, `.venv/`, `output/`, `scenes/`, `supersplat-viewer/`) are
gitignored.

Sync direction:

```bash
# Pull Jetson truth down to host (the source of truth right now)
rsync -av --exclude=models/ --exclude=.venv/ --exclude=__pycache__/ \
      zip-jetson:~/splat-lab/ jarvis/splat-lab/

# Push a host edit up to Jetson
scp jarvis/splat-lab/scripts/bake.py zip-jetson:~/splat-lab/scripts/
```

## Next concrete goal

**Unblock the splat black-render**. The k-NN-init `bake.py` (preserved as
`splat-lab/scripts/bake.py.knn-init-from-pc`) needs to land on the Jetson,
the splat needs to render in SuperSplat, and the auto-annotation needs to
show real hotspots. See [splat-lab/REPORT.md.pc-mirror](./splat-lab/REPORT.md.pc-mirror)
for the root-cause analysis of the black render.
