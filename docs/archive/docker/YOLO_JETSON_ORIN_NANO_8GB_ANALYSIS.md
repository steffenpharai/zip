# YOLO Configuration Analysis for Jetson Orin Nano 8GB
## NVIDIA Best Practices Review & Recommendations

### Executive Summary

This document analyzes the current YOLO11 TensorRT implementation against NVIDIA's recommended practices for Jetson Orin Nano 8GB (8GB shared CPU/GPU memory). Key findings and optimizations are provided.

---

## Current Configuration Analysis

### 1. Docker Resource Limits

**Current Settings:**
```yaml
deploy:
  resources:
    limits:
      cpus: '4'
      memory: 4G
    reservations:
      cpus: '2'
      memory: 2G
```

**Issues:**
- **Memory limit too high**: Jetson Orin Nano 8GB has **8GB total shared memory** (CPU + GPU)
- Setting 4GB limit for vision service may cause OOM when combined with:
  - System processes (~1-2GB)
  - Other containers (robot-bridge: 512MB, zip-app: 2GB)
  - GPU memory allocation for TensorRT
- **Recommendation**: Reduce to 2.5-3GB limit, 1.5GB reservation

### 2. Model Precision Mismatch

**Current Issue:**
- Code sets `use_int8 = true` in `yolo11_node.cpp:78`
- Model path points to `yolo11n_640_fp16.engine` (FP16 precision)
- **Mismatch**: Engine is FP16, but code suggests INT8

**NVIDIA Recommendation for Jetson Orin Nano 8GB:**
- **INT8 quantization** provides best performance/speed on 8GB devices
- FP16 is acceptable but uses more memory and is slower
- **Action Required**: Either:
  1. Build INT8 engine: `yolo11n_640_int8.engine`
  2. Or remove `use_int8 = true` if using FP16

### 3. GPU Memory Management

**Current Configuration:**
```yaml
environment:
  - NVIDIA_VISIBLE_DEVICES=all
  - NVIDIA_DRIVER_CAPABILITIES=all
runtime: nvidia
privileged: true
```

**NVIDIA Best Practices:**
- ✅ `NVIDIA_VISIBLE_DEVICES=all` - Correct
- ✅ `NVIDIA_DRIVER_CAPABILITIES=all` - Correct for TensorRT
- ✅ `runtime: nvidia` - Required for GPU access
- ⚠️ `privileged: true` - Needed for camera, but consider alternatives

**Missing GPU Memory Controls:**
- No explicit GPU memory fraction setting
- TensorRT workspace size should be limited for 8GB system
- Current code uses 4GB workspace (from export script) - may be too high

### 4. TensorRT Workspace Size

**Current Setting:**
- Export script uses `workspace=4` (4GB) in `export_yolo11_to_tensorrt.sh:122`
- **Issue**: On 8GB shared memory system, 4GB workspace + model + buffers may exceed available GPU memory

**NVIDIA Recommendation:**
- For Jetson Orin Nano 8GB: Use **2-3GB workspace maximum**
- Total GPU memory usage should stay under 6GB to leave room for system

### 5. CUDA Stream Configuration

**Current Implementation:**
- Uses multi-stream pipelined inference (`NUM_STREAMS` in engine)
- Good for performance, but each stream needs GPU memory
- **Recommendation**: Limit to 2-3 streams max for 8GB system

---

## Recommended Docker Configuration

### Updated `docker-compose.dev.yml` for vision-service:

```yaml
vision-service:
  # ... existing build config ...
  environment:
    - ROS_DOMAIN_ID=${ROS_DOMAIN_ID:-0}
    - ROS_DISTRO=humble
    - VISION_SERVICE_MODE=${VISION_SERVICE_MODE:-both}
    - YOLO11_MODEL_PATH=${YOLO11_MODEL_PATH:-/workspace/ros2_packages/zip_vision/models/yolo11/yolo11n_640_int8.engine}
    - NVIDIA_VISIBLE_DEVICES=all
    - NVIDIA_DRIVER_CAPABILITIES=all
    # GPU memory management for 8GB system
    - CUDA_MEMORY_FRACTION=0.7  # Use 70% of available GPU memory
    - TENSORRT_WORKSPACE_SIZE=2048  # 2GB workspace (MB)
  # ... existing volumes, ports ...
  deploy:
    resources:
      limits:
        cpus: '4'
        memory: 3G  # Reduced from 4G for 8GB shared memory system
      reservations:
        cpus: '2'
        memory: 1.5G  # Reduced from 2G
  # ... rest of config ...
```

### Key Changes:
1. **Memory limits**: 3G limit, 1.5G reservation (safer for 8GB system)
2. **Model path**: Changed to INT8 engine (recommended)
3. **GPU memory controls**: Added `CUDA_MEMORY_FRACTION` and `TENSORRT_WORKSPACE_SIZE`

