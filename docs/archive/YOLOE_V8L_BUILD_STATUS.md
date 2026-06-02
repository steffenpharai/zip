# YOLOE-v8L Build Status

## Summary

Successfully downloaded YOLOE-v8L model and exported to ONNX. TensorRT INT8 engine build is currently in progress.

---

## Completed Steps

### ✅ 1. Model Download
- **YOLOE-v8L-seg-pf.pt**: 99 MB
  - Location: `ros2_packages/zip_vision/models/yoloe/yoloe-v8l-seg-pf.pt`
  - Source: Hugging Face (jameslahm/yoloe)
  
- **MobileCLIP checkpoint**: 572 MB
  - Location: `ros2_packages/zip_vision/models/yoloe/mobileclip_blt.pt`
  - Source: Apple ML Research

### ✅ 2. Dependencies Installed
- THU-MIG YOLOE repository cloned to `/tmp/yoloe`
- Ultralytics YOLOE package installed
- ONNX, ONNXsim, ONNXRuntime installed
- NumPy downgraded to 1.26.4 (compatibility)
- HuggingFace Hub installed

### ✅ 3. ONNX Export
- **ONNX File**: `yoloe-v8l-seg-pf_640.onnx`
- **Size**: 176 MB
- **Location**: `ros2_packages/zip_vision/models/yoloe/yoloe-v8l-seg-pf_640.onnx`
- **Export Time**: ~58 seconds
- **Model Stats**: 51.5M parameters, 210.1 GFLOPs
- **Output Shapes**: 
  - `(1, 37, 8400)` - Detection output
  - `(1, 32, 160, 160)` - Segmentation output

---

## In Progress

### ⏳ 4. TensorRT INT8 Engine Build

**Status**: Currently building (layer profiling in progress)

**Command**:
```bash
trtexec --onnx=yoloe-v8l-seg-pf_640.onnx \
    --saveEngine=yoloe-v8l-seg-pf_640_int8.engine \
    --int8 \
    --memPoolSize=workspace:3072 \
    --verbose
```

**Expected Time**: 15-30 minutes for large model (51.5M params)

**Log File**: `/tmp/yoloe_v8l_trt_static.log`

**Current Activity**: Profiling convolution layers (CaskConvolution)

---

## Model Specifications

### YOLOE-v8L-seg-pf (Prompt-Free)

- **Parameters**: 51,472,675 (~51.5M)
- **Layers**: 339 (fused)
- **GFLOPs**: 210.1
- **Zero-shot AP (LVIS)**: 27.2 (prompt-free mode)
- **Input Size**: 640x640
- **Outputs**:
  - Detection: `(1, 37, 8400)` - 37 features (4 bbox + 1 objectness + 32 class scores)
  - Segmentation: `(1, 32, 160, 160)` - Mask features

**Note**: This is a segmentation model with detection output. The detection output has 37 features instead of the standard 84 (4 bbox + 80 classes), indicating it uses a different class set or structure.

---

## Memory Considerations

### Build-Time
- **Workspace**: 3GB (for large model)
- **ONNX Size**: 176 MB
- **Expected Engine Size**: ~50-80 MB (INT8 quantized)

### Runtime
- **Execution Context**: ~700-800MB per context
- **Recommendation**: Use `NUM_STREAMS=1` (already configured)
- **CUDA Memory Fraction**: 0.6-0.7 recommended for large model

---

## Next Steps

1. **Wait for TensorRT build to complete** (15-30 minutes)
2. **Verify engine file**:
   ```bash
   ls -lh ros2_packages/zip_vision/models/yoloe/yoloe-v8l-seg-pf_640_int8.engine
   ```

3. **Update configuration**:
   ```yaml
   # docker-compose.dev.yml
   YOLOE_MODEL_PATH=/workspace/ros2_packages/zip_vision/models/yoloe/yoloe-v8l-seg-pf_640_int8.engine
   ```

4. **Update CUDA memory fraction** (for large model):
   ```yaml
   CUDA_MEMORY_FRACTION=0.6  # Increase from 0.5 for large model
   ```

5. **Test the engine**:
   ```bash
   docker compose -f docker-compose.dev.yml up vision-service
   ```

---

## Important Notes

### Output Format Difference

YOLOE-v8L has **37 features** in detection output (not 84 like YOLO11/YOLOE-11s):
- 4 features: bbox (x, y, w, h)
- 1 feature: objectness score
- 32 features: class scores (32 classes, not 80 COCO classes)

**Code Update Required**: The `yoloe_engine.cpp` postprocessing needs to handle 37 features instead of 84.

### Segmentation Output

The model also outputs segmentation masks: `(1, 32, 160, 160)`. This is additional output that can be used for instance segmentation.

---

## Files Status

```
ros2_packages/zip_vision/models/yoloe/
├── yoloe-v8l-seg-pf.pt          ✅ 99 MB   (PyTorch model)
├── mobileclip_blt.pt            ✅ 572 MB  (MobileCLIP checkpoint)
├── yoloe-v8l-seg-pf_640.onnx    ✅ 176 MB  (ONNX export)
└── yoloe-v8l-seg-pf_640_int8.engine  ⏳ Building... (TensorRT engine)
```

---

## Build Progress

Check build status:
```bash
# Check if build is running
ps aux | grep trtexec | grep -v grep

# Check build log
tail -f /tmp/yoloe_v8l_trt_static.log

# Check for engine file
ls -lh ros2_packages/zip_vision/models/yoloe/yoloe-v8l-seg-pf_640_int8.engine
```

---

## Summary

✅ **Models downloaded**
✅ **ONNX exported** (176 MB)
⏳ **TensorRT engine building** (in progress, ~15-30 min)

The build is progressing normally. Large models take significant time for INT8 quantization and layer profiling.
