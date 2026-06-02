# Phase 1: ROS 2 Jazzy Docker Setup

This document describes the Docker-based setup for ROS 2 Jazzy on Jetson Orin Nano Super, following NVIDIA best practices and using `dusty-nv/jetson-containers`.

## Overview

Phase 1 establishes the ROS 2 Jazzy workspace, package structure, and custom message types using Docker containers optimized for Jetson hardware. This approach provides:
- **ROS 2 Jazzy** (requires Ubuntu 24.04) on Ubuntu 22.04 host
- **Near-native performance** with NVIDIA Container Toolkit
- **GPU acceleration** for TensorRT, YOLO, and AI workloads
- **Isolated environment** that doesn't affect host system

## Prerequisites

- **Hardware**: NVIDIA Jetson Orin Nano Super 8GB
- **OS**: Ubuntu 22.04 (JetPack 6.x)
- **Docker**: Docker Engine with NVIDIA Container Toolkit
- **ROS 2**: Jazzy Jalisco (in Docker container)

## Installation Steps

### 1. Install NVIDIA Container Toolkit

Ensure NVIDIA Container Toolkit is installed for GPU access:

```bash
# Check if installed
nvidia-container-runtime --version

# If not installed:
sudo apt-get update
sudo apt-get install -y nvidia-container-toolkit
sudo systemctl restart docker
```

### 2. Pull ROS 2 Jazzy Docker Image

The setup uses the official `dusty-nv/jetson-containers` image optimized for Jetson:

```bash
# Pull the image (this may take a while, ~2-3GB)
docker pull dustynv/ros:jazzy-desktop-r36.4.0-cu128-24.04
```

Or use the helper script which will pull automatically:

```bash
cd /home/zip/Zip/zip
./scripts/ros2/docker_jazzy_jetson.sh
```

### 3. Start ROS 2 Jazzy Container

**Option A: Using docker-compose (Recommended)**

```bash
cd /home/zip/Zip/zip
docker-compose -f docker-compose.ros2.jazzy.yml up -d
docker exec -it ros2-jazzy bash
```

**Option B: Using helper script**

```bash
cd /home/zip/Zip/zip
./scripts/ros2/docker_jazzy_jetson.sh
```

### 4. Set Up Workspace in Container

Once inside the container, or using the setup script:

```bash
# From host
cd /home/zip/Zip/zip
./scripts/ros2/setup_jazzy_docker.sh
```

This will:
- Deploy packages to `~/zip_ros2_ws/src/`
- Install dependencies via rosdep
- Build the workspace
- Verify installation

### 5. Verify Installation

**Option A: Quick verification script** (from host):
```bash
cd /home/zip/Zip/zip
./scripts/ros2/quick_start_verification.sh
```

**Option B: Manual verification** (inside container):
```bash
# Enter container
sudo docker exec -it ros2-jazzy bash

# Source ROS 2
source /opt/ros/jazzy/install/setup.bash
source /ros2_ws/install/setup.bash

# Check packages
ros2 pkg list | grep zip

# Check custom messages
ros2 interface show zip_core/msg/BatteryStatus
ros2 interface show zip_core/msg/RobotSensors
ros2 interface show zip_core/srv/EmergencyStop
```

## Docker Configuration Details

### Container Specifications

- **Base Image**: `dustynv/ros:jazzy-desktop-r36.4.0-cu128-24.04`
- **Runtime**: `nvidia` (for GPU access)
- **Network**: `host` (for ROS 2 DDS communication)
- **IPC**: `host` (for shared memory performance)
- **Shared Memory**: 1GB (for image/data transport)
- **GPU**: All GPUs accessible with full capabilities
- **CPU**: 6 cores (Jetson Orin Nano Super)
- **Memory**: 6GB limit (leaves 2GB for host)

### Volume Mounts

- `~/zip_ros2_ws` → `/ros2_ws` - ROS 2 workspace
- `./ros2_packages` → `/ros2_ws/src` - Source packages
- `./` → `/zip_project` - Project root access
- `/tmp/argus_socket` → Camera access
- `/dev` → Device access for serial communication

### Environment Variables

