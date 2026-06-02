# Vision Diagnostics Frontend Integration

## Overview

Complete integration of ROS 2 vision pipeline (camera + YOLO11 TensorRT) with the Next.js frontend diagnostics page. Provides live camera stream, YOLO detection overlays, and comprehensive diagnostic information.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│              Next.js Diagnostics Frontend               │
│              (/vision-diagnostics page)                   │
└───────────────────────┬─────────────────────────────────┘
                        │ HTTP API (port 3000)
┌───────────────────────▼─────────────────────────────────┐
│              Next.js API Routes                          │
│  - /api/vision/camera                                    │
│  - /api/vision/visualization                            │
│  - /api/vision/detections                                │
│  - /api/vision/status                                    │
│  - /api/vision/diagnostics                               │
└───────────────────────┬─────────────────────────────────┘
                        │ HTTP Proxy (port 8767)
┌───────────────────────▼─────────────────────────────────┐
│              Python HTTP Bridge Server                   │
│              (vision_diagnostics_bridge.py)              │
│  - Subscribes to ROS 2 vision topics                     │
│  - Exposes REST API endpoints                            │
│  - Converts ROS messages to JSON/JPEG                    │
└───────────────────────┬─────────────────────────────────┘
                        │ ROS 2 Topics
┌───────────────────────▼─────────────────────────────────┐
│              ROS 2 Vision Pipeline                       │
│  ┌──────────────────────────────────────────────────┐  │
│  │ Camera Node (v4l2_camera)                       │  │
│  │  → /camera/image_raw                            │  │
│  └───────────────────┬──────────────────────────────┘  │
│                      │                                  │
│  ┌───────────────────▼──────────────────────────────┐  │
│  │ YOLO11 Node (TensorRT)                           │  │
│  │  ← /camera/image_raw                            │  │
│  │  → /detections (vision_msgs/Detection2DArray)   │  │
│  │  → /detections/visualization (sensor_msgs/Image)│  │
│  └──────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

## Components

### 1. Python HTTP Bridge Server

**Location**: `ros2_packages/zip_vision/src/vision_diagnostics_bridge.py`

**Features**:
- Subscribes to ROS 2 vision topics:
  - `/camera/image_raw` (sensor_msgs/Image)
  - `/detections` (vision_msgs/Detection2DArray)
  - `/detections/visualization` (sensor_msgs/Image)
  - `/scene_description` (std_msgs/String)
- Exposes HTTP REST API:
  - `GET /api/vision/camera` - Latest camera image (JPEG)
  - `GET /api/vision/visualization` - Latest visualization with overlays (JPEG)
  - `GET /api/vision/detections` - Latest detections (JSON)
  - `GET /api/vision/status` - Topic status and statistics (JSON)
  - `GET /api/vision/config` - YOLO configuration (JSON)
- Thread-safe message caching
- Automatic FPS calculation from detection history
- CORS headers for browser access

**Usage**:
```bash
# Direct execution
python3 ros2_packages/zip_vision/src/vision_diagnostics_bridge.py --port 8767 --host localhost

# Via launch file
ros2 launch zip_vision vision_diagnostics_bridge.launch.py port:=8767 host:=localhost
```

### 2. Next.js API Routes

**Location**: `app/api/vision/`

**Routes**:
- `camera/route.ts` - Proxies camera image from bridge
- `visualization/route.ts` - Proxies visualization image from bridge
- `detections/route.ts` - Proxies detections JSON from bridge
- `status/route.ts` - Proxies status JSON from bridge
- `diagnostics/route.ts` - Main diagnostics endpoint (config + status)

**Configuration**:
- Bridge URL configurable via `VISION_BRIDGE_URL` environment variable
- Default: `http://localhost:8767`
- Falls back to mock data if bridge unavailable

### 3. Frontend Diagnostics Page

**Location**: `app/vision-diagnostics/page.tsx`

**Features**:
- **Live Camera Stream**: Real-time camera feed with YOLO overlays
- **Display Modes**: Toggle between raw camera and visualization with overlays
- **Detection Visualization**: Bounding boxes, labels, confidence scores
- **Performance Metrics**: FPS, inference time, detection counts
- **Topic Status**: Real-time status of all ROS 2 topics
- **Configuration Controls**: Adjustable confidence/NMS thresholds
- **Bridge Connection Status**: Visual indicator of bridge connectivity

**UI Components**:
- Camera stream display (aspect-video, responsive)
- Detection list with confidence scores
- Performance metrics panel
- Topic status panel with active/inactive indicators
- Model configuration display
- Threshold controls (sliders)

## Setup Instructions

### 1. Build ROS 2 Package

```bash
cd ~/zip_ros2_ws
colcon build --packages-select zip_vision
source install/setup.bash
```

### 2. Start Vision Pipeline

```bash
ros2 launch zip_vision vision_pipeline.launch.py \
  yolo11_model_path:=$(realpath ~/zip_ros2_ws/src/zip_vision/models/yolo11/yolo11n_640_fp16.engine) \
  enable_vlm:=false \
  enable_diagnostics_bridge:=true
```

**Note**: The `diagnostics_bridge_node` (C++) only monitors topics. The Python HTTP bridge must be started separately.

### 3. Start HTTP Bridge Server

```bash
# Option 1: Direct execution
python3 ros2_packages/zip_vision/src/vision_diagnostics_bridge.py

# Option 2: Via launch file
ros2 launch zip_vision vision_diagnostics_bridge.launch.py

# Option 3: Custom port/host
ros2 launch zip_vision vision_diagnostics_bridge.launch.py port:=8767 host:=0.0.0.0
```

### 4. Start Next.js Frontend

