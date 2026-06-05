# perception-lab

Object detection on the Jetson via **YOLO11n TensorRT FP16**.

## Status

Code/docs **not yet pulled into this folder** — the Jetson was unreachable
at restructure time. To populate:

```bash
ssh zip-jetson "tar czf /tmp/perception-lab.tgz \
  --exclude=trt_cache --exclude=__pycache__ --exclude='*.log' \
  --exclude='*.jpg' --exclude='*.onnx' --exclude='*.engine' \
  perception-lab/"
scp zip-jetson:/tmp/perception-lab.tgz /tmp/
tar xzf /tmp/perception-lab.tgz -C jarvis/
```

## What's there on the Jetson (`~/perception-lab/`)

- `detect.py` — `Detector.detect(bgr) -> [{label, confidence, box}]` in
  original pixels
- `common_yolo.py` — shared loaders / preprocessing
- `bench_opencv.py`, `bench_ort.py` — runtime benchmark scripts
- `launcher.sh`, `MISSION.md` — agent brief + setup
- `yolo11n.onnx` (11 MB) — model weight (gitignored, regenerable)
- `yolo11n_fp16.engine` (8 MB) — Orin-specific TRT engine, **DO NOT COMMIT**
- `trt_cache/` (10 MB) — TRT timing cache, regenerated
- Measured: **34 ms inference** at FP16 (~30 FPS at 640×640)

## Used by

- [splat-lab/](../splat-lab) live dashboard for bbox overlay
- [splat-lab/scripts/annotate.py](../splat-lab/scripts/annotate.py) to
  unproject detections into world-space hotspots
- The [zip-v2/brain](../../zip-v2/brain) Phase 4 perception module

## Model files

Local copies of `yolo11n.onnx` + `yolo11n.pt` are stashed at
`jarvis/perception-lab/models/` (gitignored). Re-download from Ultralytics
if missing:

```bash
yolo export model=yolo11n.pt format=onnx  # produces yolo11n.onnx
```
