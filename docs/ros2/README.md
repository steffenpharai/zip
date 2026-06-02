# ZIP Robot ROS 2 Migration

This directory contains documentation and resources for migrating the ZIP robot from Node.js/WebSocket architecture to ROS 2 Humble.

## Overview

The migration plan is documented in `.cursor/plans/native_ros_2_humble_migration_a9734c9b.plan.md`.

**Current Setup**: Native ROS 2 Humble installation on Jetson Orin Nano (Ubuntu 22.04).

## Quick Start

### Phase 1: Foundation Setup (Native)

1. **Install ROS 2 Humble**:
   ```bash
   cd /home/zip/Zip/zip
   sudo ./scripts/ros2/install_ros2_humble_native.sh
   ```

2. **Complete Setup** (automated):
   ```bash
   ./scripts/ros2/setup_humble_native.sh
   ```

   Or step-by-step:
   ```bash
   ./scripts/ros2/setup_workspace.sh
   ./scripts/ros2/deploy_packages.sh
   ./scripts/ros2/continue_setup.sh
   ```

3. **Verify Installation**:
   ```bash
   # Quick verification
   ./scripts/ros2/quick_start_verification.sh
   
   # Or manual verification
   source /opt/ros/humble/setup.bash
   source ~/zip_ros2_ws/install/setup.bash
   ros2 pkg list | grep zip
   ```

## Documentation

- **[Phase 1 Native Setup Guide](PHASE1_SETUP_HUMBLE_NATIVE.md)** - Complete native setup for ROS 2 Humble
- **[Installation Instructions](INSTALLATION_INSTRUCTIONS.md)** - Detailed installation guide
- **[Migration Plan](../.cursor/plans/native_ros_2_humble_migration_a9734c9b.plan.md)** - Complete migration plan

## Native Installation Details

### System Requirements

- **OS**: Ubuntu 22.04 (Jetson Orin Nano)
- **ROS 2**: Humble Hawksbill (LTS)
- **JetPack**: 6.x (includes TensorRT, CUDA)
- **Memory**: 8GB RAM (shared CPU/GPU)

### Workspace Location

- **Workspace**: `~/zip_ros2_ws/`
- **Source packages**: `~/zip_ros2_ws/src/`
- **Build output**: `~/zip_ros2_ws/install/`

### Environment Setup

Use the helper script to source ROS 2:
```bash
source scripts/ros2/source_ros2.sh
```

Or manually:
```bash
source /opt/ros/humble/setup.bash
source ~/zip_ros2_ws/install/setup.bash
```

## Package Structure

All ROS 2 packages are located in `ros2_packages/` and deployed to `~/zip_ros2_ws/src/`:

- **zip_core**: Custom messages, safety layers, core robot state
- **zip_control**: Motion control, Arduino serial bridge
- **zip_vision**: YOLOE (TensorRT), VLM integration
- **zip_orchestration**: MLC-LLM integration, tool execution
- **zip_voice**: WhisperTRT (STT), Piper/Coqui (TTS)
- **zip_bridge**: rosbridge_suite wrapper, tool bridge

## Custom Messages

Defined in `zip_core`:
- `RobotDiagnostics.msg` - Comprehensive robot state
- `RobotSensors.msg` - Aggregated sensor readings
- `BatteryStatus.msg` - Battery monitoring
- `VoiceState.msg` - Voice loop state machine

## Services

- `EmergencyStop.srv` - Emergency stop service

## Development Workflow

1. **Edit Packages**: Edit in `ros2_packages/`

2. **Deploy and Build**:
   ```bash
   ./scripts/ros2/deploy_packages.sh
   cd ~/zip_ros2_ws
   source /opt/ros/humble/setup.bash
   colcon build
   source install/setup.bash
   ```

3. **Test**: 
   ```bash
   ros2 run <package> <node>
   ```

## Jetson Performance Optimization

⚠️ **CRITICAL**: Before running YOLO11 or other AI workloads, optimize Jetson performance following [Ultralytics Jetson Guide](https://docs.ultralytics.com/guides/nvidia-jetson/):

```bash
# Run optimization script (interactive)
./scripts/ros2/optimize_jetson_performance.sh

# Or non-interactive mode (applies all optimizations automatically)
./scripts/ros2/optimize_jetson_performance.sh --auto

# Verify optimizations are applied
./scripts/ros2/verify_jetson_optimization.sh
```

**Required optimizations:**
1. **MAX Power Mode** (`sudo nvpmodel -m 0`) - Enables all CPU/GPU cores
2. **Jetson Clocks** (`sudo jetson_clocks --store`) - Maximum frequency (persistent)
3. **Jetson Stats** (`sudo pip3 install jetson-stats`) - System monitoring

**Why this matters:**
- Without optimizations, YOLO11 inference can be 50%+ slower
- Thermal throttling can silently degrade performance
- Monitoring with `jtop` helps identify bottlenecks

**Reference**: [Ultralytics YOLO11 Jetson Guide](https://docs.ultralytics.com/guides/nvidia-jetson/)

## Performance Monitoring

```bash
# Monitor GPU usage
nvidia-smi

# Monitor system resources
htop

# Use jtop (if installed) - Recommended for Jetson
jtop

# Check power mode
sudo nvpmodel -q

# Check clock status
jetson_clocks --show
```

## Next Phases

- **Phase 2**: Arduino communication (serial bridge / micro-ROS) ✅
- **Phase 3**: Vision stack (camera, YOLOE-11, VLM) ✅
- **Phase 4**: MCP orchestration (LangGraph + ROS 2 tools) ✅
- **Phase 5**: Voice system (STT/TTS)
- **Phase 6**: HUD integration via rosbridge
- **Phase 7**: Safety layers and performance tuning
- **Phase 8**: Testing and migration

### Phase 4: MCP Implementation ✅

Phase 4 implements Model Context Protocol (MCP) support, enabling LangGraph agents in Next.js to execute ROS 2 tools via industry-standard protocol.

**Documentation:**
- [Phase 4 MCP Implementation](PHASE4_MCP_IMPLEMENTATION.md) - Complete implementation guide
- [Phase 4 MCP Summary](PHASE4_MCP_SUMMARY.md) - Quick reference

**Quick Start:**
```bash
# Install dependencies
pip3 install mcp fastmcp fastapi uvicorn

# Build package
cd ~/zip_ros2_ws
colcon build --packages-select zip_orchestration
source install/setup.bash

# Start MCP server
python3 -m zip_orchestration.mcp_http_server
```

## Deprecated Docker Setup

The previous Docker-based setup has been deprecated. Docker scripts are available in `scripts/ros2/deprecated/` for reference only.

**Why Native?**
- ROS 2 Humble is LTS and compatible with Ubuntu 22.04
- No Docker overhead (better performance)
- Direct hardware access (no container permissions needed)
- Simpler development workflow

## Resources

- [ROS 2 Humble Documentation](https://docs.ros.org/en/humble/)
- [NVIDIA Jetson Orin Nano](https://www.nvidia.com/en-us/autonomous-machines/embedded-systems/jetson-orin/nano-developer-kit/)
