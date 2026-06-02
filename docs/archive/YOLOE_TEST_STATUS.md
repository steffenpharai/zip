# YOLOE-v8L Test Status

## Current Status: Building TensorRT Engine

**Issue Found**: TensorRT version mismatch
- Host TensorRT: 10.3.0
- Container TensorRT: 10.4.0.26
- Original engine built with 10.3.0 (incompatible)

**Solution**: Rebuilding engine inside container with TensorRT 10.4.0

## Build Progress

- **Started**: 2026-01-18 17:14:15
- **Expected Duration**: ~20 minutes
- **Container**: `yoloe_build`
- **Command**: `/usr/src/tensorrt/targets/aarch64-linux-gnu/bin/trtexec --onnx=yoloe-v8l-seg-pf_640.onnx --saveEngine=yoloe-v8l-seg-pf_640_fp16.engine --fp16 --memPoolSize=workspace:3072`

## Next Steps After Build

1. **Verify Engine File**:
   ```bash
   docker exec yoloe_build ls -lh /workspace/ros2_packages/zip_vision/models/yoloe/yoloe-v8l-seg-pf_640_fp16.engine
   ```

2. **Copy Engine to Host** (if needed):
   ```bash
   docker cp yoloe_build:/workspace/ros2_packages/zip_vision/models/yoloe/yoloe-v8l-seg-pf_640_fp16.engine \
     ros2_packages/zip_vision/models/yoloe/
   ```

3. **Start Vision Service**:
   ```bash
   docker compose -f docker-compose.dev.yml up -d vision-service
   ```

4. **Test Detections**:
   ```bash
   # Check status
   curl http://localhost:8767/api/vision/status | python3 -m json.tool
   
   # Get detections
   curl http://localhost:8767/api/vision/detections | python3 -m json.tool
   
   # Monitor logs
   docker compose -f docker-compose.dev.yml logs -f vision-service | grep -E "(yoloe|detection|ERROR)"
   ```

## Test Scripts Available

- `test_vision_full.sh` - Full factorial test
- `test_vision_diagnostics_autonomous.sh` - Autonomous testing
- `scripts/test_yoloe_comprehensive.sh` - Comprehensive test suite

## Expected Results

- Camera: Active (640x480)
- Detections: Active with YOLOE-v8L (37 features, 32 classes)
- Inference Speed: ~26-28ms (35 FPS)
- GPU Memory: ~700-800MB per context
