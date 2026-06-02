# YOLOE-v8L Download Complete

## Summary

Successfully downloaded YOLOE-v8L model and MobileCLIP checkpoint. ONNX export and TensorRT engine build are in progress.

---

## Downloaded Files

### 1. YOLOE-v8L Model
- **File**: `ros2_packages/zip_vision/models/yoloe/yoloe-v8l-seg-pf.pt`
- **Size**: 99 MB
- **Source**: Hugging Face (jameslahm/yoloe)
- **URL**: https://huggingface.co/jameslahm/yoloe/resolve/main/yoloe-v8l-seg-pf.pt

### 2. MobileCLIP Checkpoint
- **File**: `ros2_packages/zip_vision/models/yoloe/mobileclip_blt.pt`
- **Size**: 572 MB
- **Source**: Apple ML Research
- **URL**: https://docs-assets.developer.apple.com/ml-research/datasets/mobileclip/mobileclip_blt.pt

---

## Model Specifications

- **Model**: YOLOE-v8L-seg-pf (Prompt-Free)
- **Parameters**: ~50M (segmentation)
- **Zero-shot AP on LVIS**: 27.2 (prompt-free mode)
- **Input Size**: 640x640 (configurable)
- **Repository**: THU-MIG/yoloe (https://github.com/THU-MIG/yoloe)

---

## Next Steps

### 1. Export to ONNX
The export script is attempting to convert the PyTorch model to ONNX format. This requires:
- THU-MIG YOLOE repository cloned
- Dependencies installed (CLIP, ml-mobileclip, lvis-api)
- Proper model loading with MobileCLIP checkpoint

### 2. Build TensorRT Engine
Once ONNX is exported, build the INT8 TensorRT engine:
```bash
trtexec --onnx=yoloe-v8l-seg-pf_640.onnx \
    --saveEngine=yoloe-v8l-seg-pf_640_int8.engine \
    --int8 --memPoolSize=workspace:3072 \
    --minShapes=images:1x3x640x640 \
    --optShapes=images:1x3x640x640 \
    --maxShapes=images:1x3x640x640
```

### 3. Update Configuration
Update `docker-compose.dev.yml`:
```yaml
YOLOE_MODEL_PATH=/workspace/ros2_packages/zip_vision/models/yoloe/yoloe-v8l-seg-pf_640_int8.engine
```

---

## Files Location

All files are in: `/home/steffen/Projects/Zip/ros2_packages/zip_vision/models/yoloe/`

- ✅ `yoloe-v8l-seg-pf.pt` (99 MB) - PyTorch model
- ✅ `mobileclip_blt.pt` (572 MB) - MobileCLIP checkpoint
- ⏳ `yoloe-v8l-seg-pf_640.onnx` - ONNX export (in progress)
- ⏳ `yoloe-v8l-seg-pf_640_int8.engine` - TensorRT engine (pending ONNX)

---

## Export Script

Created: `scripts/ros2/export_yoloe_v8l_complete.sh`

This script:
1. Verifies model files exist
2. Installs THU-MIG YOLOE dependencies in Docker
3. Exports model to ONNX
4. Builds TensorRT INT8 engine

Run with:
```bash
./scripts/ros2/export_yoloe_v8l_complete.sh
```

---

## Memory Considerations

YOLOE-v8L is a large model (~50M params):
- **Workspace**: 3GB recommended for TensorRT build
- **Runtime**: ~700-800MB per execution context
- **Recommendation**: Use `NUM_STREAMS=1` (already configured)

---

## Status

✅ Model files downloaded
⏳ ONNX export (in progress - may need dependency fixes)
⏳ TensorRT engine build (pending ONNX)
