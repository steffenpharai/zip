# Phase 3 Container Build - cudastack:standard

## Build Configuration

**Container Name:** `zip_vision_stack`  
**Base Image:** `ros:jazzy-desktop`  
**CUDA Stack:** `cudastack:standard` (includes gdrcopy for Jetson)  
**AI Framework:** `tensorrt_llm`

## What's Included

### cudastack:standard provides:
- ✅ cuDNN (Deep Neural Network library)
- ✅ NCCL (Multi-GPU communication)
- ✅ TensorRT (Inference optimization)
- ✅ **gdrcopy** (GPU Direct RDMA - automatically included for Jetson/Tegra)
- ✅ Other CUDA libraries (cuDSS, cuSPARSELt, cuTENSOR, NVSHMEM)

### tensorrt_llm provides:
- ✅ Pre-built TensorRT-LLM wheels (no compilation needed)
- ✅ Optimized for Jetson Orin Nano 8GB
- ✅ Ready for VLM inference

## Build Command

```bash
jetson-containers build --name zip_vision_stack \
  ros:jazzy-desktop \
  cudastack:standard \
  tensorrt_llm
```

## Why cudastack:standard?

1. **Consolidated Installation**: All CUDA libraries in one Docker layer (avoids layer limits)
2. **Jetson Optimized**: gdrcopy automatically included for Tegra devices
3. **Best Practice**: Recommended approach per NVIDIA Jetson documentation
4. **Dependency Resolution**: Satisfies tensorrt_llm's gdrcopy requirement

## gdrcopy Package

The `gdrcopy` package was created from the deprecated location:
- Source: `~/jetson-containers/deprecated/cuda/gdrcopy`
- Destination: `~/jetson-containers/packages/cuda/gdrcopy`
- Version: 2.5.1 (configured for Jetson)

## Build Status

Monitor the build with:
```bash
tail -f /tmp/container_build_retry.log
```

## After Build Completion

1. **Verify Container:**
   ```bash
   jetson-containers run zip_vision_stack
   ```

2. **Test TensorRT-LLM:**
   ```bash
   python3 -c "import tensorrt_llm; print('TensorRT-LLM OK')"
   ```

3. **Test ROS 2:**
   ```bash
   ros2 pkg list | grep vision_msgs
   ```

4. **Build zip_vision Package:**
   ```bash
   cd /ros2_ws
   colcon build --packages-select zip_vision
   ```

## Build Time

Estimated: **15-45 minutes** depending on:
- Download speed for base images
- Network bandwidth
- System resources

## Troubleshooting

If build fails:
1. Check log: `cat /tmp/container_build_retry.log`
2. Verify gdrcopy package exists: `ls ~/jetson-containers/packages/cuda/gdrcopy`
3. Check jetson-containers version: `jetson-containers --version`
4. Ensure sufficient disk space: `df -h`