```bash
# Set bridge URL (optional, defaults to localhost:8767)
export VISION_BRIDGE_URL=http://localhost:8767

# Start Next.js dev server
npm run dev
```

### 5. Access Diagnostics Page

Open browser to: `http://localhost:3000/vision-diagnostics`

## API Endpoints

### Bridge Server (Port 8767)

#### GET /api/vision/camera
Returns latest camera image as JPEG.

**Response**: `image/jpeg`

#### GET /api/vision/visualization
Returns latest visualization image with YOLO overlays as JPEG.

**Response**: `image/jpeg`

#### GET /api/vision/detections
Returns latest detections as JSON.

**Response**:
```json
{
  "detections": [
    {
      "classId": "0",
      "className": "person",
      "confidence": 0.95,
      "bbox": {
        "x": 100,
        "y": 150,
        "width": 200,
        "height": 300,
        "centerX": 200,
        "centerY": 300
      }
    }
  ],
  "header": {
    "stamp": { "sec": 1234567890, "nanosec": 0 },
    "frame_id": "camera"
  },
  "timestamp": "2026-01-12T12:00:00"
}
```

#### GET /api/vision/status
Returns status of all vision topics.

**Response**:
```json
{
  "camera": {
    "active": true,
    "last_update_seconds_ago": 0.1,
    "width": 640,
    "height": 480,
    "encoding": "bgr8"
  },
  "detections": {
    "active": true,
    "last_update_seconds_ago": 0.1,
    "current_count": 5,
    "average_count": 4.2,
    "fps": 30.5
  },
  "visualization": {
    "active": true,
    "last_update_seconds_ago": 0.1
  },
  "scene_description": {
    "active": false,
    "last_update_seconds_ago": null,
    "text": null
  }
}
```

#### GET /api/vision/config
Returns YOLO model configuration.

**Response**:
```json
{
  "success": true,
  "config": {
    "modelPath": "/opt/models/yolo11.engine",
    "inputWidth": 640,
    "inputHeight": 640,
    "confidenceThreshold": 0.5,
    "nmsThreshold": 0.4,
    "maxDetections": 100,
    "useInt8": true,
    "useFp16": true,
    "device": "GPU",
    "initialized": true,
    "numClasses": 80
  }
}
```

### Next.js API Routes (Port 3000)

All routes proxy to the bridge server and add Next.js-specific headers:
- `/api/vision/camera` → Bridge `/api/vision/camera`
- `/api/vision/visualization` → Bridge `/api/vision/visualization`
- `/api/vision/detections` → Bridge `/api/vision/detections`
- `/api/vision/status` → Bridge `/api/vision/status`
- `/api/vision/diagnostics` → Combines config + status

## Troubleshooting

### Bridge Server Not Connecting

1. **Check ROS 2 topics are publishing**:
   ```bash
   ros2 topic list
   ros2 topic echo /camera/image_raw --once
   ros2 topic echo /detections --once
   ```

2. **Check bridge server is running**:
   ```bash
   curl http://localhost:8767/api/vision/status
   ```

3. **Check bridge server logs**:
   ```bash
   # Should see subscription confirmations
   ros2 launch zip_vision vision_diagnostics_bridge.launch.py
   ```

### Camera Stream Not Displaying

1. **Check camera topic is active**:
   ```bash
   ros2 topic hz /camera/image_raw
   ```

2. **Check bridge can access camera**:
   ```bash
   curl http://localhost:8767/api/vision/camera -o test.jpg
   # Should save a JPEG image
   ```

3. **Check Next.js API proxy**:
   ```bash
   curl http://localhost:3000/api/vision/camera -o test.jpg
   ```

### Detections Not Showing

1. **Check detections topic**:
   ```bash
   ros2 topic echo /detections --once
   ```

2. **Check YOLO node is running**:
   ```bash
   ros2 node list | grep yolo11
   ```

3. **Check detection count in status**:
   ```bash
   curl http://localhost:8767/api/vision/status | jq .detections
   ```

### Performance Issues

1. **Reduce stream update rate** in `page.tsx`:
   ```typescript
   streamIntervalRef.current = setInterval(() => {
     // ... update code
   }, 200); // Change from 100ms to 200ms (5 FPS)
   ```

2. **Check bridge server CPU usage**:
   ```bash
   top -p $(pgrep -f vision_diagnostics_bridge)
   ```

3. **Reduce JPEG quality** in bridge server:
   ```python
   _, buffer = cv2.imencode('.jpg', cv_image, [cv2.IMWRITE_JPEG_QUALITY, 70])  # Lower quality
   ```

## Performance Considerations

- **Bridge Server**: Single-threaded HTTP server, handles ~10-30 requests/sec
- **Image Encoding**: JPEG encoding at 85% quality, ~50-200KB per frame
- **Frontend Polling**: Default 10 FPS (100ms interval) for stream updates
- **Status Updates**: 1 FPS (1s interval) for topic status
- **Memory**: Bridge server caches latest messages only (minimal memory usage)

## Future Enhancements

1. **WebSocket Support**: Replace polling with WebSocket for lower latency
2. **Image Compression**: Add WebP support for better compression
3. **Detection Filtering**: Client-side filtering by confidence threshold
4. **Historical Data**: Store detection history for trend analysis
5. **ROS 2 Parameter Updates**: Allow updating YOLO thresholds via ROS 2 parameters

## References

- [ROS 2 Vision Pipeline Documentation](PHASE3_HUMBLE_INTEGRATION_SUMMARY.md)
- [YOLO11 Integration](PHASE3_YOLO11_TENSORRT_INTEGRATION.md)
- [Diagnostics Integration](PHASE3_DIAGNOSTICS_INTEGRATION.md)
