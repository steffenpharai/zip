# Phase 1: ROS 2 Foundation Setup

**Note**: This project now uses **ROS 2 Jazzy in Docker** for Jetson compatibility. See [PHASE1_SETUP_JAZZY_DOCKER.md](PHASE1_SETUP_JAZZY_DOCKER.md) for the current setup instructions.

This document describes the legacy native setup (for reference only).

## Overview

Phase 1 establishes the ROS 2 workspace, package structure, and custom message types that form the foundation for the entire migration.

## Prerequisites

- **Hardware**: NVIDIA Jetson Orin Nano Super 8GB
- **OS**: Ubuntu 22.04 (JetPack 6.x)
- **ROS 2**: Jazzy Jalisco (via Docker) or Humble (native)

## Installation Steps

### Current Setup: ROS 2 Jazzy in Docker

**See [PHASE1_SETUP_JAZZY_DOCKER.md](PHASE1_SETUP_JAZZY_DOCKER.md) for Docker-based setup.**

### Legacy: Native ROS 2 Humble (for reference)

For native installation on Ubuntu 22.04, ROS 2 Humble was used:

```bash
cd /home/zip/Zip/zip
./scripts/ros2/install_ros2_complete.sh
```

This script would:
- Install ROS 2 Humble desktop (LTS for Ubuntu 22.04)
- Install colcon build system
- Install required ROS 2 packages (cv_bridge, image_transport, rosbridge_suite, etc.)
- Set up Python dependencies

### 2. Set Up Workspace

Create the ROS 2 workspace:

```bash
./scripts/ros2/setup_workspace.sh
```

This creates `~/zip_ros2_ws/` with the standard ROS 2 workspace structure.

### 3. Deploy Packages

Copy the package structure to the workspace:

```bash
./scripts/ros2/deploy_packages.sh
```

### 4. Build Workspace

**For Docker setup** (current approach):
```bash
cd /home/zip/Zip/zip
./scripts/ros2/setup_jazzy_docker.sh
```

**For native setup** (legacy):
```bash
cd ~/zip_ros2_ws
source /opt/ros/jazzy/install/setup.bash
colcon build
```

### 5. Source Workspace

**For Docker setup** (inside container):
```bash
source /opt/ros/jazzy/install/setup.bash
source /ros2_ws/install/setup.bash
```

**For native setup** (add to `~/.bashrc`):
```bash
echo "source /opt/ros/jazzy/install/setup.bash" >> ~/.bashrc
echo "source ~/zip_ros2_ws/install/setup.bash" >> ~/.bashrc
source ~/.bashrc
```

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
│   ├── zip_control/
│   │   └── serial_bridge_node.py
│   └── launch/
├── zip_vision/            # YOLO11, VLM
│   ├── src/
│   │   ├── camera_node.cpp
│   │   ├── yolo11_node.cpp
│   │   └── vlm_node.cpp
│   └── launch/
├── zip_orchestration/     # MLC-LLM integration
│   ├── zip_orchestration/
│   │   └── orchestration_node.py
│   └── launch/
├── zip_voice/             # STT/TTS
│   ├── zip_voice/
│   │   ├── stt_node.py
│   │   ├── tts_node.py
│   │   └── voice_loop_node.py
│   └── launch/
└── zip_bridge/            # rosbridge wrapper
    ├── zip_bridge/
    │   └── tool_bridge_node.py
    └── launch/
```

## Custom Messages

### RobotDiagnostics.msg
Comprehensive robot state including motion, sensors, IMU, and system health.

### RobotSensors.msg
Aggregated sensor readings: ultrasonic, line tracking, IMU, servo position.

### BatteryStatus.msg
Battery voltage monitoring with health status (NORMAL, LOW, CRITICAL, CHARGING).

### VoiceState.msg
Voice loop state machine: IDLE, LISTENING, PROCESSING, SPEAKING, ERROR.

## Services

### EmergencyStop.srv
Immediately stops all robot motion and enters safe state.

## Verification

**For Docker setup** (current approach):
```bash
# Enter container
sudo docker exec -it ros2-jazzy bash

# Source ROS 2 and workspace
source /opt/ros/jazzy/install/setup.bash
source /ros2_ws/install/setup.bash

# Check packages are recognized
ros2 pkg list | grep zip

# Check custom messages
ros2 interface list | grep zip_core

# Test message compilation
ros2 interface show zip_core/msg/BatteryStatus
```

**For native setup** (legacy):
```bash
# Source ROS 2 and workspace
source /opt/ros/jazzy/install/setup.bash
source ~/zip_ros2_ws/install/setup.bash

# Check packages are recognized
ros2 pkg list | grep zip

# Check custom messages
ros2 interface list | grep zip_core

# Test message compilation
ros2 interface show zip_core/msg/BatteryStatus
```

**Quick verification script**:
```bash
cd /home/zip/Zip/zip
./scripts/ros2/quick_start_verification.sh
```

## Next Steps

- **Phase 2**: Arduino communication layer (serial bridge or micro-ROS)
- **Phase 3**: Vision stack (camera, YOLO11, VLM)
- **Phase 4**: Local LLM orchestration
- **Phase 5**: Voice system (STT/TTS)
- **Phase 6**: HUD integration via rosbridge
- **Phase 7**: Safety layers and performance tuning
- **Phase 8**: Testing and migration

## Troubleshooting

### Build Errors

**For Docker setup**:
```bash
# Enter container
sudo docker exec -it ros2-jazzy bash

# Check ROS 2
source /opt/ros/jazzy/install/setup.bash
ros2 pkg list | head -5

# Check dependencies
cd /ros2_ws
rosdep install --from-paths src --ignore-src -r -y

# Clean and rebuild
colcon build --cmake-clean-cache
```

**For native setup**:
1. Ensure ROS 2 Jazzy is properly installed: `ros2 --help`
2. Check dependencies: `rosdep install --from-paths src --ignore-src -r -y`
3. Clean and rebuild: `colcon build --cmake-clean-cache`

### Message Generation Issues

If custom messages don't generate:
1. Check CMakeLists.txt has `rosidl_generate_interfaces`
2. Ensure `rosidl_default_generators` is in package.xml
3. Rebuild: `colcon build --packages-select zip_core`

## References

- [ROS 2 Jazzy Documentation](https://docs.ros.org/en/jazzy/)
- [NVIDIA Jetson Orin Nano Super](https://www.nvidia.com/en-us/autonomous-machines/embedded-systems/jetson-orin/nano-super-developer-kit/)
- [JetPack 6.2 Documentation](https://developer.nvidia.com/embedded/jetpack)
