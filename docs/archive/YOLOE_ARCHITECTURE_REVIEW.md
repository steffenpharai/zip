# YOLOE Architecture Review - Memory Constraints Analysis

## Executive Summary

This document reviews the current YOLOE architecture implementation and provides recommendations to address GPU memory constraints during build and runtime. The analysis is based on NVIDIA Jetson Orin Nano 8GB best practices and the information provided about YOLOE-v8-L model compatibility.

---

## Current Architecture Analysis

### 1. Model Configuration

**Current Setup:**
- **Model**: `yoloe-11s-seg-pf` (Small variant, prompt-free)
- **Input Size**: 640x640
- **Precision**: INT8 (default) or FP16 (fallback)
- **Expected Model Path**: `yoloe-11s-seg-pf_640_int8.engine`

**User Context:**
- User mentioned **YOLOE-v8-L** (Large variant, ~45-50M params)
- This is significantly larger than the current `yoloe-11s-seg-pf` (Small variant)

**Key Difference:**
- **YOLOE-11s**: Small variant (~26-32M params) - Jetson-friendly
- **YOLOE-v8-L**: Large variant (~45-50M params) - May exceed Jetson memory limits

### 2. Memory Constraints Identified

#### A. Build-Time Memory Issues (TensorRT Engine Export)

**Current Export Script Configuration:**
```bash
# From export_yoloe_int8_docker.sh
--memPoolSize=workspace:2048  # 2GB workspace
```

**Issues:**
1. **Workspace Size**: 2GB may be insufficient for YOLOE-v8-L model export
2. **Model Size**: Large models require more memory during ONNX → TensorRT conversion
3. **Calibration**: INT8 quantization requires additional memory for calibration dataset

**Recommendations:**
- For **YOLOE-11s** (current): 2GB workspace is adequate ✅
- For **YOLOE-v8-L** (if switching): Increase to 3-4GB workspace
- Consider using **FP16** instead of INT8 for large models (less memory during export)

#### B. Runtime Memory Issues (Execution Context Creation)

**Current Code Configuration:**
```cpp
// From yoloe_engine.hpp:135
static constexpr int NUM_STREAMS = 1;  // Reduced to avoid GPU memory issues
```

**Memory Breakdown per Execution Context:**
- **Engine weights**: ~8-50MB (depends on model size)
- **Execution context**: ~475MB per context (TensorRT 10.x)
- **Input buffer**: ~4.9MB (640x640x3x4 bytes)
- **Output buffer**: ~2.8MB (84x8400x4 bytes)
- **CUDA runtime overhead**: ~100-200MB

**Total per Context:**
- **YOLOE-11s**: ~600MB per context
- **YOLOE-v8-L**: ~700-800MB per context (larger weights)

**Current Memory Budget (8GB Shared Memory):**
```
System/OS:        ~1.5GB
GPU Memory Pool:   ~3-4GB
Vision Service:   3GB limit (Docker)
Other containers: ~2.5GB
─────────────────────────
Total:            ~8GB ✅ (tight but workable)
```

**Problem:**
- With `NUM_STREAMS=1`, only one context is created (~600MB)
- If user switches to YOLOE-v8-L, single context needs ~700-800MB
- Multiple contexts (for pipelining) would exceed memory limits

### 3. Docker Configuration Review

**Current Settings (`docker-compose.dev.yml`):**
```yaml
deploy:
  resources:
    limits:
      memory: 3G  # Reduced from 4G
    reservations:
      memory: 1.5G
environment:
  - CUDA_MEMORY_FRACTION=0.5  # 50% of GPU memory
  - TENSORRT_WORKSPACE_SIZE=1024  # 1GB workspace
```

**Analysis:**
- ✅ Memory limit (3GB) is appropriate for 8GB system
- ⚠️ `CUDA_MEMORY_FRACTION=0.5` may be too restrictive for large models
- ⚠️ `TENSORRT_WORKSPACE_SIZE=1024` is for runtime, not export

---

## Recommendations

### 1. Model Selection Strategy

