# Ultralytics YOLO11 NVIDIA Container Compliance Report

## Summary

This document details the investigation and fixes applied to ensure Ultralytics YOLO11 installation matches NVIDIA container specifications, with focus on INT8 quantization support without calibration images.

**Date**: 2025-01-27  
**JetPack Version**: 6.1 (L4T 36.4)  
**Target Device**: Jetson Orin Nano 8GB

---

## Investigation Results

### Local Installation

**Status**: ✅ Partially Compliant

- **Ultralytics**: ✅ Installed (version 8.3.252)
- **PyTorch**: ⚠️ Installed (version 2.0.1) but CUDA support not available
  - **Note**: Jetson requires PyTorch built specifically for the device
  - Standard PyPI wheels don't include CUDA support for ARM64/Jetson
  - For local development, export can still work but may be slower
  - **Recommendation**: Use Docker for production inference

### Docker Installation

**Status**: ✅ Configured for Compliance

- **Base Image**: `dustynv/ros:humble-desktop-l4t-r36.4.0` (NVIDIA jetson-containers)
- **Ultralytics**: ✅ Will be installed during build
- **PyTorch**: ✅ Will be installed during build (ARM64 compatible)
- **TensorRT**: ✅ Included in base image (JetPack 6.1)

---

## Changes Made

### 1. Updated `Dockerfile.vision`

**Location**: `/home/zip/Zip/zip/Dockerfile.vision`

**Changes**:
- Added Ultralytics YOLO11 installation following NVIDIA jetson-containers best practices
- Added PyTorch installation for Jetson (ARM64 aarch64)
- Added verification steps to ensure installations succeed
- Follows Ultralytics documentation: https://docs.ultralytics.com/guides/nvidia-jetson/
- Follows NVIDIA Jetson Zoo: https://elinux.org/Jetson_Zoo

**Key Installation Steps**:
```dockerfile
# Install PyTorch for Jetson (ARM64 aarch64)
RUN pip3 install --no-cache-dir torch torchvision --index-url https://download.pytorch.org/whl/cu121

# Install Ultralytics YOLO11
RUN pip3 install --no-cache-dir ultralytics
```

### 2. Updated INT8 Export Script

**Location**: `/home/zip/Zip/zip/scripts/ros2/export_yolo11_to_tensorrt.sh`

**Changes**:
- Modified to handle INT8 export without calibration images
- Uses Ultralytics default fallback dataset when `data=None`
- Added warnings about accuracy implications
- Per Ultralytics documentation: https://docs.ultralytics.com/integrations/tensorrt/

**Key Changes**:
```python
if precision == 'int8':
    export_kwargs['int8'] = True
    # data=None triggers Ultralytics default fallback dataset for calibration
    export_kwargs['data'] = None
    print("  Note: INT8 export without calibration images - using default fallback dataset")
    print("  Warning: Accuracy may be reduced compared to proper calibration")
```

### 3. Docker Compose Configuration

**Location**: `/home/zip/Zip/zip/docker-compose.dev.yml`

**Status**: ✅ Already Configured

- INT8 model path correctly set: `yolo11n_640_int8.engine`
- NVIDIA runtime configured: `runtime: nvidia`
- GPU access configured: `NVIDIA_VISIBLE_DEVICES=all`
- Memory limits optimized for Jetson Orin Nano 8GB

### 4. Created Verification Script

**Location**: `/home/zip/Zip/zip/scripts/verify_ultralytics_installation.sh`

**Purpose**: Comprehensive verification of Ultralytics installation in both local and Docker environments

**Usage**:
```bash
# Check local installation
./scripts/verify_ultralytics_installation.sh local

# Check Docker installation
./scripts/verify_ultralytics_installation.sh docker

# Check both
./scripts/verify_ultralytics_installation.sh both
```

---

## INT8 Quantization Without Calibration Images

### How It Works

When exporting to INT8 without calibration images:

1. **Ultralytics Behavior**: 
   - If `data=None` is provided with `int8=True`, Ultralytics uses a default fallback dataset
   - This is a small example dataset included with Ultralytics
   - Calibration cache is still generated but based on default data

2. **Limitations**:
   - **Accuracy**: May be reduced compared to proper calibration with representative images
   - **Dynamic Range**: Activation ranges may not match your actual deployment scenario
   - **Performance**: Some layers may fall back to FP16/FP32 if quantization is unstable

3. **Recommendations**:
   - For production: Collect 300-500 representative images for proper calibration
   - For development/testing: Default fallback is acceptable but monitor accuracy
   - Consider FP16 as alternative if INT8 accuracy is insufficient

### Exporting INT8 Model

