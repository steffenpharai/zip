# Docker YOLOE-11 Architecture Documentation

Complete architecture overlay of the ZIP Robot application with YOLOE-11 Prompt-Free vision system integration.

**Simplified Architecture**: This setup uses Ultralytics YOLO11 API with a lightweight Python ROS node, replacing the complex C++ implementation for easier maintenance and better performance on Jetson Orin Nano 8GB.

## Table of Contents

1. [System Overview](#system-overview)
2. [Docker Services Architecture](#docker-services-architecture)
3. [YOLOE Vision Pipeline](#yoloe-vision-pipeline)
4. [Data Flow](#data-flow)
5. [Component Details](#component-details)
6. [API Endpoints](#api-endpoints)
7. [Configuration](#configuration)
8. [Deployment](#deployment)

---

## System Overview

The ZIP Robot is a multi-service Docker application with three main services:

```
┌─────────────────────────────────────────────────────────────────────┐
│                         ZIP Application                            │
│                    (Docker Compose Network)                        │
└─────────────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
        ▼                     ▼                     ▼
┌───────────────┐    ┌───────────────┐    ┌──────────────────────┐
│   zip-app     │    │ robot-bridge   │    │   vision-service     │
│  (Next.js)    │    │  (Node.js)     │    │  (ROS 2 + YOLOE)     │
│  Port: 3000   │    │  WS: 8765      │    │  HTTP: 8767          │
│               │    │  HTTP: 8766    │    │  Camera: /dev/video0 │
└───────────────┘    └───────────────┘    └────────────────────use ──┘
        │                     │                     │
        │ HTTP                │ Serial              │ ROS 2 Topics
        │                     │                     │
        ▼                     ▼                     ▼
┌───────────────┐    ┌───────────────┐    ┌──────────────────────┐
│   Browser      │    │  Arduino      │    │   Camera + GPU       │
│  (Frontend)    │    │  (Firmware)   │    │   (TensorRT)         │
└───────────────┘    └───────────────┘    └──────────────────────┘
```

---

## Docker Services Architecture

### Service Network Topology

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Docker Network: zip-network                      │
│                         (Bridge Network)                            │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│  Service 1: zip-app (Next.js Frontend)                              │
│  ────────────────────────────────────────────────────────────────  │
│  Container: zip-app-dev                                             │
│  Image: zip-app:dev                                                  │
│  Ports: 3000:3000 (HTTP)                                            │
│  Volumes:                                                           │
│    - ./:/app (source code, hot reload)                              │
│    - zip-app-node-modules:/app/node_modules                         │
│    - zip-app-next-cache:/app/.next                                  │
│  Environment:                                                       │
│    - NEXT_PUBLIC_ROBOT_BRIDGE_WS_URL=ws://robot-bridge:8765/robot  │
│    - NEXT_PUBLIC_VISION_BRIDGE_URL=http://vision-service:8767       │
│    - VISION_BRIDGE_URL=http://vision-service:8767                  │
│  Dependencies: robot-bridge                                         │
│  Health: GET /api/health                                            │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              │ HTTP (proxy)
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Service 2: robot-bridge (WebSocket ↔ Serial Bridge)                 │
│  ────────────────────────────────────────────────────────────────  │
│  Container: robot-bridge-dev                                        │
│  Image: robot-bridge:dev                                            │
│  Ports: 8765:8765 (WebSocket), 8766:8766 (HTTP)                     │
│  Volumes:                                                           │
│    - ./robot/bridge/zip-robot-bridge:/app (source code)             │
│  Devices: /dev/ttyUSB0, /dev/ttyACM0, /dev/ttyS0, etc.             │
│  Privileged: true (for serial port access)                         │
│  Health: GET /health                                                │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              │ Serial (115200 baud)
                              ▼
                    ┌──────────────────┐
                    │  Arduino Firmware │
                    │  (ELEGOO Robot)   │
                    └──────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│  Service 3: vision-service (ROS 2 + YOLOE-11 Prompt-Free)          │
│  ────────────────────────────────────────────────────────────────  │
│  Container: vision-service-dev                                      │
│  Image: ultralytics/ultralytics:latest-jetson-jetpack6              │
│  Base: Ultralytics Jetson image (pre-configured with PyTorch/CUDA/  │
│        TensorRT/Ultralytics)                                        │
│  Ports: 8767:8767 (HTTP diagnostics bridge API)                      │
│  Volumes:                                                           │
│    - ./ros2_packages:/workspace/ros2_packages:ro (ROS 2 packages)  │
│    - ./ros2_packages/zip_vision/models:/workspace/models            │
│    - vision-workspace:/workspace (runtime data)                     │
│  Devices: /dev/video0:/dev/video0 (camera)                          │
│  Runtime: nvidia (GPU access)                                       │
│  Privileged: true (for camera access)                              │
│  Environment:                                                       │
│    - YOLOE_MODEL_PATH=/workspace/models/yoloe-11l-seg-pf.engine     │
│    - ROS_DOMAIN_ID=0                                                │
│  Health: GET /api/vision/status                                     │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              │ ROS 2 Topics
                              ▼
                    ┌──────────────────┐
                    │  Camera + GPU     │
                    │  (TensorRT)       │
                    └──────────────────┘
```

---

## YOLOE Vision Pipeline

### ROS 2 Node Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                    ROS 2 Vision Pipeline                            │
│                  (Inside vision-service container)                 │
└─────────────────────────────────────────────────────────────────────┘

┌──────────────────┐
│  Camera Node     │  (v4l2_camera_node)
│  ──────────────  │
│  Input: /dev/video0                                                 │
│  Output: /camera/image_raw (sensor_msgs/Image)                      │
│  Format: RGB8, 640x480                                              │
└────────┬─────────┘
         │
         │ Image stream
         ▼
┌──────────────────┐
│  YOLOE-11 Node   │  (yoloe_ros_node.py - Python)
│  ──────────────  │
│  Input: /camera/image_raw                                           │
│  Output: /detections (vision_msgs/Detection2DArray)                │
│  Output: /detections/visualization (sensor_msgs/Image)              │
│  Model: YOLOE-11L-seg-pf (TensorRT FP16 or PyTorch .pt)             │
│  Engine: yoloe-11l-seg-pf.engine (~26-32M params)                   │
│  API: Ultralytics YOLO11 (native postprocessing, no custom parsing) │
│  Inference: ~14-20ms (50-70 FPS at imgsz=416)                      │
│  GPU Memory: ~500-700MB TensorRT context                           │
└────────┬─────────┘
         │
         │ Detections + Visualization
         ▼
┌──────────────────┐
│  Diagnostics     │  (vision_diagnostics_bridge - Python)
│  Bridge Node      │
│  ──────────────   │
│  Subscribes:                                                       │
│    - /camera/image_raw                                             │
│    - /detections                                                   │
│    - /detections/visualization                                     │
│    - /scene_description                                            │
│  HTTP Server: Port 8767                                            │
│  Endpoints: /api/vision/*                                          │
└────────┬─────────┘
         │
         │ HTTP REST API
         ▼
┌──────────────────┐
│  Next.js API      │  (app/api/vision/*)
│  Routes           │
│  ──────────────   │
│  Proxies to bridge: http://vision-service:8767                    │
│  Routes:                                                           │
│    - /api/vision/detections                                        │
│    - /api/vision/status                                            │
│    - /api/vision/visualization                                     │
│    - /api/vision/camera                                            │
│    - /api/vision/diagnostics                                       │
└────────┬─────────┘
         │
         │ HTTP Response
         ▼
┌──────────────────┐
│  Frontend         │  (app/vision-diagnostics/page.tsx)
│  ──────────────   │
│  Displays:                                                         │
│    - Live camera stream                                            │
│    - Detection overlays (bounding boxes)                          │
│    - Performance metrics (FPS, inference time)                    │
│    - Topic status                                                  │
└──────────────────┘
```

### YOLOE-11 Prompt-Free Model Details

**Model**: YOLOE-11L-seg-pf (Prompt-Free)
- **Parameters**: ~26-32M (lighter than v8L's 51.5M)
- **Input Size**: 416x416 (optimized for speed) or 640x640 (for accuracy)
- **Architecture**: Re-parameterized to standard YOLO11 (zero overhead)
- **Output Format**: Standard YOLO11 format (handled natively by Ultralytics)
  - No custom 37-feature parsing needed
  - Native postprocessing (NMS/confidence handled by Ultralytics)
  - Supports segmentation masks
- **TensorRT Engine**: FP16 precision (exported via Ultralytics)
- **Performance**: ~14-20ms inference time (~50-70 FPS at imgsz=416)
- **GPU Memory**: ~500-700MB TensorRT context (lower than v8L)

**Key Advantages over YOLOE-v8L**:
- Lighter model (~26-32M vs 51.5M parameters)
- Faster inference (~50-70 FPS vs ~35 FPS)
- Lower memory footprint (~500-700MB vs ~700-800MB)
- No custom C++ parsing needed (uses Ultralytics native API)
- Easier TensorRT export (native Ultralytics support)
- Prompt-free mode (autonomous detection, no CLIP calls)

---

## Data Flow

### Complete Detection Pipeline

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Detection Flow                              │
└─────────────────────────────────────────────────────────────────────┘

1. Camera Capture
   ───────────────
   /dev/video0 (USB Camera)
   │
   ▼
   v4l2_camera_node (ROS 2)
   │
   ▼
   /camera/image_raw (sensor_msgs/Image, RGB8, 640x480)
   │
   │
2. YOLOE-11 Inference
   ───────────────────
   yoloe_ros_node.py (Python ROS 2 node using Ultralytics API)
   │
   ├─► Preprocessing: Handled by Ultralytics (resize to imgsz, normalize)
   │
   ├─► TensorRT Engine: yoloe-11l-seg-pf.engine (or .pt for PyTorch)
   │   ├─► Input: 1x3x416x416 (FP16, or 640x640 for accuracy)
   │   ├─► Inference: ~14-20ms on GPU (at imgsz=416)
   │   └─► Output: Standard YOLO11 format (handled by Ultralytics)
   │
   ├─► Postprocessing (handled natively by Ultralytics):
   │   ├─► Native NMS and confidence filtering
   │   ├─► No custom parsing needed (standard YOLO11 format)
   │   ├─► Automatic class mapping
   │   └─► Convert to ROS 2 Detection2DArray format
   │
   ▼
   /detections (vision_msgs/Detection2DArray)
   │
   ├─► Detection fields:
   │   ├─► header (timestamp, frame_id)
   │   ├─► detections[]:
   │   │   ├─► bbox (center_x, center_y, size_x, size_y)
   │   │   ├─► results[]:
   │   │   │   ├─► class_id (0-31 for YOLOE-v8L)
   │   │   │   └─► score (confidence: 0.0-1.0)
   │   │   └─► id (unique detection ID)
   │
   └─► /detections/visualization (sensor_msgs/Image)
       └─► Annotated image with bounding boxes and labels
   │
   │
3. Diagnostics Bridge
   ──────────────────
   vision_diagnostics_bridge.py (Python ROS 2 node + HTTP server)
   │
   ├─► Subscribes to ROS 2 topics (thread-safe caching)
   │
   ├─► HTTP Server (Port 8767):
   │   ├─► GET /api/vision/detections → JSON detections
   │   ├─► GET /api/vision/status → Topic status + stats
   │   ├─► GET /api/vision/visualization → JPEG image
   │   ├─► GET /api/vision/camera → Raw camera JPEG
   │   └─► GET /api/vision/config → YOLOE configuration
   │
   ▼
   HTTP Response (JSON/JPEG)
   │
   │
4. Next.js API Proxy
   ─────────────────
   app/api/vision/*/route.ts
   │
   ├─► Receives HTTP request from frontend
   ├─► Forwards to vision-service:8767
   ├─► Returns response to client
   └─► Fallback to mock data if bridge unavailable
   │
   ▼
   HTTP Response to Browser
   │
   │
5. Frontend Display
   ────────────────
   app/vision-diagnostics/page.tsx
   │
   ├─► Fetches detections: GET /api/vision/detections
   ├─► Fetches visualization: GET /api/vision/visualization
   ├─► Fetches status: GET /api/vision/status
   │
   ├─► Renders:
   │   ├─► Live camera stream (canvas)
   │   ├─► Detection overlays (bounding boxes, labels)
   │   ├─► Performance metrics (FPS, inference time)
   │   └─► Topic status indicators
   │
   └─► Updates every 100ms (configurable)
```

### Message Format Examples

**ROS 2 Detection2DArray**:
```json
{
  "header": {
    "stamp": {"sec": 1234567890, "nanosec": 123456789},
    "frame_id": "camera_frame"
  },
  "detections": [
    {
      "id": "det_0",
      "bbox": {
        "center": {"x": 320.5, "y": 240.2},
        "size_x": 150.0,
        "size_y": 200.0
      },
      "results": [
        {
          "class_id": "5",
          "class_name": "cat",
          "score": 0.92
        }
      ]
    }
  ]
}
```

**HTTP API Response** (`/api/vision/detections`):
```json
{
  "detections": [
    {
      "class_id": "5",
      "class_name": "cat",
      "confidence": 0.92,
      "bbox": {
        "x": 245.5,
        "y": 140.2,
        "width": 150.0,
        "height": 200.0,
        "centerX": 320.5,
        "centerY": 240.2
      }
    }
  ],
  "header": {
    "stamp": {"sec": 1234567890, "nanosec": 123456789},
    "frame_id": "camera_frame"
  },
  "timestamp": "2026-01-18T22:30:00.123Z",
  "image_width": 640,
  "image_height": 480
}
```

---

## Component Details

### 1. Camera Node (v4l2_camera_node)

**Location**: ROS 2 package (included in jetson-containers base image)

**Configuration**:
- Device: `/dev/video0`
- Format: RGB8
- Resolution: 640x480
- Topic: `/camera/image_raw`
- QoS: RELIABLE

**Launch**: `ros2_packages/zip_vision/launch/camera.launch.py`

### 2. YOLOE Node (yoloe_node)

**Location**: `ros2_packages/zip_vision/src/yoloe_node.cpp`

**Key Features**:
- C++ ROS 2 node for high performance
- TensorRT engine loading and inference
- Dynamic feature detection (37 vs 84 features)
- Objectness score handling for YOLOE-v8L
- Memory-aware buffer allocation
- GPU memory pre-checks

**Configuration** (`ros2_packages/zip_vision/config/yoloe_params.yaml`):
```yaml
model_path: "/workspace/ros2_packages/zip_vision/models/yoloe/yoloe-v8l-seg-pf_640_fp16.engine"
confidence_threshold: 0.75
nms_threshold: 0.5
input_width: 640
input_height: 640
workspace_size_mb: 4096
use_int8: false
use_fp16: true
```

**Topics**:
- Subscribes: `/camera/image_raw`
- Publishes: `/detections`, `/detections/visualization`

### 3. YOLOE Engine (yoloe_engine.cpp)

**Location**: `ros2_packages/zip_vision/src/yoloe_engine.cpp`

**Key Functions**:
- `loadEngine()`: Load TensorRT engine file
- `allocateBuffers()`: GPU memory-aware buffer allocation
- `preprocess()`: Image preprocessing (resize, normalize)
- `infer()`: TensorRT inference execution
- `postprocess()`: Parse 37-feature output, apply NMS

**Memory Management**:
- Pre-checks available GPU memory before allocation
- Estimates required memory (~600-700MB per context)
- Detects model size and logs recommendations
- Handles both YOLOE-v8L (37 features) and YOLOE-11s (84 features)

### 4. Diagnostics Bridge (vision_diagnostics_bridge.py)

**Location**: `ros2_packages/zip_vision/src/vision_diagnostics_bridge.py`

**Architecture**:
- ROS 2 node (subscribes to topics)
- HTTP server (exposes REST API)
- Thread-safe message caching
- Automatic FPS calculation

**HTTP Endpoints**:
- `GET /api/vision/detections` - Latest detections (JSON)
- `GET /api/vision/status` - Topic status and statistics (JSON)
- `GET /api/vision/visualization` - Visualization image (JPEG)
- `GET /api/vision/visualization/stream` - MJPEG stream
- `GET /api/vision/camera` - Raw camera image (JPEG)
- `GET /api/vision/camera/stream` - Camera MJPEG stream
- `GET /api/vision/config` - YOLOE configuration (JSON)

**QoS Configuration**:
- Uses RELIABLE QoS to match publishers
- Depth: 10 (buffers last 10 messages)

### 5. Next.js API Routes

**Location**: `app/api/vision/*/route.ts`

**Routes**:
- `app/api/vision/detections/route.ts` - Proxies detections
- `app/api/vision/status/route.ts` - Proxies status
- `app/api/vision/visualization/route.ts` - Proxies visualization
- `app/api/vision/camera/route.ts` - Proxies camera image
- `app/api/vision/diagnostics/route.ts` - Main diagnostics endpoint

**Pattern**:
```typescript
const BRIDGE_URL = process.env.VISION_BRIDGE_URL || "http://localhost:8767";

export async function GET(request: NextRequest) {
  const response = await fetch(`${BRIDGE_URL}/api/vision/detections`);
  return NextResponse.json(await response.json());
}
```

### 6. Frontend Diagnostics Page

**Location**: `app/vision-diagnostics/page.tsx`

**Features**:
- Live camera stream (canvas rendering)
- Detection overlays (bounding boxes, labels)
- Performance metrics (FPS, inference time)
- Topic status indicators
- Configuration controls (confidence/NMS thresholds)
- Toggle between raw camera and visualization

**Update Frequency**: 100ms (configurable)

---

## API Endpoints

### Vision Diagnostics Bridge (Port 8767)

**Base URL**: `http://vision-service:8767` (internal) or `http://localhost:8767` (external)

| Endpoint | Method | Response | Description |
|----------|--------|----------|-------------|
| `/api/vision/detections` | GET | JSON | Latest detections with bounding boxes |
| `/api/vision/status` | GET | JSON | Topic status, FPS, detection counts |
| `/api/vision/visualization` | GET | JPEG | Visualization image with overlays |
| `/api/vision/visualization/stream` | GET | MJPEG | MJPEG stream of visualization |
| `/api/vision/camera` | GET | JPEG | Raw camera image |
| `/api/vision/camera/stream` | GET | MJPEG | MJPEG stream of camera |
| `/api/vision/config` | GET | JSON | YOLOE model configuration |

### Next.js API Routes (Port 3000)

**Base URL**: `http://zip-app:3000` (internal) or `http://localhost:3000` (external)

| Endpoint | Method | Response | Description |
|----------|--------|----------|-------------|
| `/api/vision/detections` | GET | JSON | Proxies to bridge `/api/vision/detections` |
| `/api/vision/status` | GET | JSON | Proxies to bridge `/api/vision/status` |
| `/api/vision/visualization` | GET | JPEG | Proxies to bridge `/api/vision/visualization` |
| `/api/vision/camera` | GET | JPEG | Proxies to bridge `/api/vision/camera` |
| `/api/vision/diagnostics` | GET | JSON | Combined config + status |
| `/api/vision/diagnostics` | POST | JSON | Update configuration or run inference |

---

## Configuration

### Docker Compose Environment Variables

**vision-service**:
```yaml
YOLOE_MODEL_PATH: /workspace/models/yoloe-11l-seg-pf.engine
ROS_DOMAIN_ID: 0
VISION_SERVICE_MODE: both
```

**zip-app**:
```yaml
NEXT_PUBLIC_VISION_BRIDGE_URL: http://vision-service:8767
VISION_BRIDGE_URL: http://vision-service:8767
```

### YOLOE Node Parameters

**File**: `ros2_packages/zip_vision/config/yoloe_params.yaml`

```yaml
model_path: "/workspace/ros2_packages/zip_vision/models/yoloe/yoloe-v8l-seg-pf_640_fp16.engine"
confidence_threshold: 0.75  # 75% confidence required
nms_threshold: 0.5           # Non-Maximum Suppression threshold
input_width: 640
input_height: 640
workspace_size_mb: 4096
use_int8: false
use_fp16: true
num_classes: 32              # YOLOE-v8L has 32 classes
```

### Launch File Arguments

**File**: `ros2_packages/zip_vision/launch/vision_pipeline.launch.py`

```python
yoloe_model_path: "/workspace/models/yoloe-11l-seg-pf.engine"
enable_yoloe: true
enable_vlm: false
enable_diagnostics_bridge: true
yoloe_confidence_threshold: 0.2  # Lower for household rare items
yoloe_nms_threshold: 0.45
device_id: "0"  # Camera device ID
```

---

## Migration from YOLOE-v8L C++ Implementation

### What Changed

**Before (Complex C++ Implementation)**:
- Base: `dustynv/ros:humble-desktop-l4t-r36.4.0` (jetson-containers)
- Node: C++ `yoloe_node` with custom TensorRT handling
- Manual postprocessing: 37-feature parsing, objectness handling
- Manual TensorRT export: `trtexec` commands
- Memory: ~700-800MB per context
- FPS: ~35 FPS

**After (Simplified Python Implementation)**:
- Base: `ultralytics/ultralytics:latest-jetson-jetpack6` (Ultralytics Jetson image)
- Node: Python `yoloe_ros_node.py` using Ultralytics YOLO11 API
- Native postprocessing: Handled by Ultralytics (no custom parsing)
- Native TensorRT export: `yolo export` command
- Memory: ~500-700MB TensorRT context
- FPS: ~50-70 FPS (at imgsz=416)

### Migration Steps

1. **Pull Ultralytics Base Image**:
   ```bash
   docker pull ultralytics/ultralytics:latest-jetson-jetpack6
   ```

2. **Download YOLOE-11 Prompt-Free Model**:
   - Visit https://huggingface.co/jameslahm/yoloe
   - Download `yoloe-11l-seg-pf.pt`
   - Place in `./ros2_packages/zip_vision/models/yoloe-11l-seg-pf.pt`

3. **Export TensorRT Engine** (optional, can use .pt directly):
   ```bash
   docker compose -f docker-compose.dev.yml run --rm vision-service \
     bash -c "yolo export model=/workspace/models/yoloe-11l-seg-pf.pt format=engine imgsz=416 half=True device=0"
   ```

4. **Update Environment Variables**:
   ```bash
   export YOLOE_MODEL_PATH=/workspace/models/yoloe-11l-seg-pf.engine
   # or use .pt directly:
   export YOLOE_MODEL_PATH=/workspace/models/yoloe-11l-seg-pf.pt
   ```

5. **Start Services**:
   ```bash
   docker compose -f docker-compose.dev.yml up -d vision-service
   ```

### Benefits

- **Simpler Codebase**: No custom C++ parsing, easier debugging
- **Better Performance**: Higher FPS, lower memory
- **Easier Maintenance**: Python debugging, fewer version issues
- **Native TensorRT**: Ultralytics handles export automatically
- **Prompt-Free**: Autonomous detection, no CLIP calls

## Deployment

### Starting Services

**All services**:
```bash
docker compose -f docker-compose.dev.yml up -d
```

**Individual services**:
```bash
docker compose -f docker-compose.dev.yml up -d vision-service
docker compose -f docker-compose.dev.yml up -d zip-app
docker compose -f docker-compose.dev.yml up -d robot-bridge
```

### Downloading and Exporting YOLOE-11 Model

**1. Download YOLOE-11 Prompt-Free Weights**:
```bash
# Download from HuggingFace
# Go to https://huggingface.co/jameslahm/yoloe
# Get yoloe-11l-seg-pf.pt (or M/S variants for testing)
# Place in: ./ros2_packages/zip_vision/models/yoloe-11l-seg-pf.pt
```

**2. Export TensorRT Engine** (inside container, recommended for compatibility):
```bash
docker compose -f docker-compose.dev.yml run --rm vision-service \
  bash -c "cd /workspace && \
  yolo export model=/workspace/models/yoloe-11l-seg-pf.pt \
    format=engine \
    imgsz=416 \
    half=True \
    int8=False \
    device=0"
```

**Alternative: Use PyTorch weights directly** (no export needed):
```bash
# Just use .pt file directly - Ultralytics will handle inference
# Set YOLOE_MODEL_PATH=/workspace/models/yoloe-11l-seg-pf.pt
```

### Verifying Deployment

**Check services**:
```bash
docker compose -f docker-compose.dev.yml ps
```

**Check vision service logs**:
```bash
docker compose -f docker-compose.dev.yml logs vision-service
```

**Test API endpoints**:
```bash
# Status
curl http://localhost:8767/api/vision/status | jq

# Detections
curl http://localhost:8767/api/vision/detections | jq

# Visualization
curl http://localhost:8767/api/vision/visualization -o visualization.jpg
```

**Check ROS 2 topics**:
```bash
docker compose -f docker-compose.dev.yml exec vision-service \
  bash -c "source /opt/ros/humble/install/setup.bash && \
  source /workspace/install/setup.bash && \
  ros2 topic list"
```

### Accessing Frontend

**URL**: http://localhost:3000/vision-diagnostics

**Features**:
- Live camera stream
- Detection overlays
- Performance metrics
- Topic status

---

## Performance Characteristics

### YOLOE-v8L Performance

- **Inference Time**: ~26-28ms (mean)
- **Throughput**: ~35 FPS
- **GPU Memory**: ~700-800MB per execution context
- **Engine Size**: 92MB (FP16)
- **Model Parameters**: 51.5M

### System Resource Usage

**vision-service container**:
- CPU: 2-4 cores (during inference)
- Memory: 1.5-2.5GB (shared CPU/GPU memory on Jetson, reduced with simplified Python node)
- GPU: ~500-700MB TensorRT context (lower than previous C++ implementation)

**zip-app container**:
- CPU: 0.5-2 cores
- Memory: 512MB-2GB

**robot-bridge container**:
- CPU: 0.25-1 core
- Memory: 128MB-512MB

---

## Troubleshooting

### Common Issues

1. **TensorRT Version Mismatch**
   - Error: "Engine plan file is not compatible"
   - Solution: Rebuild engine with container's TensorRT version

2. **GPU Out of Memory**
   - Error: "out of memory" during inference
   - Solution: Reduce `CUDA_MEMORY_FRACTION` or use smaller model

3. **Camera Not Found**
   - Error: "Failed to open camera"
   - Solution: Check `/dev/video0` exists and is mounted in container

4. **No Detections**
   - Check: Confidence threshold may be too high
   - Check: Camera is providing images
   - Check: YOLOE node is running (check logs)

5. **Bridge Not Responding**
   - Check: Container is running
   - Check: Port 8767 is accessible
   - Check: ROS 2 topics are publishing

---

## Summary

The ZIP Robot application uses a three-service Docker architecture:

1. **zip-app**: Next.js frontend with vision diagnostics UI
2. **robot-bridge**: WebSocket bridge for robot communication
3. **vision-service**: ROS 2 pipeline with YOLOE-v8L TensorRT inference

YOLOE integrates seamlessly through:
- ROS 2 topics for real-time detection streaming
- HTTP bridge for frontend integration
- Next.js API routes for proxying
- Frontend visualization with live overlays

The system is optimized for Jetson Orin Nano 8GB with shared CPU/GPU memory, using FP16 TensorRT engines for efficient inference at ~35 FPS.