**Option A: Stay with YOLOE-11s (Recommended)**
- ✅ Small variant fits comfortably in 8GB Jetson
- ✅ Can use INT8 quantization for best performance
- ✅ Supports multi-stream pipelining (if memory allows)
- ✅ Real-time performance: 30-100+ FPS on Orin Nano

**Option B: Use YOLOE-v8-L (If Required)**
- ⚠️ Requires careful memory management
- ⚠️ May need to disable multi-stream (`NUM_STREAMS=1`)
- ⚠️ Consider FP16 instead of INT8 (less memory pressure)
- ⚠️ Use lower resolution (416x416 or 320x320) if needed
- ⚠️ Expect lower FPS: 10-30 FPS on Orin Nano

**Recommendation:** Stick with YOLOE-11s unless you specifically need the accuracy improvements of the Large variant.

### 2. Build-Time Memory Optimization

**For YOLOE-11s (Current):**
```bash
# Current export script is adequate
--memPoolSize=workspace:2048  # 2GB is sufficient
```

**For YOLOE-v8-L (If Switching):**
```bash
# Increase workspace for large model export
--memPoolSize=workspace:3072  # 3GB for large models
# Or use FP16 export (less memory during build)
--fp16  # Instead of --int8
```

**Export Script Updates Needed:**
```bash
# In export_yoloe_int8_docker.sh, make workspace size configurable:
WORKSPACE_SIZE=${4:-2048}  # Default 2GB, allow override
TRTEXEC_CMD="${TRTEXEC_CMD} --memPoolSize=workspace:${WORKSPACE_SIZE}"
```

### 3. Runtime Memory Optimization

**Current Implementation:**
- ✅ `NUM_STREAMS=1` prevents multi-context memory issues
- ✅ Single execution context uses ~600MB (manageable)

**If Using YOLOE-v8-L:**
1. **Keep `NUM_STREAMS=1`** (already done)
2. **Increase `CUDA_MEMORY_FRACTION`** to 0.6-0.7:
   ```yaml
   - CUDA_MEMORY_FRACTION=0.6  # Allow more GPU memory
   ```
3. **Consider FP16 instead of INT8**:
   - FP16 uses slightly more memory but is more stable
   - INT8 requires proper calibration (can fail if calibration is poor)

### 4. Code Architecture Improvements

#### A. Dynamic Memory Management

**Current Issue:**
- Memory allocation is fixed at initialization
- No graceful degradation if memory is insufficient

**Recommendation:**
Add memory-aware initialization:

```cpp
// In yoloe_engine.cpp, allocateBuffers()
bool YOLOEEngine::allocateBuffers() {
    // Check available GPU memory first
    size_t free_mem, total_mem;
    cudaMemGetInfo(&free_mem, &total_mem);
    
    // Estimate required memory
    size_t required = input_size_ + output_size_ + 
                      (475 * 1024 * 1024);  // ~475MB for context
    
    if (free_mem < required * 1.2) {  // 20% safety margin
        RCLCPP_WARN("Insufficient GPU memory: %zu MB free, %zu MB required",
                   free_mem / (1024*1024), required / (1024*1024));
        return false;
    }
    
    // Proceed with allocation...
}
```

#### B. Model Size Detection

**Recommendation:**
Detect model size and adjust configuration automatically:

```cpp
// In yoloe_engine.cpp, loadEngine()
bool YOLOEEngine::loadEngine(const std::string& engine_path) {
    // Get engine file size
    std::ifstream file(engine_path, std::ios::binary | std::ios::ate);
    size_t engine_size = file.tellg();
    
    // Estimate model variant based on engine size
    // YOLOE-11s: ~8-15MB, YOLOE-v8-L: ~50-80MB
    if (engine_size > 40 * 1024 * 1024) {  // > 40MB = Large model
        RCLCPP_WARN("Large model detected (%zu MB). Using conservative memory settings.",
                   engine_size / (1024*1024));
        // Disable multi-stream, use FP16, etc.
    }
}
```

### 5. Export Script Enhancements

**Current Script:** `scripts/ros2/export_yoloe_int8_docker.sh`

**Recommended Updates:**

