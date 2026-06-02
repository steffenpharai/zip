# ROS 2 Setup Scripts

Scripts for setting up native ROS 2 Humble on Jetson Orin Nano (Ubuntu 22.04) and managing the workspace.

## Current Setup: Native ROS 2 Humble

The project has migrated from Docker-based ROS 2 Jazzy to native ROS 2 Humble installation. This removes Docker overhead and simplifies development.

### install_ros2_humble_native.sh

Installs ROS 2 Humble natively on Ubuntu 22.04.

**Usage:**
```bash
sudo ./scripts/ros2/install_ros2_humble_native.sh
```

**What it does:**
- Installs ROS 2 Humble Desktop
- Installs colcon, rosdep, vcstool
- Installs required packages (v4l2-camera, camera-info-manager, vision-msgs, cv-bridge, rosbridge-suite)
- Installs Python dependencies (pyserial, numpy, opencv-python-headless)

### setup_workspace.sh

Creates the ROS 2 workspace at `~/zip_ros2_ws`.

**Usage:**
```bash
./scripts/ros2/setup_workspace.sh
```

**What it does:**
- Creates workspace directory structure
- Sources ROS 2 Humble environment
- Creates symlink to project root (excluded from builds)

### deploy_packages.sh

Deploys ROS 2 packages from `ros2_packages/` to workspace.

**Usage:**
```bash
./scripts/ros2/deploy_packages.sh
```

**What it does:**
- Copies packages to `~/zip_ros2_ws/src/`
- Cleans up old backup directories
- Replaces existing packages (no backups to avoid duplicate errors)

### continue_setup.sh

Completes Phase 1 setup after ROS 2 installation.

**Usage:**
```bash
./scripts/ros2/continue_setup.sh
```

**What it does:**
- Verifies ROS 2 Humble installation
- Deploys packages
- Installs dependencies via rosdep
- Builds workspace
- Verifies installation

### quick_start_verification.sh

Quick verification of Phase 1 setup.

**Usage:**
```bash
./scripts/ros2/quick_start_verification.sh
```

**What it does:**
- Verifies package structure
- Checks ROS 2 Humble installation
- Verifies workspace setup
- Checks required packages

## Quick Start

1. **Install ROS 2 Humble:**
   ```bash
   sudo ./scripts/ros2/install_ros2_humble_native.sh
   ```

2. **Set up workspace:**
   ```bash
   ./scripts/ros2/setup_workspace.sh
   ```

3. **Deploy packages:**
   ```bash
   ./scripts/ros2/deploy_packages.sh
   ```

4. **Complete setup:**
   ```bash
   ./scripts/ros2/continue_setup.sh
   ```

5. **Verify:**
   ```bash
   ./scripts/ros2/quick_start_verification.sh
   ```

## Using ROS 2

After setup, source the environment:

```bash
source /opt/ros/humble/setup.bash
source ~/zip_ros2_ws/install/setup.bash
```

Or use the helper script (when created):
```bash
source scripts/ros2/source_ros2.sh
```

## Workspace Structure

```
~/zip_ros2_ws/
├── src/              # ROS 2 packages
│   ├── zip_core/
│   ├── zip_control/
│   ├── zip_vision/
│   ├── zip_orchestration/
│   ├── zip_voice/
│   └── zip_bridge/
├── build/            # Build artifacts
├── install/          # Installed packages
└── log/              # Build logs
```

## Deprecated Scripts

Docker-based and Jazzy scripts have been moved to `scripts/ros2/deprecated/`. See `deprecated/README.md` for details.

## Notes

- ROS 2 Humble is LTS and fully compatible with Ubuntu 22.04
- Native installation allows direct hardware access without container permissions
- Workspace is located at `~/zip_ros2_ws` (not in a container)
- All paths use native filesystem (no container paths)
