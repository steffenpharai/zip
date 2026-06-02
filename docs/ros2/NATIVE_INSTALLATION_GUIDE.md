# Native Installation Guide: ROS 2 + YOLOE-11 on Jetson Orin Nano 8GB

Complete guide for migrating from Docker-based vision system to fully native installation on Jetson Orin Nano 8GB running JetPack 6.x and ROS 2 Humble.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [System Setup](#system-setup)
3. [ROS 2 Humble Installation](#ros-2-humble-installation)
4. [Python Environment Setup](#python-environment-setup)
5. [YOLOE-11 Model Download and Export](#yoloe-11-model-download-and-export)
6. [ROS 2 Workspace Setup](#ros-2-workspace-setup)
7. [Building the Vision Package](#building-the-vision-package)
8. [Systemd Services Configuration](#systemd-services-configuration)
9. [Next.js Native Setup](#nextjs-native-setup)
10. [Robot Bridge Native Setup](#robot-bridge-native-setup)
11. [Verification and Testing](#verification-and-testing)
12. [Performance Optimization](#performance-optimization)
13. [Troubleshooting](#troubleshooting)

---

## Prerequisites

### Hardware Requirements
- Jetson Orin Nano 8GB
- JetPack 6.x (Ubuntu 22.04)
- USB or CSI camera (accessible at `/dev/video0`)
- At least 2GB free disk space for models and workspace

### Software Requirements
- Ubuntu 22.04 (comes with JetPack 6.x)
- Python 3.10+ (included with Ubuntu 22.04)
- CUDA 12.x (included with JetPack 6.x)
- TensorRT 10.x (included with JetPack 6.x)
- Git

### Verify JetPack Installation
```bash
# Check JetPack version
cat /etc/nv_tegra_release

# Check CUDA version
nvcc --version

# Check TensorRT version
dpkg -l | grep tensorrt

# Check GPU
nvidia-smi
```

---

## System Setup

### 1. Update System Packages
```bash
sudo apt update
sudo apt upgrade -y
```

### 2. Install Essential Build Tools
```bash
sudo apt install -y \
    build-essential \
    cmake \
    git \
    wget \
    curl \
    vim \
    python3-pip \
    python3-venv \
    python3-dev \
    libopencv-dev \
    libeigen3-dev
```

### 3. Configure Swap (if needed)
Jetson Orin Nano 8GB has shared CPU/GPU memory. Ensure adequate swap:
```bash
# Check current swap
free -h

# If swap is insufficient (< 2GB), add swap file
sudo fallocate -l 4G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile

# Make permanent
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

### 4. Set Power Mode (for maximum performance)
```bash
# Set to maximum performance mode
sudo nvpmodel -m 0
sudo jetson_clocks

# Verify
sudo nvpmodel -q
```

---

## ROS 2 Humble Installation

### 1. Install ROS 2 Humble Desktop
```bash
# Set locale
sudo apt install -y locales
sudo locale-gen en_US en_US.UTF-8
sudo update-locale LC_ALL=en_US.UTF-8 LANG=en_US.UTF-8
export LANG=en_US.UTF-8

# Add ROS 2 apt repository
sudo apt install -y software-properties-common
sudo add-apt-repository universe
sudo apt update && sudo apt install -y curl gnupg lsb-release

# Add ROS 2 GPG key
sudo curl -sSL https://raw.githubusercontent.com/ros/rosdistro/master/ros.asc | sudo apt-key add -
sudo sh -c 'echo "deb [arch=$(dpkg --print-architecture)] http://packages.ros.org/ros2/ubuntu $(lsb_release -cs) main" > /etc/apt/sources.list.d/ros2-latest.list'

# Install ROS 2 Humble Desktop
sudo apt update
sudo apt install -y ros-humble-desktop

# Install additional ROS 2 packages
sudo apt install -y \
    ros-humble-cv-bridge \
    ros-humble-image-transport \
    ros-humble-vision-msgs \
    ros-humble-v4l2-camera \
    python3-rosdep2 \
    python3-colcon-common-extensions
```

### 2. Initialize rosdep
```bash
sudo rosdep init
rosdep update
```

### 3. Source ROS 2 Setup
```bash
# Add to ~/.bashrc
echo "source /opt/ros/humble/setup.bash" >> ~/.bashrc
source ~/.bashrc
```

### 4. Verify ROS 2 Installation
```bash
source /opt/ros/humble/setup.bash
ros2 --help
```

---

## Python Environment Setup

### 1. Create Python Virtual Environment
```bash
# Create venv in home directory
cd ~
python3 -m venv zip_vision_env
source zip_vision_env/bin/activate

# Upgrade pip
pip install --upgrade pip setuptools wheel
```

### 2. Install Ultralytics (with GPU support)
```bash
# Install NumPy first (NVIDIA requirement for PyTorch wheels)
pip install numpy==1.26.1

# Install PyTorch for Jetson (NVIDIA official wheels)
# For JetPack 6.2 (CUDA 12.6):
# Use NVIDIA's official PyTorch wheels from Jetson AI Lab repository
pip install torch==2.8.0 torchvision==0.23.0 --index-url=https://pypi.jetson-ai-lab.io/jp6/cu126

# Alternative: For JetPack 6.1 or if above doesn't work, check:
# https://forums.developer.nvidia.com/t/pytorch-for-jetson/72048
# Download appropriate wheel for your JetPack version

# Install Ultralytics
pip install ultralytics

# Install additional dependencies (NumPy already installed above)
pip install \
    opencv-python \
    opencv-contrib-python \
    fastapi \
    uvicorn \
    pillow \
    pyyaml
```

### 3. Verify GPU Access
```bash
python3 << EOF
import torch
print(f"PyTorch version: {torch.__version__}")
print(f"CUDA available: {torch.cuda.is_available()}")
print(f"CUDA version: {torch.version.cuda}")
print(f"GPU device: {torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'N/A'}")
EOF
```

### 4. Make Virtual Environment Persistent
```bash
# Add to ~/.bashrc
echo "source ~/zip_vision_env/bin/activate" >> ~/.bashrc
```

---

## YOLOE-11 Model Download and Export

### 1. Create Models Directory
```bash
mkdir -p ~/ros2_ws/src/zip_vision/models
cd ~/ros2_ws/src/zip_vision/models
```

### 2. Download YOLOE-11 Prompt-Free Model
```bash
# Option 1: Using HuggingFace CLI
pip install huggingface_hub
huggingface-cli download jameslahm/yoloe yoloe-11l-seg-pf.pt --local-dir .

# Option 2: Manual download
# Visit https://huggingface.co/jameslahm/yoloe
# Download yoloe-11l-seg-pf.pt to ~/ros2_ws/src/zip_vision/models/

# For memory-constrained systems, use M variant:
# huggingface-cli download jameslahm/yoloe yoloe-11m-seg-pf.pt --local-dir .
```

### 3. Export to TensorRT Engine
```bash
# Activate virtual environment
source ~/zip_vision_env/bin/activate

# Export to TensorRT FP16 (recommended for Jetson Orin Nano)
cd ~/ros2_ws/src/zip_vision/models
yolo export \
    model=yoloe-11l-seg-pf.pt \
    format=engine \
    imgsz=416 \
    half=True \
    device=0 \
    workspace=2

# This creates: yoloe-11l-seg-pf.engine

# Verify engine file
ls -lh yoloe-11l-seg-pf.engine
```

### 4. Test Model Loading
```bash
python3 << EOF
from ultralytics import YOLO
import torch

model_path = "yoloe-11l-seg-pf.engine"  # or .pt
model = YOLO(model_path)
print(f"Model loaded: {model_path}")
print(f"Device: {torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'CPU'}")
EOF
```

---

## ROS 2 Workspace Setup

### 1. Create Workspace
```bash
mkdir -p ~/ros2_ws/src
cd ~/ros2_ws/src
```

### 2. Clone/Copy Vision Package
```bash
# If using existing package from project
cp -r /home/steffen/Projects/Zip/ros2_packages/zip_vision ~/ros2_ws/src/

# Or clone from repository
# git clone <your-repo-url> zip_vision
```

### 3. Install Python Dependencies for ROS 2
```bash
cd ~/ros2_ws
source /opt/ros/humble/setup.bash
source ~/zip_vision_env/bin/activate

# Install ROS 2 Python dependencies
rosdep install --from-paths src --ignore-src -r -y
```

---

## Building the Vision Package

### 1. Build Workspace
```bash
cd ~/ros2_ws
source /opt/ros/humble/setup.bash
source ~/zip_vision_env/bin/activate

# Build with colcon
colcon build --packages-select zip_vision --symlink-install

# Source workspace
source install/setup.bash
```

### 2. Verify Build
```bash
# Check if executables are available
ros2 pkg executables zip_vision

# Should show:
# zip_vision yoloe_ros_node.py
# zip_vision vision_diagnostics_bridge.py
```

---

## Systemd Services Configuration

### 1. Create Vision Service
```bash
sudo nano /etc/systemd/system/zip-vision.service
```

See [Systemd Services](#systemd-services) section below for full service file.

### 2. Create Robot Bridge Service
```bash
sudo nano /etc/systemd/system/zip-robot-bridge.service
```

### 3. Create Web Service
```bash
sudo nano /etc/systemd/system/zip-web.service
```

### 4. Enable and Start Services
```bash
# Reload systemd
sudo systemctl daemon-reload

# Enable services (start on boot)
sudo systemctl enable zip-vision.service
sudo systemctl enable zip-robot-bridge.service
sudo systemctl enable zip-web.service

# Start services
sudo systemctl start zip-vision.service
sudo systemctl start zip-robot-bridge.service
sudo systemctl start zip-web.service

# Check status
sudo systemctl status zip-vision.service
sudo systemctl status zip-robot-bridge.service
sudo systemctl status zip-web.service
```

---

## Next.js Native Setup

### 1. Install Node.js (if not already installed)
```bash
# Install Node.js 20.x
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Verify
node --version
npm --version
```

### 2. Install Project Dependencies
```bash
cd /home/steffen/Projects/Zip
npm install
```

### 3. Update Environment Variables
```bash
# Edit .env file
nano .env

# Update these variables:
# NEXT_PUBLIC_VISION_BRIDGE_URL=http://localhost:8767
# VISION_BRIDGE_URL=http://localhost:8767
# NEXT_PUBLIC_ROBOT_BRIDGE_WS_URL=ws://localhost:8765/robot
```

### 4. Build Next.js Application
```bash
npm run build
```

---

## Robot Bridge Native Setup

### 1. Install Robot Bridge Dependencies
```bash
cd /home/steffen/Projects/Zip/robot/bridge/zip-robot-bridge
npm install
```

### 2. Build Robot Bridge
```bash
npm run build:local
```

---

## Verification and Testing

### 1. Check ROS 2 Topics
```bash
source ~/ros2_ws/install/setup.bash
ros2 topic list

# Should see:
# /camera/image_raw
# /detections
# /detections/visualization
```

### 2. Check Topic Data
```bash
# View camera feed
ros2 topic echo /camera/image_raw --once

# View detections
ros2 topic echo /detections --once
```

### 3. Test HTTP API
```bash
# Status endpoint
curl http://localhost:8767/api/vision/status | jq

# Detections endpoint
curl http://localhost:8767/api/vision/detections | jq

# Visualization image
curl http://localhost:8767/api/vision/visualization -o test_vis.jpg

# Camera image
curl http://localhost:8767/api/vision/camera -o test_camera.jpg
```

### 4. Check System Resources
```bash
# Monitor GPU
sudo jetson_stats

# Or use jtop (if installed)
jtop

# Check memory
free -h

# Check CPU
htop
```

### 5. Test Frontend
```bash
# Open browser
http://localhost:3000/vision-diagnostics
```

---

## Performance Optimization

### 1. Model Size Selection
- **YOLOE-11L-seg-pf**: Best accuracy, ~26-32M params, ~500-700MB GPU memory
- **YOLOE-11M-seg-pf**: Balanced, ~18-22M params, ~400-600MB GPU memory
- **YOLOE-11S-seg-pf**: Fastest, ~10-14M params, ~300-500MB GPU memory

### 2. Image Size Optimization
- **416x416**: Fastest (~50-70 FPS), good for real-time
- **480x480**: Balanced (~40-50 FPS)
- **640x640**: Best accuracy (~30-40 FPS)

### 3. Precision Settings
- **FP16 (half=True)**: Recommended, ~2x faster than FP32, minimal accuracy loss
- **INT8**: Fastest, requires calibration dataset, may have accuracy loss

### 4. Confidence Threshold
- **0.2**: Lower threshold for household rare items (recommended)
- **0.25-0.3**: Balanced
- **0.5+**: High precision, may miss rare items

### 5. System Tuning
```bash
# Set CPU governor to performance
sudo cpufreq-set -g performance

# Disable unnecessary services
sudo systemctl disable bluetooth
sudo systemctl disable snapd

# Optimize memory
echo 'vm.swappiness=10' | sudo tee -a /etc/sysctl.conf
sudo sysctl -p
```

---

## Troubleshooting

### Issue: ROS 2 topics not publishing
**Solution:**
```bash
# Check if nodes are running
ros2 node list

# Check node logs
journalctl -u zip-vision.service -f

# Verify camera access
ls -l /dev/video0
v4l2-ctl --list-devices
```

### Issue: GPU out of memory
**Solution:**
- Use smaller model (M or S variant)
- Reduce image size (416 instead of 640)
- Close other GPU applications
- Check memory: `sudo jetson_stats`

### Issue: Model not loading
**Solution:**
```bash
# Verify model file exists
ls -lh ~/ros2_ws/src/zip_vision/models/yoloe-11l-seg-pf.engine

# Test model loading in Python
python3 << EOF
from ultralytics import YOLO
model = YOLO("~/ros2_ws/src/zip_vision/models/yoloe-11l-seg-pf.engine")
EOF
```

### Issue: FastAPI bridge not responding
**Solution:**
```bash
# Check if service is running
sudo systemctl status zip-vision.service

# Check port
sudo netstat -tulpn | grep 8767

# Check logs
journalctl -u zip-vision.service -n 50
```

### Issue: Camera not detected
**Solution:**
```bash
# List video devices
v4l2-ctl --list-devices

# Test camera
ffplay /dev/video0

# Check permissions
sudo usermod -a -G video $USER
# Log out and back in
```

---

## Next Steps

1. **Monitor Performance**: Use `jtop` or `jetson_stats` to monitor GPU/CPU usage
2. **Tune Parameters**: Adjust confidence threshold, image size based on your use case
3. **Add Logging**: Configure ROS 2 logging levels for debugging
4. **Backup Configuration**: Save working configurations for easy restoration

---

## Summary

This guide provides a complete native installation of:
- ✅ ROS 2 Humble (native)
- ✅ YOLOE-11 Prompt-Free (Python + Ultralytics)
- ✅ TensorRT engine export
- ✅ FastAPI diagnostics bridge
- ✅ Systemd services for auto-start
- ✅ Next.js frontend (native)
- ✅ Robot bridge (native)

All services run as native processes without Docker, maximizing performance on Jetson Orin Nano 8GB.