1. **Make workspace size configurable:**
```bash
WORKSPACE_SIZE=${4:-2048}  # Default 2GB, allow override
TRTEXEC_CMD="${TRTEXEC_CMD} --memPoolSize=workspace:${WORKSPACE_SIZE}"
```

2. **Add model size detection:**
```bash
# Detect model size and adjust workspace
ONNX_SIZE=$(du -m "${ONNX_FILE}" | cut -f1)
if [ ${ONNX_SIZE} -gt 100 ]; then
    echo "Large model detected (${ONNX_SIZE}MB). Using 3GB workspace."
    WORKSPACE_SIZE=3072
fi
```

3. **Add memory check before export:**
```bash
# Check available GPU memory
GPU_MEM=$(nvidia-smi --query-gpu=memory.free --format=csv,noheader,nounits | head -1)
if [ ${GPU_MEM} -lt 3000 ]; then
    echo "Warning: Low GPU memory (${GPU_MEM}MB). Export may fail."
    echo "Consider: 1) Close other GPU processes 2) Use FP16 instead of INT8"
fi
```

---

## Action Items

### Immediate (For Current YOLOE-11s Setup)

1. ✅ **Verify model file exists:**
   ```bash
   ls -lh ros2_packages/zip_vision/models/yolo11/yoloe-11s-seg-pf_640_int8.engine
   ```

2. ✅ **Check build logs for specific error:**
   - Is it failing during ONNX export?
   - Is it failing during TensorRT engine build?
   - Is it failing during runtime initialization?

3. ✅ **Monitor memory during build:**
   ```bash
   # In another terminal, monitor memory
   watch -n 1 'free -h && nvidia-smi'
   ```

### If Switching to YOLOE-v8-L

1. **Update export script** to use 3GB workspace
2. **Increase `CUDA_MEMORY_FRACTION`** to 0.6-0.7
3. **Consider FP16** instead of INT8 for initial testing
4. **Test with lower resolution** (416x416) first
5. **Monitor memory usage** during export and runtime

### Code Improvements (Optional but Recommended)

1. **Add memory-aware initialization** (see section 4.A)
2. **Add model size detection** (see section 4.B)
3. **Make workspace size configurable** in export script
4. **Add memory checks** before critical operations

---

## Testing Checklist

### Build-Time Testing

- [ ] ONNX export completes without OOM
- [ ] TensorRT engine build completes
- [ ] Engine file size is reasonable (< 100MB for Large, < 20MB for Small)
- [ ] No memory-related errors in build logs

### Runtime Testing

- [ ] Engine loads successfully
- [ ] Execution context creates without OOM
- [ ] First inference completes
- [ ] Sustained inference (100+ frames) without memory leaks
- [ ] GPU memory usage stays within limits

### Performance Validation

- [ ] FPS meets requirements (30+ for real-time)
- [ ] Latency is acceptable (< 50ms per frame)
- [ ] No frame drops or timeouts
- [ ] System remains responsive

---

## References

- **NVIDIA Jetson Best Practices**: https://docs.nvidia.com/deeplearning/frameworks/install-pytorch-jetson-platform/
- **Ultralytics Jetson Guide**: https://docs.ultralytics.com/guides/nvidia-jetson/
- **TensorRT Memory Management**: https://docs.nvidia.com/deeplearning/tensorrt/developer-guide/index.html#memory
- **YOLOE Documentation**: Check Ultralytics YOLOE repository for model-specific requirements

---

## Summary

**Current Status:**
- Architecture is well-designed for YOLOE-11s (Small variant)
- Memory constraints are manageable with current settings
- `NUM_STREAMS=1` prevents multi-context memory issues

**If Using YOLOE-v8-L:**
- Requires workspace size increase (3GB+)
- May need to increase `CUDA_MEMORY_FRACTION`
- Consider FP16 instead of INT8
- Test with lower resolution first

**Recommendation:**
Stick with YOLOE-11s unless you specifically need Large variant accuracy. The Small variant provides excellent performance on Jetson Orin Nano 8GB with real-time inference capabilities.