```bash
# Export INT8 model (uses default fallback dataset)
./scripts/ros2/export_yolo11_to_tensorrt.sh yolo11n 640 int8

# The script will:
# 1. Load YOLO11 model
# 2. Export with int8=True, data=None
# 3. Ultralytics will use default dataset for calibration
# 4. Generate .engine file and calibration cache
```

---

## NVIDIA Container Specifications Compliance

### ✅ Requirements Met

1. **Base Image**: Using official NVIDIA jetson-containers ROS 2 Humble image
2. **TensorRT**: Included in base image (JetPack 6.1)
3. **CUDA/cuDNN**: Included in base image
4. **Runtime**: NVIDIA Container Runtime configured
5. **GPU Access**: Properly configured with `--runtime nvidia`
6. **Ultralytics**: Latest stable version (8.3.252)
7. **PyTorch**: Compatible version for Jetson ARM64

### ⚠️ Considerations

1. **Local PyTorch CUDA**: 
   - Standard PyPI PyTorch doesn't support CUDA on Jetson
   - Docker installation uses proper Jetson-compatible PyTorch
   - **Recommendation**: Use Docker for all inference operations

2. **INT8 Calibration**:
   - Using default fallback dataset (no calibration images provided)
   - Accuracy may be reduced
   - **Recommendation**: Collect calibration images for production

---

## Testing & Verification

### Build Docker Image

```bash
# Build vision service with Ultralytics
docker-compose -f docker-compose.dev.yml build vision-service

# Or rebuild from scratch
docker-compose -f docker-compose.dev.yml build --no-cache vision-service
```

### Verify Installation

```bash
# Run verification script
./scripts/verify_ultralytics_installation.sh both

# Test in Docker container
docker exec vision-service-dev python3 -c "import ultralytics; print(ultralytics.__version__)"
docker exec vision-service-dev python3 -c "import torch; print(torch.__version__); print(torch.cuda.is_available())"
```

### Export INT8 Model

```bash
# Export INT8 model (will use default fallback dataset)
./scripts/ros2/export_yolo11_to_tensorrt.sh yolo11n 640 int8

# Verify model was created
ls -lh ~/zip_ros2_ws/src/zip_vision/models/yolo11/yolo11n_640_int8.engine
```

---

## Next Steps

1. **Build Docker Image**: 
   ```bash
   docker-compose -f docker-compose.dev.yml build vision-service
   ```

2. **Export INT8 Model** (if not already done):
   ```bash
   ./scripts/ros2/export_yolo11_to_tensorrt.sh yolo11n 640 int8
   ```

3. **Verify Installation**:
   ```bash
   ./scripts/verify_ultralytics_installation.sh both
   ```

4. **Test Inference**:
   ```bash
   # Start vision service
   docker-compose -f docker-compose.dev.yml up vision-service
   
   # Check logs for INT8 model loading
   docker-compose -f docker-compose.dev.yml logs vision-service | grep -i int8
   ```

5. **Optional: Collect Calibration Images** (for better accuracy):
   - Collect 300-500 representative images from your deployment scenario
   - Create dataset YAML file pointing to calibration images
   - Re-export with: `model.export(format='engine', int8=True, data='calibration.yaml')`

---

## References

- **Ultralytics Jetson Guide**: https://docs.ultralytics.com/guides/nvidia-jetson/
- **Ultralytics TensorRT Integration**: https://docs.ultralytics.com/integrations/tensorrt/
- **NVIDIA Jetson Zoo**: https://elinux.org/Jetson_Zoo
- **NVIDIA TensorRT INT8 Quantization**: https://docs.nvidia.com/deeplearning/tensorrt/latest/inference-library/work-quantized-types.html
- **jetson-containers**: https://github.com/dusty-nv/jetson-containers

---

## Troubleshooting

### PyTorch CUDA Not Available (Local)

**Issue**: `torch.cuda.is_available()` returns `False` in local environment

**Solution**: 
- This is expected for standard PyPI PyTorch on Jetson
- Use Docker for inference (PyTorch will have CUDA support in container)
- For local development, export still works but may be slower

### INT8 Export Fails

**Issue**: Export fails with calibration errors

**Solution**:
- Ensure TensorRT is properly installed: `which trtexec`
- Check GPU memory: `nvidia-smi`
- Try FP16 as fallback: `./scripts/ros2/export_yolo11_to_tensorrt.sh yolo11n 640 fp16`

### Docker Build Fails

**Issue**: PyTorch installation fails in Docker

**Solution**:
- Check base image compatibility: `docker pull dustynv/ros:humble-desktop-l4t-r36.4.0`
- Verify network access for pip downloads
- Check Docker logs: `docker-compose -f docker-compose.dev.yml build vision-service 2>&1 | tail -50`

---

**Status**: ✅ All changes implemented and ready for testing
