# Phase 1: Native ROS 2 Humble Setup Guide

## Overview

This guide covers the complete setup of ROS 2 Humble natively on Jetson Orin Nano (Ubuntu 22.04). This replaces the previous Docker-based setup with a native installation for better performance and simpler development.

## Prerequisites

- Jetson Orin Nano 8GB (or compatible Jetson device)
- Ubuntu 22.04 (comes with JetPack 6.x)
- JetPack 6.x installed (includes TensorRT, CUDA)
- Internet connection for package downloads

## Why Native Installation?

1. **ROS 2 Humble is LTS** and fully compatible with Ubuntu 22.04
2. **No Docker overhead** - Better performance (no container CPU/GPU overhead)
3. **Direct hardware access** - No container permission issues
4. **Simpler workflow** - Edit files directly, no container management
5. **Better debugging** - Direct access to system tools

## Installation Steps

### Step 1: Install ROS 2 Humble

Run the installation script:

```bash
cd /home/zip/Zip/zip
sudo ./scripts/ros2/install_ros2_humble_native.sh
```

This script will:
- Set up ROS 2 repository and GPG keys
- Install ROS 2 Humble Desktop
- Install colcon, rosdep, vcstool
- Install required packages (v4l2-camera, camera-info-manager, vision-msgs, cv-bridge, rosbridge-suite)
- Install Python dependencies (pyserial, numpy, opencv-python-headless)
- Initialize rosdep

**Time**: 10-20 minutes depending on internet speed

### Step 2: Set Up Workspace

Create the ROS 2 workspace:

```bash
./scripts/ros2/setup_workspace.sh
```

This creates:
- `~/zip_ros2_ws/` - Workspace directory
- `~/zip_ros2_ws/src/` - Source packages directory
- Symlink to project root (for easy access)

### Step 3: Deploy Packages

Copy packages from `ros2_packages/` to workspace:

```bash
./scripts/ros2/deploy_packages.sh
```

This deploys:
- `zip_core` - Core messages and services
- `zip_control` - Serial bridge
- `zip_vision` - Vision stack
- `zip_orchestration` - LLM orchestration
- `zip_voice` - Voice system
- `zip_bridge` - Tool bridge

### Step 4: Complete Setup

Install dependencies and build workspace:

```bash
./scripts/ros2/continue_setup.sh
```

This script:
- Installs package dependencies via rosdep
- Builds the workspace with colcon
- Verifies installation

**Time**: 5-15 minutes depending on packages

### Alternative: Master Setup Script

For a complete automated setup:

```bash
./scripts/ros2/setup_humble_native.sh
```

This runs all steps above automatically.

## Verification

### Quick Verification

```bash
./scripts/ros2/quick_start_verification.sh
```

### Manual Verification

```bash
# Source ROS 2
source /opt/ros/humble/setup.bash
source ~/zip_ros2_ws/install/setup.bash

# Check packages
ros2 pkg list | grep zip

# Check custom messages
ros2 interface show zip_core/msg/BatteryStatus

# Check executables
ros2 pkg executables zip_control
```

Expected output:
- 5-6 zip packages listed
- Custom messages accessible
- Executables available

## Using ROS 2

### Environment Setup

Use the helper script:
```bash
source scripts/ros2/source_ros2.sh
```

Or manually:
```bash
source /opt/ros/humble/setup.bash
source ~/zip_ros2_ws/install/setup.bash
```

### Running Nodes

```bash
# List available nodes
ros2 pkg executables <package_name>

# Run a node
ros2 run <package_name> <node_name>

# Example: Serial bridge
ros2 run zip_control serial_bridge_node
```

### Building Packages

```bash
cd ~/zip_ros2_ws
source /opt/ros/humble/setup.bash
colcon build --packages-select <package_name>
source install/setup.bash
```

## Workspace Structure

```
~/zip_ros2_ws/
├── src/              # Source packages
│   ├── zip_core/
│   ├── zip_control/
│   ├── zip_vision/
│   ├── zip_orchestration/
│   ├── zip_voice/
│   └── zip_bridge/
├── build/            # Build artifacts
├── install/           # Installed packages
└── log/              # Build logs
```

## Troubleshooting

### Build Errors

If a package fails to build:
```bash
cd ~/zip_ros2_ws
colcon build --cmake-clean-cache --packages-select <package_name>
```

### Missing Dependencies

Install missing dependencies:
```bash
cd ~/zip_ros2_ws
rosdep install --from-paths src --ignore-src -r -y
```

### Workspace Not Found

If ROS 2 can't find packages:
```bash
source ~/zip_ros2_ws/install/setup.bash
```

### TensorRT Issues (zip_vision)

If `zip_vision` fails to build due to TensorRT:
- TensorRT should be included with JetPack 6.x
- Check installation: `dpkg -l | grep tensorrt`
- The `FindTensorRT.cmake` module should auto-detect it
- See Phase 3 documentation for TensorRT setup

## Next Steps

After Phase 1 is complete:
- **Phase 2**: Test serial bridge communication ✅
- **Phase 3**: Set up vision stack (camera, YOLO11, VLM)
- **Phase 4**: Set up LLM orchestration
- **Phase 5**: Set up voice system

## Migration from Docker

If you were using the Docker setup:
- Docker scripts are in `scripts/ros2/deprecated/`
- Workspace is now at `~/zip_ros2_ws/` (not in container)
- All paths are native (no `/ros2_ws` container paths)
- See `scripts/ros2/deprecated/README.md` for details

## Resources

- [ROS 2 Humble Documentation](https://docs.ros.org/en/humble/)
- [ROS 2 Installation Guide](https://docs.ros.org/en/humble/Installation.html)
- [Jetson Orin Nano Documentation](https://developer.nvidia.com/embedded/jetson-orin-nano)
