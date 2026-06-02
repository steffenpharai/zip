# Native Installation Quick Start

Quick reference guide for getting the native ZIP Robot vision system running on Jetson Orin Nano 8GB.

## Prerequisites Checklist

- [ ] JetPack 6.x installed
- [ ] ROS 2 Humble installed
- [ ] Python 3.10+ virtual environment created
- [ ] Ultralytics installed with GPU support
- [ ] Camera connected and accessible at `/dev/video0`
- [ ] Node.js 20.x installed

## Quick Installation Steps

### 1. Install ROS 2 Humble
```bash
sudo apt install -y ros-humble-desktop ros-humble-cv-bridge ros-humble-vision-msgs ros-humble-v4l2-camera
source /opt/ros/humble/setup.bash
echo "source /opt/ros/humble/setup.bash" >> ~/.bashrc
```

### 2. Setup Python Environment
```bash
python3 -m venv ~/zip_vision_env
source ~/zip_vision_env/bin/activate
pip install --upgrade pip
pip install torch torchvision --index-url https://download.pytorch.org/whl/cu121
pip install ultralytics fastapi uvicorn
echo "source ~/zip_vision_env/bin/activate" >> ~/.bashrc
```

### 3. Download and Export YOLOE Model
```bash
cd ~/ros2_ws/src/zip_vision/models
bash /home/steffen/Projects/Zip/scripts/native/export_yoloe_tensorrt.sh l 416
```

### 4. Build ROS 2 Workspace
```bash
cd ~/ros2_ws
source /opt/ros/humble/setup.bash
source ~/zip_vision_env/bin/activate
colcon build --packages-select zip_vision --symlink-install
source install/setup.bash
echo "source ~/ros2_ws/install/setup.bash" >> ~/.bashrc
```

### 5. Install Systemd Services
```bash
cd /home/steffen/Projects/Zip
bash scripts/native/install_systemd_services.sh $USER
```

### 6. Update Environment Variables
```bash
# Edit .env file
nano .env

# Set:
NEXT_PUBLIC_VISION_BRIDGE_URL=http://localhost:8767
VISION_BRIDGE_URL=http://localhost:8767
NEXT_PUBLIC_ROBOT_BRIDGE_WS_URL=ws://localhost:8765/robot
```

### 7. Build and Start Services
```bash
# Build Next.js
cd /home/steffen/Projects/Zip
npm install
npm run build

# Build robot bridge
cd robot/bridge/zip-robot-bridge
npm install
npm run build:local

# Start services
sudo systemctl start zip-vision.service
sudo systemctl start zip-robot-bridge.service
sudo systemctl start zip-web.service
```

## Verification

### Quick Test
```bash
# Run verification script
bash /home/steffen/Projects/Zip/scripts/native/verify_native_setup.sh
```

### Manual Checks
```bash
# Check ROS 2 topics
source ~/ros2_ws/install/setup.bash
ros2 topic list

# Check API endpoints
curl http://localhost:8767/api/vision/status | jq
curl http://localhost:8766/health
curl http://localhost:3000/api/health

# Check services
sudo systemctl status zip-vision.service
sudo systemctl status zip-robot-bridge.service
sudo systemctl status zip-web.service
```

## Common Commands

### Start/Stop Services
```bash
# Start all
sudo systemctl start zip-vision.service zip-robot-bridge.service zip-web.service

# Stop all
sudo systemctl stop zip-vision.service zip-robot-bridge.service zip-web.service

# Restart all
sudo systemctl restart zip-vision.service zip-robot-bridge.service zip-web.service
```

### View Logs
```bash
# Follow logs
journalctl -u zip-vision.service -f
journalctl -u zip-robot-bridge.service -f
journalctl -u zip-web.service -f

# Last 50 lines
journalctl -u zip-vision.service -n 50
```

### Manual Launch (for testing)
```bash
# Vision pipeline
source ~/ros2_ws/install/setup.bash
ros2 launch zip_vision vision_native.launch.py

# Or with custom parameters
ros2 launch zip_vision vision_native.launch.py \
    yoloe_model_path:=~/ros2_ws/src/zip_vision/models/yoloe-11l-seg-pf.engine \
    yoloe_confidence_threshold:=0.2 \
    yoloe_imgsz:=416
```

## Performance Tuning

### For Maximum Speed (40+ FPS)
```bash
# Use smaller model
yoloe_model_path:=~/ros2_ws/src/zip_vision/models/yoloe-11m-seg-pf_416_fp16.engine

# Smaller image size
yoloe_imgsz:=416

# Lower confidence (more detections)
yoloe_confidence_threshold:=0.2
```

### For Better Accuracy
```bash
# Use larger model
yoloe_model_path:=~/ros2_ws/src/zip_vision/models/yoloe-11l-seg-pf_640_fp16.engine

# Larger image size
yoloe_imgsz:=640

# Higher confidence (fewer false positives)
yoloe_confidence_threshold:=0.3
```

## Troubleshooting Quick Fixes

### Service won't start
```bash
# Check logs
journalctl -u zip-vision.service -n 50

# Check if port is in use
sudo netstat -tulpn | grep 8767

# Verify paths in service file
sudo systemctl cat zip-vision.service
```

### No detections
```bash
# Check camera
v4l2-ctl --list-devices
ros2 topic echo /camera/image_raw --once

# Check YOLOE node
ros2 node list
ros2 topic echo /detections --once

# Lower confidence threshold
ros2 param set /yoloe_node conf 0.15
```

### Out of memory
```bash
# Use smaller model (M or S variant)
# Reduce image size to 416
# Close other applications
sudo jetson_stats  # Monitor memory
```

## Next Steps

1. **Monitor Performance**: Use `jtop` or `jetson_stats` to monitor GPU/CPU
2. **Tune Parameters**: Adjust confidence threshold based on your use case
3. **Enable Auto-start**: Services are already enabled to start on boot
4. **Set Up Logging**: Configure log rotation if needed

For detailed information, see [NATIVE_INSTALLATION_GUIDE.md](./NATIVE_INSTALLATION_GUIDE.md).