- `NVIDIA_VISIBLE_DEVICES=all` - GPU visibility
- `NVIDIA_DRIVER_CAPABILITIES=all` - Full GPU capabilities
- `ROS_DOMAIN_ID=0` - ROS 2 domain (configurable)
- `RMW_IMPLEMENTATION=rmw_fastrtps_cpp` - DDS implementation

## Performance Optimizations

Following NVIDIA best practices for minimal overhead:

1. **GPU Access**: `--runtime nvidia` and `--gpus all` for direct GPU access
2. **Network**: `--network host` eliminates NAT overhead for ROS 2 DDS
3. **IPC**: `--ipc host` for shared memory performance
4. **Shared Memory**: `--shm-size=1g` for image/data transport
5. **Optimized Image**: `dusty-nv/jetson-containers` images are L4T-optimized

Expected performance:
- **CPU overhead**: 1-5%
- **GPU overhead**: 0-3% (near-native)
- **ROS 2 latency**: <1-2ms additional
- **Memory overhead**: ~100-500MB per container

## Package Structure

```
~/zip_ros2_ws/src/
├── zip_core/              # Core robot state, safety, custom messages
│   ├── msg/
│   │   ├── RobotDiagnostics.msg
│   │   ├── RobotSensors.msg
│   │   ├── BatteryStatus.msg
│   │   └── VoiceState.msg
│   ├── srv/
│   │   └── EmergencyStop.srv
│   └── src/               # Safety node (Phase 7)
├── zip_control/           # Motion control, Arduino serial bridge
├── zip_vision/            # YOLO11, VLM
├── zip_orchestration/     # MLC-LLM integration
├── zip_voice/             # STT/TTS
└── zip_bridge/            # rosbridge wrapper
```

## Custom Messages

Defined in `zip_core`:
- `RobotDiagnostics.msg` - Comprehensive robot state
- `RobotSensors.msg` - Aggregated sensor readings
- `BatteryStatus.msg` - Battery monitoring
- `VoiceState.msg` - Voice loop state machine

## Services

- `EmergencyStop.srv` - Emergency stop service

## Daily Usage

### Starting the Container

```bash
# Using docker-compose
docker-compose -f docker-compose.ros2.jazzy.yml up -d

# Or using helper script
./scripts/ros2/docker_jazzy_jetson.sh
```

### Entering the Container

```bash
docker exec -it ros2-jazzy bash
```

### Building Packages

Inside container:

```bash
source /opt/ros/jazzy/install/setup.bash
cd /ros2_ws
colcon build
source install/setup.bash
```

### Running Nodes

Inside container:

```bash
source /opt/ros/jazzy/install/setup.bash
source /ros2_ws/install/setup.bash
ros2 run <package> <node>
```

## Troubleshooting

### Container won't start

```bash
# Check Docker is running
sudo systemctl status docker

# Check NVIDIA Container Toolkit
nvidia-container-runtime --version

# Check image exists
docker images | grep jazzy
```

### GPU not accessible

```bash
# Verify NVIDIA runtime
docker info | grep nvidia

# Test GPU in container
docker exec ros2-jazzy nvidia-smi
```

### ROS 2 nodes can't communicate

- Ensure `--network host` is used
- Check `ROS_DOMAIN_ID` matches
- Verify firewall isn't blocking

### Performance issues

- Monitor with `jtop` or `tegrastats`
- Check GPU usage: `docker exec ros2-jazzy nvidia-smi`
- Verify shared memory: `df -h /dev/shm`

## Next Steps

- **Phase 2**: Arduino communication layer (serial bridge / micro-ROS)
- **Phase 3**: Vision stack (camera, YOLO11, VLM)
- **Phase 4**: Local LLM orchestration
- **Phase 5**: Voice system (STT/TTS)
- **Phase 6**: HUD integration via rosbridge
- **Phase 7**: Safety layers and performance tuning
- **Phase 8**: Testing and migration

## References

- [ROS 2 Jazzy Documentation](https://docs.ros.org/en/jazzy/)
- [dusty-nv/jetson-containers](https://github.com/dusty-nv/jetson-containers)
- [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/)
- [Jetson Orin Nano Super](https://www.nvidia.com/en-us/autonomous-machines/embedded-systems/jetson-orin/nano-super-developer-kit/)
