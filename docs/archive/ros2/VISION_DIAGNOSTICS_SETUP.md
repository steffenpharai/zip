# Vision Diagnostics Setup - Production Configuration

## ✅ Verified Configuration

### NumPy Compatibility Fix

**Issue**: cv_bridge compiled with NumPy 1.x incompatible with NumPy 2.2.6

**Solution**: Downgraded NumPy to 1.26.4 (compatible with cv_bridge)

```bash
pip3 install --user "numpy<2.0"
```

**Status**: ✅ Fixed and verified

### Service Status

All services are running and verified:

1. **ROS 2 Vision Pipeline** ✅
   - Camera node: `/camera_node`
   - YOLO11 node: `/yolo11_node`
   - Diagnostics bridge (C++): `/diagnostics_bridge_node`
   - Topics active: `/camera/image_raw`, `/detections`, `/detections/visualization`

2. **Python HTTP Bridge Server** ✅
   - Running on: `http://localhost:8767`
   - Process: `vision_diagnostics_bridge.py`
   - Port: 8767 (listening)

3. **Next.js Frontend** ✅
   - Running on: `http://localhost:3000`
   - API proxy: Working
   - Diagnostics page: `/vision-diagnostics`

## API Endpoints Verified

### Bridge Server (Port 8767)

- ✅ `GET /api/vision/status` - HTTP 200
- ✅ `GET /api/vision/detections` - HTTP 200
- ⚠️ `GET /api/vision/camera` - HTTP 404 (no image yet, will work when camera publishes)
- ✅ `GET /api/vision/visualization` - Ready
- ✅ `GET /api/vision/config` - Ready

### Next.js Proxy (Port 3000)

- ✅ `GET /api/vision/status` - HTTP 200 (proxies to bridge)

## Testing Instructions

1. **Open Diagnostics Page**:
   ```
   http://localhost:3000/vision-diagnostics
   ```

2. **Click "Start Streaming"** to see live camera feed

3. **Monitor Status**:
   - Bridge connection indicator (top right)
   - Topic status panel (right column)
   - Performance metrics (FPS, inference time)

## Configuration Files

### NumPy Version
- **Required**: NumPy < 2.0 (currently 1.26.4)
- **Location**: User site-packages (`~/.local/lib/python3.10/site-packages/`)

### Bridge Server
- **Script**: `ros2_packages/zip_vision/src/vision_diagnostics_bridge.py`
- **Start Command**: 
  ```bash
  source /opt/ros/humble/setup.bash
  source ~/zip_ros2_ws/install/setup.bash
  python3 ros2_packages/zip_vision/src/vision_diagnostics_bridge.py --port 8767 --host localhost
  ```

### ROS 2 Launch
- **Vision Pipeline**: `ros2 launch zip_vision vision_pipeline.launch.py`
- **Bridge Server**: `ros2 launch zip_vision vision_diagnostics_bridge.launch.py`

## Troubleshooting

### If Bridge Server Fails to Start

1. Check NumPy version:
   ```bash
   python3 -c "import numpy; print(numpy.__version__)"
   ```
   Should be < 2.0

2. Reinstall NumPy if needed:
   ```bash
   pip3 install --user "numpy<2.0"
   ```

3. Verify cv_bridge:
   ```bash
   source /opt/ros/humble/setup.bash
   python3 -c "from cv_bridge import CvBridge; print('OK')"
   ```

### If Camera Not Showing

1. Check camera topic:
   ```bash
   ros2 topic hz /camera/image_raw
   ```

2. Check YOLO node:
   ```bash
   ros2 node list | grep yolo11
   ```

3. Check bridge receives messages:
   ```bash
   curl http://localhost:8767/api/vision/status | jq .camera
   ```

## Best Practices

1. **Always source ROS 2 environment** before running bridge:
   ```bash
   source /opt/ros/humble/setup.bash
   source ~/zip_ros2_ws/install/setup.bash
   ```

2. **Use system Python packages** for ROS 2 compatibility

3. **Monitor bridge logs**:
   ```bash
   tail -f /tmp/vision_bridge_final.log
   ```

4. **Check service health**:
   ```bash
   curl http://localhost:8767/api/vision/status
   ```

## Production Notes

- Bridge server runs in background (daemon thread)
- HTTP server handles CORS automatically
- Image encoding uses JPEG quality 85%
- Status updates every 1 second in frontend
- Stream updates at ~10 FPS (100ms interval)
