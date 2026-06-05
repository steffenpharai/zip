# Native Installation Environment Configuration

This document describes the environment variables and configuration needed for the native (non-Docker) installation of the ZIP Robot vision system.

## Next.js Environment Variables

### Location
Create or update `.env` file in the project root (`/home/steffen/Projects/Zip/.env`):

```bash
# Vision Bridge URL (native installation - localhost)
NEXT_PUBLIC_VISION_BRIDGE_URL=http://localhost:8767
VISION_BRIDGE_URL=http://localhost:8767

# Robot Bridge WebSocket URL (native installation - localhost)
NEXT_PUBLIC_ROBOT_BRIDGE_WS_URL=ws://localhost:8765/robot

# OpenAI API (if using AI features)
OPENAI_API_KEY=your_api_key_here

# Other OpenAI settings (optional)
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
OPENAI_REALTIME_MODEL=gpt-4o-realtime-preview-2024-12-17
OPENAI_RESPONSES_MODEL=gpt-4o-2024-08-06
OPENAI_VISION_MODEL=gpt-4o-2024-08-06
OPENAI_TTS_MODEL=tts-1-hd
OPENAI_STT_MODEL=whisper-1

# Feature flags
ZIP_REALTIME_ENABLED=true
ZIP_VOICE_FALLBACK_ENABLED=true
```

### Migration from Docker

**Before (Docker):**
```bash
NEXT_PUBLIC_VISION_BRIDGE_URL=http://vision-service:8767
VISION_BRIDGE_URL=http://vision-service:8767
NEXT_PUBLIC_ROBOT_BRIDGE_WS_URL=ws://robot-bridge:8765/robot
```

**After (Native):**
```bash
NEXT_PUBLIC_VISION_BRIDGE_URL=http://localhost:8767
VISION_BRIDGE_URL=http://localhost:8767
NEXT_PUBLIC_ROBOT_BRIDGE_WS_URL=ws://localhost:8765/robot
```

## ROS 2 Environment Variables

### System-wide (in `~/.bashrc` or systemd service)
```bash
# ROS 2 Domain ID
export ROS_DOMAIN_ID=0

# ROS 2 Distribution
export ROS_DISTRO=humble

# Python unbuffered (for logging)
export PYTHONUNBUFFERED=1
```

### Virtual Environment Activation
Add to `~/.bashrc`:
```bash
# ROS 2
source /opt/ros/humble/setup.bash

# Python virtual environment
source ~/zip_vision_env/bin/activate

# ROS 2 workspace
source ~/ros2_ws/install/setup.bash
```

## Systemd Service Environment

### zip-vision.service
```ini
Environment="ROS_DOMAIN_ID=0"
Environment="ROS_DISTRO=humble"
Environment="PYTHONUNBUFFERED=1"
```

### zip-robot-bridge.service
```ini
Environment="NODE_ENV=production"
Environment="WS_PORT=8765"
Environment="HTTP_PORT=8766"
Environment="SERIAL_BAUD=115200"
```

### zip-web.service
```ini
Environment="NODE_ENV=production"
Environment="PORT=3000"
```

## YOLOE Model Configuration

### Launch File Parameters
```bash
# Model path (absolute or relative to package)
yoloe_model_path:=~/ros2_ws/src/zip_vision/models/yoloe-11l-seg-pf.engine

# Confidence threshold (lower for rare household items)
yoloe_confidence_threshold:=0.2

# NMS threshold
yoloe_nms_threshold:=0.45

# Image size (416 for speed, 640 for accuracy)
yoloe_imgsz:=416
```

### Config File (`ros2_packages/zip_vision/config/yoloe_params.yaml`)
```yaml
model_path: ""  # Set via launch file
imgsz: 416
conf: 0.2
iou: 0.45
half: true  # FP16 precision
device: "0"  # GPU device ID
max_det: 100
```

## Camera Configuration

### Device Path
Default: `/dev/video0`

To use a different camera:
```bash
# List available cameras
v4l2-ctl --list-devices

# Use in launch file
ros2 launch zip_vision vision_native.launch.py device_id:=1
```

### Permissions
```bash
# Add user to video group
sudo usermod -a -G video $USER

# Log out and back in for changes to take effect
```

## Port Configuration

| Service | Port | Protocol | Description |
|---------|------|----------|-------------|
| zip-web | 3000 | HTTP | Next.js frontend |
| zip-robot-bridge | 8765 | WebSocket | Robot WebSocket bridge |
| zip-robot-bridge | 8766 | HTTP | Robot HTTP API |
| zip-vision | 8767 | HTTP | Vision diagnostics bridge |

### Firewall (if needed)
```bash
# Allow ports (if using firewall)
sudo ufw allow 3000/tcp
sudo ufw allow 8765/tcp
sudo ufw allow 8766/tcp
sudo ufw allow 8767/tcp
```

## Verification

### Check Environment Variables
```bash
# Next.js
cd /home/steffen/Projects/Zip
cat .env | grep VISION_BRIDGE_URL

# ROS 2
echo $ROS_DOMAIN_ID
echo $ROS_DISTRO

# Python
echo $VIRTUAL_ENV
```

### Test Connections
```bash
# Vision API
curl http://localhost:8767/api/vision/status

# Robot Bridge
curl http://localhost:8766/health

# Web App
curl http://localhost:3000/api/health
```

## Troubleshooting

### Issue: Services can't connect to each other
- Verify all services are running: `sudo systemctl status zip-*`
- Check ports are not in use: `sudo netstat -tulpn | grep -E '3000|8765|8766|8767'`
- Verify environment variables match (localhost vs service names)

### Issue: ROS 2 topics not visible
- Check ROS_DOMAIN_ID matches across all services
- Verify workspace is sourced: `source ~/ros2_ws/install/setup.bash`
- Check node is running: `ros2 node list`

### Issue: Model not loading
- Verify model path is absolute or correct relative path
- Check file permissions: `ls -l ~/ros2_ws/src/zip_vision/models/`
- Test model loading: `python3 -c "from ultralytics import YOLO; YOLO('path/to/model.engine')"`
