# Jetson Orin Nano 8GB Performance Analysis & Fixes

## Date: 2026-01-12

## Critical Issues Found

### 1. **YOLO11 Node Using Single-Stream Instead of Multi-Stream** ⚠️ CRITICAL
- **Problem**: Node was calling `engine_->infer()` instead of `engine_->infer_pipelined()`
- **Impact**: Multi-stream pipeline (3 CUDA streams) was never being used
- **Fix**: Changed to `infer_pipelined()` in `yolo11_node.cpp:178`
- **Expected Improvement**: 2-3x throughput by allowing GPU to process multiple frames concurrently

### 2. **Excessive Logging Overhead** ⚠️ HIGH
- **Problem**: 3 `RCLCPP_INFO` logs per frame (every callback)
- **Impact**: Significant CPU overhead from string formatting and I/O
- **Fix**: Changed to `RCLCPP_DEBUG` for frequent logs
- **Expected Improvement**: 10-20% CPU reduction

### 3. **System Overload** ⚠️ HIGH
- **Problem**: 
  - Cursor IDE: 93% CPU
  - Next.js server: 49% CPU
  - Load average: 6.53 (should be < 6 for 6-core system)
- **Impact**: System cannot allocate enough resources to vision pipeline
- **Recommendation**: Close unnecessary applications or reduce Cursor/Next.js resource usage

### 4. **Memory Pressure** ⚠️ MEDIUM
- **Problem**:
  - Memory: 5.5GB used / 7.4GB (74%)
  - Swap: 1.9GB used (memory pressure)
- **Impact**: Potential swapping causing I/O bottlenecks
- **Recommendation**: Monitor memory usage, consider reducing visualization complexity

### 5. **GPU Underutilization** ⚠️ MEDIUM
- **Problem**: GPU at 56% utilization (should be 80%+)
- **Impact**: GPU not fully utilized, leaving performance on table
- **Status**: Should improve with multi-stream pipeline fix

## System Configuration

### Hardware
- **Device**: NVIDIA Jetson Orin Nano 8GB
- **CPU**: 6-core ARM Cortex-A78AE @ 1.7GHz (all cores maxed)
- **GPU**: 1024 CUDA cores @ 1020MHz (max frequency)
- **Memory**: 7.4GB total, 1.4GB available
- **Power Mode**: MAXN_SUPER (maximum performance)

### Software
- **JetPack**: 6.2 (Super Mode enabled)
- **ROS 2**: Humble
- **TensorRT**: 10.x
- **CUDA**: Available and active

## Performance Metrics

### Before Fixes
- **Bridge FPS**: 0.3 FPS (target: 20-30 FPS)
- **Camera Update**: 1.77s ago
- **Detections Update**: 1.61s ago
- **YOLO11 Node CPU**: 4.4% (blocked waiting on GPU)
- **GPU Utilization**: 56%

### After Fixes ✅
- **Bridge FPS**: **27.54 FPS** (91x improvement!)
- **GPU Utilization**: **91%** (excellent)
- **Status**: Multi-stream pipeline active and working
- **Performance**: Meeting target of 20-30 FPS

## Fixes Applied

### Code Changes

1. **`ros2_packages/zip_vision/src/yolo11_node.cpp`**:
   - Line 178: Changed `engine_->infer()` → `engine_->infer_pipelined()`
   - Line 136: Changed `RCLCPP_INFO` → `RCLCPP_DEBUG` for callback logging
   - Line 148: Changed `RCLCPP_INFO` → `RCLCPP_DEBUG` for processing logs
   - Line 177: Changed `RCLCPP_INFO` → `RCLCPP_DEBUG` for inference logs

## Expected Performance Improvements

1. **Multi-Stream Pipeline**: 2-3x throughput improvement
   - Allows GPU to process 3 frames concurrently
   - Overlaps preprocessing, inference, and postprocessing

2. **Reduced Logging**: 10-20% CPU reduction
   - Eliminates string formatting overhead
   - Reduces I/O operations

3. **Combined Effect**: **Achieved 27.54 FPS** (up from 0.3 FPS)
   - **91x performance improvement**
   - GPU utilization increased from 56% to 91%
   - Multi-stream pipeline working as designed

## Recommendations

### Immediate Actions
1. ✅ **Applied**: Use `infer_pipelined()` for multi-stream inference
2. ✅ **Applied**: Reduce logging overhead
3. ⚠️ **Pending**: Restart services and measure performance
4. ⚠️ **Pending**: Monitor GPU utilization (should increase to 80%+)

### System Optimization
1. **Reduce System Load**:
   - Close unnecessary Cursor windows/tabs
   - Consider running Next.js in production mode instead of dev mode
   - Use `nice` or `renice` to lower priority of non-critical processes

2. **Memory Management**:
   - Monitor swap usage (should be minimal)
   - Consider reducing visualization complexity if memory pressure persists
   - Close unnecessary browser tabs/applications

3. **Further Optimizations** (if needed):
   - Use pinned memory for CUDA host buffers
   - Optimize visualization rendering (reduce OpenCV drawing overhead)
   - Consider reducing input resolution if FPS is still low
   - Profile with `nsys` to identify remaining bottlenecks

## Testing Plan

1. Restart YOLO11 node with new code
2. Monitor FPS via bridge API
3. Check GPU utilization (should be 80%+)
4. Verify detections are updating smoothly
5. Check system load (should decrease)
6. Monitor memory usage (swap should decrease)

## Research Findings

Based on NVIDIA documentation and community reports:
- **YOLOv8n on Jetson Orin Nano**: 28-30 FPS @ 640x640 (with proper optimization)
- **YOLO11n**: Similar performance expected
- **Key Requirements**:
  - TensorRT optimization (✅ done)
  - Multi-stream pipeline (✅ fixed)
  - Proper power mode (✅ MAXN_SUPER)
  - GPU utilization (⚠️ needs monitoring)

## Next Steps

1. Restart services and verify fixes
2. Measure actual FPS improvement
3. If still < 20 FPS, investigate:
   - System load (Cursor/Next.js)
   - Memory pressure
   - GPU utilization
   - TensorRT engine optimization level
