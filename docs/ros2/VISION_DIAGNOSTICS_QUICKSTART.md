# Vision Diagnostics Quick Start Guide

## Quick Setup (3 Steps)

### 1. Build ROS 2 Package

```bash
cd ~/zip_ros2_ws
colcon build --packages-select zip_vision
source install/setup.bash
```

### 2. Start Vision Pipeline + Bridge

```bash
# Terminal 1: Start vision pipeline
ros2 launch zip_vision vision_pipeline.launch.py \
  yolo11_model_path:=$(realpath ~/zip_ros2_ws/src/zip_vision/models/yolo11/yolo11n_640_fp16.engine) \
  enable_vlm:=false \
  enable_diagnostics_bridge:=true

# Terminal 2: Start HTTP bridge server
ros2 launch zip_vision vision_diagnostics_bridge.launch.py
```

**Alternative**: Start bridge directly:
```bash
python3 ~/zip_ros2_ws/src/zip_vision/src/vision_diagnostics_bridge.py
```

### 3. Start Next.js Frontend

```bash
# Terminal 3: Start Next.js (from project root)
npm run dev
```

### 4. Open Diagnostics Page

Open browser to: **http://localhost:3000/vision-diagnostics**

Click **"Start Streaming"** to see live camera feed with YOLO overlays!

## What You'll See

- ✅ **Live Camera Stream**: Real-time feed from USB camera
- ✅ **YOLO Overlays**: Bounding boxes, labels, confidence scores
- ✅ **Performance Metrics**: FPS, inference time, detection counts
- ✅ **Topic Status**: Real-time status of all ROS 2 topics
- ✅ **Detection List**: All detected objects with details

## Troubleshooting

### "Bridge Disconnected" Message

1. Check bridge server is running:
   ```bash
   curl http://localhost:8767/api/vision/status
   ```

2. Check ROS 2 topics are publishing:
   ```bash
   ros2 topic list | grep -E "(camera|detections)"
   ```

3. Restart bridge server if needed

### No Camera Stream

1. Check camera is detected:
   ```bash
   ls -l /dev/video*
   ros2 topic hz /camera/image_raw
   ```

2. Check YOLO node is running:
   ```bash
   ros2 node list | grep yolo11
   ```

### Detections Not Showing

1. Check detections topic:
   ```bash
   ros2 topic echo /detections --once
   ```

2. Lower confidence threshold in UI (try 0.3)

## Next Steps

- See [VISION_DIAGNOSTICS_INTEGRATION.md](VISION_DIAGNOSTICS_INTEGRATION.md) for detailed documentation
- Adjust detection parameters in the UI
- Monitor performance metrics in real-time
- Check topic status for troubleshooting