---

## Code Changes Required

### 1. Fix Model Precision Mismatch

**File**: `ros2_packages/zip_vision/src/yolo11_node.cpp`

**Current:**
```cpp
bool use_int8 = true;  // Use INT8 for Jetson optimization
```

**Recommendation**: Detect from model path or make configurable:
```cpp
// Detect precision from model path or parameter
bool use_int8 = model_path.find("int8") != std::string::npos;
// Or use ROS parameter:
this->declare_parameter<bool>("use_int8", false);
bool use_int8 = this->get_parameter("use_int8").as_bool();
```

### 2. Limit TensorRT Workspace in Export Script

**File**: `scripts/ros2/export_yolo11_to_tensorrt.sh`

**Change line 122:**
```bash
workspace=4,  # 4GB workspace (safe for 8GB Jetson)
```

**To:**
```bash
workspace=2,  # 2GB workspace (optimized for 8GB Jetson Orin Nano)
```

### 3. Add GPU Memory Monitoring

Consider adding environment variable support in `yolo11_engine.cpp` to respect `TENSORRT_WORKSPACE_SIZE` if set.

---

## NVIDIA jetson-containers Alignment

### Current Base Image:
```dockerfile
BASE_IMAGE=dustynv/ros:humble-desktop-l4t-r36.4.0
```

**Status**: ✅ **Correct** - This is the official NVIDIA jetson-containers ROS 2 Humble image optimized for Jetson.

**Verification:**
- Includes CUDA, TensorRT, OpenCV pre-installed
- Optimized for Jetson Orin Nano architecture
- Proper library paths configured

---

## Performance Optimization Checklist

### For Jetson Orin Nano 8GB:

- [x] Use jetson-containers base image (✅ Done)
- [ ] Use INT8 precision model (⚠️ Currently FP16)
- [ ] Limit TensorRT workspace to 2GB (⚠️ Currently 4GB)
- [ ] Reduce Docker memory limit to 3GB (⚠️ Currently 4GB)
- [x] Use pipelined inference (✅ Done)
- [ ] Limit CUDA streams to 2-3 (⚠️ Check current NUM_STREAMS)
- [ ] Add GPU memory fraction control (❌ Missing)

---

## Memory Budget Breakdown (8GB Total)

| Component | Current | Recommended | Notes |
|-----------|---------|-------------|-------|
| System/OS | ~1.5GB | ~1.5GB | Base system |
| GPU Memory (TensorRT) | ~4-5GB | ~3-4GB | Model + workspace + buffers |
| Vision Service Container | 4GB limit | 3GB limit | Docker memory limit |
| Robot Bridge | 512MB | 512MB | OK |
| ZIP App | 2GB | 2GB | OK |
| **Total** | **~8-9GB** | **~7-8GB** | **Current exceeds capacity** |

**Conclusion**: Current configuration may cause OOM. Recommended changes bring usage within 8GB limit.

---

## Testing Recommendations

1. **Monitor GPU memory usage:**
   ```bash
   docker exec vision-service-dev tegrastats
   # Or
   nvidia-smi
   ```

2. **Monitor container memory:**
   ```bash
   docker stats vision-service-dev
   ```

3. **Test with INT8 model:**
   - Export INT8 engine: `./scripts/ros2/export_yolo11_to_tensorrt.sh yolo11n 640 int8`
   - Update model path in docker-compose
   - Verify performance and memory usage

4. **Verify no OOM:**
   - Run vision pipeline for extended period
   - Check system logs for OOM kills
   - Monitor memory usage trends

---

## Summary

### What's Working Well:
- ✅ Using jetson-containers base image (NVIDIA official)
- ✅ Proper GPU access configuration
- ✅ Pipelined inference implementation
- ✅ TensorRT 10.x API compatibility

### What Needs Fixing:
- ⚠️ Memory limits too high for 8GB system
- ⚠️ Model precision mismatch (code says INT8, engine is FP16)
- ⚠️ TensorRT workspace too large (4GB → should be 2GB)
- ❌ Missing GPU memory fraction controls

### Priority Actions:
1. **High**: Reduce Docker memory limits (4G → 3G)
2. **High**: Build and use INT8 model (better performance on 8GB)
3. **Medium**: Reduce TensorRT workspace (4GB → 2GB)
4. **Medium**: Add GPU memory monitoring/controls

---

## References

- NVIDIA Jetson Orin Nano Developer Guide
- jetson-containers documentation: https://github.com/dusty-nv/jetson-containers
- TensorRT Best Practices Guide
- YOLO11 Ultralytics Documentation
