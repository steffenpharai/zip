# ROS 2 Installation Instructions for Jetson

## Current Status

✅ **Phase 1 Complete** - Native ROS 2 Humble installation  
✅ Workspace created at `~/zip_ros2_ws/`  
✅ All packages deployed and built  
✅ ROS 2 Humble running natively on Jetson Orin Nano

## Current Setup: Native Installation (Recommended)

**Phase 1 is complete using native ROS 2 Humble installation.** This is the recommended approach for Jetson Orin Nano running Ubuntu 22.04.

### Quick Start (Native)

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

3. **Use ROS 2**:
   ```bash
   source /opt/ros/humble/setup.bash
   source ~/zip_ros2_ws/install/setup.bash
   ros2 pkg list | grep zip
   ```

See [PHASE1_SETUP_HUMBLE_NATIVE.md](PHASE1_SETUP_HUMBLE_NATIVE.md) for complete native setup guide.

## Detailed Installation Steps

### Step 1: Install ROS 2 Humble (Requires Sudo)

You need to run the ROS 2 installation with sudo privileges. You have two options:

#### Option A: Run the automated installation script (Recommended)
```bash
cd /home/zip/Zip/zip
sudo ./scripts/ros2/install_ros2_humble_native.sh
```

#### Option B: Run commands manually
```bash
# Set locale
export LANG=C.UTF-8
export LC_ALL=C.UTF-8
sudo locale-gen C.UTF-8

# Add ROS 2 repository
sudo apt update
sudo apt install -y software-properties-common curl gnupg lsb-release
sudo curl -sSL https://raw.githubusercontent.com/ros/rosdistro/master/ros.asc -o /usr/share/keyrings/ros-archive-keyring.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/ros-archive-keyring.gpg] http://packages.ros.org/ros2/ubuntu $(lsb_release -cs) main" | sudo tee /etc/apt/sources.list.d/ros2-latest.list

# Install ROS 2 Humble
sudo apt update
sudo apt install -y ros-humble-desktop python3-colcon-common-extensions python3-rosdep python3-vcstool

# Initialize rosdep
sudo rosdep init
rosdep update

# Install additional packages
sudo apt install -y \
    ros-humble-cv-bridge \
    ros-humble-image-transport \
    ros-humble-image-transport-plugins \
    ros-humble-vision-msgs \
    ros-humble-v4l2-camera \
    ros-humble-camera-info-manager \
    ros-humble-rosbridge-suite \
    ros-humble-rosapi \
    ros-humble-rosbridge-server \
    ros-humble-rosbridge-library \
    python3-pip

# Install Python dependencies
pip3 install --user pyserial numpy opencv-python-headless
```

### Step 2: Continue Setup

After ROS 2 is installed, run:

```bash
cd /home/zip/Zip/zip
./scripts/ros2/continue_setup.sh
```

This script will:
- Deploy packages to workspace
- Install package dependencies via rosdep
- Build the workspace
- Verify the installation

### Step 3: Verify Installation

```bash
# Source ROS 2
source /opt/ros/humble/setup.bash
source ~/zip_ros2_ws/install/setup.bash

# Check packages
ros2 pkg list | grep zip

# Check custom messages
ros2 interface show zip_core/msg/BatteryStatus
ros2 interface show zip_core/msg/RobotSensors
ros2 interface show zip_core/srv/EmergencyStop
```

### Step 4: Add to ~/.bashrc (Optional)

To automatically source ROS 2 in new terminals:

```bash
echo "source /opt/ros/humble/setup.bash" >> ~/.bashrc
echo "source ~/zip_ros2_ws/install/setup.bash" >> ~/.bashrc
source ~/.bashrc
```

Or use the helper script:
```bash
echo "source $(pwd)/scripts/ros2/source_ros2.sh" >> ~/.bashrc
```

## Troubleshooting

### If rosdep init fails
If you see "rosdep update" errors, you may need to:
```bash
sudo rm -rf /etc/ros/rosdep/sources.list.d/20-default.list
sudo rosdep init
rosdep update
```

### If build fails
```bash
cd ~/zip_ros2_ws
colcon build --cmake-clean-cache
```

### If packages not found
Make sure you've sourced the workspace:
```bash
source ~/zip_ros2_ws/install/setup.bash
```

### If TensorRT not found (for zip_vision)
TensorRT should be included with JetPack 6.x. If CMake can't find it:
- Check that TensorRT packages are installed: `dpkg -l | grep tensorrt`
- The `FindTensorRT.cmake` module in `zip_vision/cmake/` should handle detection
- If issues persist, check TensorRT paths: `find /usr -name "*nvinfer*"`

## Next Steps

After ROS 2 is installed and workspace is built:
- **Phase 2**: Arduino communication layer (serial bridge / micro-ROS) ✅
- **Phase 3**: Vision stack (camera, YOLO11, VLM) - In progress
- **Phase 4**: Local LLM orchestration
- **Phase 5**: Voice system (STT/TTS)
- **Phase 6**: HUD integration via rosbridge
- **Phase 7**: Safety layers and performance tuning
- **Phase 8**: Testing and migration
