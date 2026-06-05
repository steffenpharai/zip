# depth-lab

Monocular depth on the Jetson via **Depth Anything V2 Small** (ONNX/CUDA).

## Status

Code/docs **not yet pulled into this folder** — the Jetson was unreachable
at restructure time. To populate:

```bash
ssh zip-jetson "tar czf /tmp/depth-lab.tgz \
  --exclude=models --exclude=__pycache__ --exclude='*.log' \
  --exclude='*.png' --exclude='*.jpg' depth-lab/"
scp zip-jetson:/tmp/depth-lab.tgz /tmp/
tar xzf /tmp/depth-lab.tgz -C jarvis/
```

## What's there on the Jetson (`~/depth-lab/`)

- `depth.py` — `DepthEstimator.estimate(bgr) -> HxW float32`
- `launcher.sh` — one-command setup
- `models/` — DAv2 Small ONNX weight (95 MB, gitignored)
- `MISSION.md`, `REPORT.md` — agent brief + handoff
- Measured: **6.98 FPS** on Orin Nano 8GB at FP16 autocast

## Used by

- [splat-lab/](../splat-lab) live dashboard (`live_stream.py` daemon)
- Available to [zip-v2/brain](../../zip-v2/brain) Phase 5.3a depth panel
