# Phase 3: Native Vision Setup

## Overview

Phase 3 requires TensorRT-LLM for the VLM (Vision Language Model) node. This guide covers native installation of TensorRT-LLM on Jetson Orin Nano without Docker.

**Note**: Compiling TensorRT-LLM from source requires >32GB RAM/Swap and will cause OOM (Out of Memory) errors on Jetson Orin Nano 8GB. Use pre-built wheels instead.

## Prerequisites

- Jetson Orin Nano 8GB (or compatible Jetson device)
- JetPack 6.x installed (includes TensorRT)
- ROS 2 Humble workspace set up (from Phase 1)
- Native ROS 2 Humble installation (not Docker)

## TensorRT Installation

TensorRT is included with JetPack 6.x. Verify installation:

```bash
dpkg -l | grep tensorrt
```

You should see packages like:
- `tensorrt` (meta package)
- `libnvinfer-dev` (development libraries)
- `libnvinfer10` (runtime libraries)

## TensorRT-LLM Installation

### Option 1: NVIDIA PyPI (Recommended if available)

```bash
pip3 install --user tensorrt-llm --extra-index-url https://pypi.nvidia.com
```

### Option 2: jetson-containers Wheels

If jetson-containers is available, you can extract pre-built wheels:

```bash
# Install jetson-containers (if not already)
cd ~
git clone https://github.com/dusty-nv/jetson-containers
cd jetson-containers
bash install.sh

# Build a temporary container to extract wheels
jetson-containers build --name temp_trtllm tensorrt_llm

# Extract wheels from container (manual process)
# See jetson-containers documentation for details
```

### Option 3: Manual Installation

Follow TensorRT-LLM installation guide for Jetson:
- [TensorRT-LLM Documentation](https://nvidia.github.io/TensorRT-LLM/)

## Automated Setup

Use the provided script:

```bash
cd /home/zip/Zip/zip
./scripts/ros2/setup_vision_native.sh
```

This script:
1. Verifies ROS 2 Humble installation
2. Installs vision_msgs package
3. Attempts TensorRT-LLM installation via pip
4. Verifies TensorRT installation
5. Checks workspace setup

## Building zip_vision Package

After TensorRT-LLM is installed:

```bash
cd ~/zip_ros2_ws
source /opt/ros/humble/setup.bash
colcon build --packages-select zip_vision
source install/setup.bash
```

**Note**: The `zip_vision` package includes a custom `FindTensorRT.cmake` module in `cmake/FindTensorRT.cmake` that automatically detects TensorRT on Jetson.

## TensorRT Configuration

The `FindTensorRT.cmake` module looks for TensorRT in:
- `/usr/include/aarch64-linux-gnu/` (headers)
- `/usr/lib/aarch64-linux-gnu/` (libraries)

These are standard locations for JetPack installations.

## Verification

### Verify TensorRT

```bash
# Check TensorRT packages
dpkg -l | grep tensorrt

# Check TensorRT headers
ls /usr/include/aarch64-linux-gnu/NvInfer*.h

# Check TensorRT libraries
ls /usr/lib/aarch64-linux-gnu/libnvinfer*.so*
```

### Verify TensorRT-LLM

```bash
python3 -c "import tensorrt_llm; print('TensorRT-LLM OK')"
```

### Verify zip_vision Build

```bash
cd ~/zip_ros2_ws
source /opt/ros/humble/setup.bash
source install/setup.bash
ros2 pkg executables zip_vision
```

Expected executables:
- `yolo11_node`
- `vlm_node`

## Troubleshooting

### TensorRT Not Found by CMake

If CMake can't find TensorRT:
1. Verify TensorRT is installed: `dpkg -l | grep tensorrt`
2. Check that `FindTensorRT.cmake` exists in `zip_vision/cmake/`
3. Verify CMakeLists.txt includes the cmake directory in MODULE_PATH
4. Check build output for specific error messages

### TensorRT-LLM Import Fails

If `import tensorrt_llm` fails:
1. Verify installation: `pip3 list | grep tensorrt-llm`
2. Check Python path: `python3 -c "import sys; print(sys.path)"`
3. Try installing with `--user` flag: `pip3 install --user tensorrt-llm`
4. Check for missing dependencies

### Build Errors in zip_vision

If `zip_vision` fails to build:
1. Check TensorRT version compatibility (code may need TensorRT 10.x API updates)
2. Verify all dependencies: `rosdep install --from-paths src --ignore-src -r -y`
3. Check build logs: `cat ~/zip_ros2_ws/log/latest_build/zip_vision/stderr.log`

## Next Steps

After vision setup is complete:
1. Export YOLO11 model to TensorRT (see Phase 3.2)
2. Download and convert VLM model (see Phase 3.3)
3. Test camera node: `ros2 launch zip_vision camera.launch.py`
4. Test YOLO11 node: `ros2 launch zip_vision yolo11.launch.py`
5. Test full pipeline: `ros2 launch zip_vision vision_pipeline.launch.py`

## References

- [TensorRT Documentation](https://docs.nvidia.com/deeplearning/tensorrt/)
- [TensorRT-LLM Documentation](https://nvidia.github.io/TensorRT-LLM/)
- [jetson-containers GitHub](https://github.com/dusty-nv/jetson-containers)
- [ROS 2 Humble Documentation](https://docs.ros.org/en/humble/)
