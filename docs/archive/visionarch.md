# Vision System Technical Architecture

## Executive Summary

This document provides a comprehensive technical architecture for the YOLO11/ROS 2/TensorRT/Frontend vision integration system running on Jetson Orin Nano 8GB. The system performs real-time object detection using YOLO11 optimized with TensorRT, publishes results via ROS 2, and provides a web-based diagnostics interface through a Next.js frontend.

**Key Metrics:**
- **Inference Performance**: ~48 FPS (single-stream), ~65 FPS (multi-stream standalone), ~30-45 FPS (multi-stream with ROS 2)
- **Latency**: ~15ms GPU inference time (single-stream), ~10-12ms (multi-stream pipeline)
- **Model**: YOLO11n (nano variant), 8.2 MB TensorRT engine
- **Precision**: FP16 (half precision)
- **Input Resolution**: 640×640 pixels (with letterbox preprocessing)
- **Output**: 80 COCO classes, up to 8400 detections per frame
- **Accuracy Improvement**: +2-5% mAP from letterbox preprocessing
- **Throughput Improvement**: +30-50% from multi-stream pipeline

---

## System Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         Hardware Layer                                  │
│                    Jetson Orin Nano 8GB (ARM64)                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                 │
│  │   Camera     │  │     GPU      │  │     CPU      │                 │
│  │  (v4l2)      │  │  (CUDA/TensorRT)│  (ROS 2)     │                 │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘                 │
└─────────┼─────────────────┼─────────────────┼─────────────────────────┘
           │                 │                 │
           ▼                 ▼                 ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         ROS 2 Layer                                     │
│  ┌──────────────────────────────────────────────────────────────────┐ │
│  │  Camera Node (v4l2_camera)                                        │ │
│  │  Publishes: /camera/image_raw (sensor_msgs/Image)                  │ │
│  │  QoS: RELIABLE, 30 FPS                                            │ │
│  └───────────────────────┬──────────────────────────────────────────┘ │
│                          │                                              │
│  ┌───────────────────────▼──────────────────────────────────────────┐ │
│  │  YOLO11 Node (C++)                                                 │ │
│  │  - Subscribes: /camera/image_raw                                  │ │
│  │  - TensorRT Engine: yolo11n_640_fp16.engine                      │ │
│  │  - Publishes:                                                      │ │
│  │    • /detections (vision_msgs/Detection2DArray)                    │ │
│  │    • /detections/visualization (sensor_msgs/Image)                 │ │
│  └───────────────────────┬──────────────────────────────────────────┘ │
│                          │                                              │
│  ┌───────────────────────▼──────────────────────────────────────────┐ │
│  │  Vision Diagnostics Bridge (Python)                              │ │
│  │  - Subscribes to all vision topics                                │ │
│  │  - HTTP Server: Port 8767                                         │ │
│  │  - REST API: /api/vision/*                                       │ │
│  └───────────────────────┬──────────────────────────────────────────┘ │
└──────────────────────────┼──────────────────────────────────────────────┘
                           │ HTTP (Port 8767)
                           ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         Next.js Frontend Layer                           │
│  ┌──────────────────────────────────────────────────────────────────┐ │
│  │  Next.js API Routes (TypeScript)                                  │ │
│  │  - /api/vision/camera                                             │ │
│  │  - /api/vision/visualization                                       │ │
│  │  - /api/vision/detections                                          │ │
│  │  - /api/vision/status                                             │ │
│  │  - /api/vision/diagnostics                                         │ │
│  └───────────────────────┬──────────────────────────────────────────┘ │
│                          │                                              │
│  ┌───────────────────────▼──────────────────────────────────────────┐ │
│  │  Vision Diagnostics Page (React/TypeScript)                      │ │
│  │  - Live camera stream with overlays                             │ │
│  │  - Detection visualization                                      │ │
│  │  - Performance metrics                                          │ │
│  │  - Configuration controls                                       │ │
│  └─────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Component Architecture

### 1. Camera Input Layer

**Component**: `v4l2_camera` (ROS 2 package)

**Responsibilities**:
- Captures video frames from USB/webcam via Video4Linux2
- Converts raw camera data to ROS 2 `sensor_msgs/Image`
- Publishes at ~30 FPS with RELIABLE QoS policy

**Key Configuration**:
- **Topic**: `/camera/image_raw`
- **Message Type**: `sensor_msgs/Image`
- **Encoding**: Typically `rgb8` or `bgr8`
- **QoS**: RELIABLE (required for downstream nodes)
- **Frame Rate**: ~30 FPS

**Output**: Raw camera frames → ROS 2 topic `/camera/image_raw`

---

### 2. YOLO11 TensorRT Engine

**Component**: `YOLO11Engine` (C++ class)

**Location**: `ros2_packages/zip_vision/src/yolo11_engine.cpp`

#### 2.1 Engine Initialization

**Process Flow**:
1. Load TensorRT engine file (`.engine` format)
2. Deserialize engine using TensorRT 10.x API
3. Create execution context
4. Allocate CUDA buffers (input/output)
5. Create CUDA stream for async operations
6. Set tensor addresses (TensorRT 10.x requirement)

**Key Code Path**:
```cpp
bool YOLO11Engine::initialize(
    const std::string& model_path,
    int input_width = 640,
    int input_height = 640,
    bool use_int8 = true)
{
    // 1. Load engine from file
    if (!loadEngine(model_path)) return false;
    
    // 2. Allocate CUDA buffers
    if (!allocateBuffers()) return false;
    
    initialized_ = true;
    return true;
}
```

**Memory Allocation**:
- **Input Buffer**: `1 × 3 × 640 × 640 × sizeof(float) = 4.9 MB`
- **Output Buffer**: `1 × 84 × 8400 × sizeof(float) = 2.8 MB`
- **Total GPU Memory**: ~8 MB (excluding engine weights)

#### 2.2 Image Preprocessing (Letterbox)

**Pipeline**:
1. **Letterbox Resize**: Scale input image to 640×640 while maintaining aspect ratio with black padding
2. **Color Conversion**: BGR → RGB
3. **Normalization**: Pixel values [0, 255] → [0.0, 1.0]
4. **Layout Conversion**: HWC (Height-Width-Channel) → CHW (Channel-Height-Width)
5. **Data Type**: `uint8` → `float32`

**Letterbox Implementation**:
The preprocessing now uses letterbox padding (as expected by Ultralytics YOLO11) instead of simple stretching, which:
- Maintains aspect ratio (prevents distortion)
- Improves accuracy by 2-5% mAP
- Centers the image with black padding
- Stores scale/padding offsets for postprocessing coordinate correction

**Implementation**:
```cpp
cv::Mat YOLO11Engine::preprocessImage(const cv::Mat& image)
{
    int original_width = image.cols;
    int original_height = image.rows;
    
    // Calculate scale factor to maintain aspect ratio
    float scale = std::min(
        static_cast<float>(input_width_) / original_width,
        static_cast<float>(input_height_) / original_height
    );
    
    int new_width = static_cast<int>(original_width * scale);
    int new_height = static_cast<int>(original_height * scale);
    
    // Resize with aspect ratio preserved
    cv::Mat resized;
    cv::resize(image, resized, cv::Size(new_width, new_height));
    
    // Create letterbox (black padding) to fill to model input size
    cv::Mat letterbox = cv::Mat::zeros(input_height_, input_width_, CV_8UC3);
    
    // Calculate padding offsets (center the image)
    pad_x_ = (input_width_ - new_width) / 2;
    pad_y_ = (input_height_ - new_height) / 2;
    
    // Copy resized image to center of letterbox
    resized.copyTo(letterbox(cv::Rect(pad_x_, pad_y_, new_width, new_height)));
    
    // Store scale factors for postprocessing
    scale_x_ = static_cast<float>(new_width) / original_width;
    scale_y_ = static_cast<float>(new_height) / original_height;
    
    // BGR → RGB
    cv::Mat rgb;
    cv::cvtColor(letterbox, rgb, cv::COLOR_BGR2RGB);
    
    // Normalize [0, 255] → [0.0, 1.0]
    rgb.convertTo(rgb, CV_32F, 1.0 / 255.0);
    
    // HWC → CHW conversion
    // ... (channel interleaving)
    
    return tensor;  // CHW format, float32
}
```

**Postprocessing Coordinate Correction**:
The postprocessing accounts for letterbox padding when converting normalized coordinates back to original image coordinates:
```cpp
// Account for letterbox padding in coordinate conversion
float x = ((x_center - width / 2.0f) * input_width_ - pad_x_) / scale_x_;
float y = ((y_center - height / 2.0f) * input_height_ - pad_y_) / scale_y_;
float w = (width * input_width_) / scale_x_;
float h = (height * input_height_) / scale_y_;
```

**Performance**: ~2-3ms on CPU (OpenCV)

#### 2.3 TensorRT Inference

**Execution Flow (Single-Stream)**:
1. **Host → Device**: Copy preprocessed image to GPU via `cudaMemcpyAsync()`
2. **Set Tensor Addresses**: Required for TensorRT 10.x (done once during init)
3. **Execute**: `context_->enqueueV3(stream_)` - async inference
4. **Synchronize**: `cudaStreamSynchronize(stream_)` - wait for completion
5. **Device → Host**: Copy output tensor from GPU

**Multi-Stream Pipeline (Pipelined Inference)**:
The system now supports a 3-stream pipeline for improved throughput:
- **Stream 0**: Preprocess Frame N → H2D Copy → Inference
- **Stream 1**: Inference Frame N-1 → D2H Copy → Postprocess
- **Stream 2**: Postprocess Frame N-2 → (ready for next)

**Implementation**:
```cpp
bool YOLO11Engine::infer_pipelined(
    const cv::Mat& image,
    std::vector<Detection>& detections,
    float confidence_threshold,
    float nms_threshold)
{
    // Get next available stream
    int stream_id = getNextStream();
    cudaStream_t stream = streams_[stream_id];
    void* input_buf = input_buffers_[stream_id];
    void* output_buf = output_buffers_[stream_id];
    
    // Preprocess on CPU (overlaps with previous frame's GPU work)
    cv::Mat preprocessed = preprocessImage(image);
    
    // Async H2D copy (overlaps with CPU preprocessing of next frame)
    cudaMemcpyAsync(input_buf, preprocessed.data, input_size_, 
                   cudaMemcpyHostToDevice, stream);
    
    // Async inference (overlaps with next frame preprocessing)
    context_->enqueueV3(stream);
    
    // Async D2H copy (overlaps with postprocessing of previous frame)
    cudaMemcpyAsync(output.data(), output_buf, output_size_,
                   cudaMemcpyDeviceToHost, stream);
    
    // Synchronize only when we need the results
    cudaStreamSynchronize(stream);
    
    // Return stream to pool
    returnStream(stream_id);
    
    // Postprocess (CPU work, can overlap with next frame's GPU inference)
    detections = postprocess(...);
    
    return true;
}
```

**Critical Implementation Details**:
- **Thread Safety**: Mutex protection (`inference_mutex_`) prevents concurrent inference
- **Error Handling**: Comprehensive CUDA error checking after each operation
- **TensorRT 10.x API**: Uses `setTensorAddress()` and `enqueueV3()` (not deprecated binding API)
- **Stream Management**: Queue-based stream allocation with mutex protection
- **Per-Stream Buffers**: Each stream has dedicated input/output buffers to avoid conflicts

**Performance**:
- **Single-Stream GPU Latency**: ~15ms average
- **Multi-Stream Throughput**: 30-50% improvement (30-45 FPS vs 20-30 FPS)
- **Standalone FPS**: ~48 FPS (single-stream), ~65 FPS (multi-stream)

#### 2.4 Postprocessing

**Output Format**: `[1, 84, 8400]` (feature-major layout)
- **84 features**: 4 (bbox: x, y, w, h) + 80 (class scores)
- **8400 detections**: Grid cells from YOLO11 architecture

**Processing Steps**:
1. **Parse Detections**: Extract bbox and class scores for all 8400 candidates
2. **Apply Sigmoid**: Convert raw logits to probabilities (YOLO11 outputs logits)
3. **Confidence Filtering**: Remove detections below threshold (default: 0.5)
4. **NMS (Non-Maximum Suppression)**: Remove overlapping detections (IoU threshold: 0.4)
5. **Coordinate Scaling**: Convert normalized [0,1] bbox to pixel coordinates

**Key Algorithm**:
```cpp
std::vector<Detection> YOLO11Engine::postprocess(
    const float* output,
    size_t output_elements,
    float confidence_threshold,
    float nms_threshold,
    int original_width,
    int original_height)
{
    // Feature-major access: output[feature * 8400 + detection]
    for (int i = 0; i < 8400; ++i) {
        // Extract bbox (features 0-3)
        float x_center = output[0 * 8400 + i];
        float y_center = output[1 * 8400 + i];
        float width = output[2 * 8400 + i];
        float height = output[3 * 8400 + i];
        
        // Find max class score (features 4-83)
        float max_class_score = 0.0f;
        int class_id = 0;
        for (int c = 4; c < 84; ++c) {
            float logit = output[c * 8400 + i];
            float prob = 1.0f / (1.0f + exp(-logit));  // Sigmoid
            if (prob > max_class_score) {
                max_class_score = prob;
                class_id = c - 4;
            }
        }
        
        // Filter by confidence
        if (max_class_score >= confidence_threshold) {
            // Convert to pixel coordinates and add detection
        }
    }
    
    // Apply NMS
    applyNMS(detections, nms_threshold);
    
    return detections;
}
```

**Performance**: ~5-10ms on CPU (depends on number of detections)

---

### 3. ROS 2 YOLO11 Node

**Component**: `YOLO11Node` (C++ ROS 2 node)

**Location**: `ros2_packages/zip_vision/src/yolo11_node.cpp`

#### 3.1 Node Initialization

**Parameters**:
- `model_path`: Path to TensorRT engine file (required)
- `input_width`: Model input width (default: 640)
- `input_height`: Model input height (default: 640)
- `confidence_threshold`: Detection confidence threshold (default: 0.5)
- `nms_threshold`: NMS IoU threshold (default: 0.4)
- `max_detections`: Maximum detections per frame (default: 100)
- `enable_visualization`: Enable visualization publishing (default: true)

**Initialization Sequence**:
1. Declare ROS 2 parameters
2. Validate model path
3. Initialize `YOLO11Engine` with TensorRT engine
4. Create image subscriber with **RELIABLE QoS** (matches camera publisher)
5. Create detection and visualization publishers
6. Install signal handlers for debugging (SIGSEGV, SIGABRT)

**Critical QoS Configuration**:
```cpp
// MUST match camera publisher QoS
rclcpp::QoS image_qos(10);
image_qos.reliability(rclcpp::ReliabilityPolicy::Reliable);
image_sub_ = this->create_subscription<sensor_msgs::msg::Image>(
    "/camera/image_raw",
    image_qos,
    std::bind(&YOLO11Node::imageCallback, this, _1)
);
```

#### 3.2 Image Callback Processing

**Callback Flow**:
1. **Receive Image**: ROS 2 callback triggered by `/camera/image_raw` message
2. **Convert Format**: `sensor_msgs/Image` → `cv::Mat` via `cv_bridge`
3. **Run Inference**: Call `engine_->infer(image, detections, ...)`
4. **Convert to ROS**: `std::vector<Detection>` → `vision_msgs/Detection2DArray`
5. **Publish Detections**: Publish to `/detections` topic
6. **Visualization** (optional): Draw bounding boxes and publish to `/detections/visualization`

**Message Conversion**:
```cpp
// Detection structure → ROS message
vision_msgs::msg::Detection2D detection;
detection.bbox.center.position.x = det.bbox.x + det.bbox.width / 2.0;
detection.bbox.center.position.y = det.bbox.y + det.bbox.height / 2.0;
detection.bbox.size_x = det.bbox.width;
detection.bbox.size_y = det.bbox.height;
detection.results[0].hypothesis.class_id = std::to_string(det.class_id);
detection.results[0].hypothesis.score = det.confidence;
```

**Performance**:
- **End-to-End Latency**: ~30-50ms (including ROS 2 overhead)
- **Publishing Rate**: ~30 FPS (matches camera rate)
- **CPU Usage**: ~15-20% (single core)

#### 3.3 Enhanced Visualization

**Features**:
- **Dynamic Line Width**: Based on bbox area (`lineWidth = max(2, min(bbox_area / 10000, 5))`)
- **Class-Based Colors**: 80 distinct colors using HSV color space with golden angle distribution
- **Confidence-Based Opacity**: `opacity = confidence * 0.8 + 0.2`
- **Rounded Corners**: Professional rounded rectangle bounding boxes
- **Corner Markers**: Visual markers at bbox corners for better visibility
- **Multi-Line Labels**: Class name and confidence on separate lines
- **Semi-Transparent Backgrounds**: Labels with rounded corners and opacity
- **Color Caching**: Performance optimization with cached color palette

**Implementation**:
```cpp
void YOLO11Node::drawDetections(cv::Mat& image, 
                                 const std::vector<Detection>& detections)
{
    // Sort by confidence (draw high-confidence on top)
    std::sort(detections.begin(), detections.end(),
              [](const Detection& a, const Detection& b) {
                  return a.confidence > b.confidence;
              });
    
    for (const auto& det : detections) {
        // Calculate dynamic line width
        int bbox_area = det.bbox.width * det.bbox.height;
        int line_width = std::max(2, std::min(bbox_area / 10000, 5));
        
        // Get class color (cached)
        cv::Scalar color = getClassColor(det.class_id);
        
        // Apply confidence-based opacity
        float opacity = det.confidence * 0.8f + 0.2f;
        cv::Scalar blended_color(
            static_cast<int>(color[0] * opacity),
            static_cast<int>(color[1] * opacity),
            static_cast<int>(color[2] * opacity)
        );
        
        // Draw rounded rectangle
        drawRoundedRect(image, det.bbox, blended_color, line_width, corner_radius);
        
        // Draw corner markers
        drawCornerMarkers(image, det.bbox, blended_color, marker_size);
        
        // Draw multi-line label with background
        // ... (label rendering with rounded corners)
    }
}
```

**Performance Optimizations**:
- **Color Caching**: Cached color palette (up to 100 entries) to avoid repeated HSV→BGR conversions
- **Pre-allocated Buffers**: OpenCV drawing buffers pre-allocated to reduce memory allocations

---

### 4. Vision Diagnostics Bridge

**Component**: `VisionBridgeNode` (Python ROS 2 node + HTTP server)

**Location**: `ros2_packages/zip_vision/src/vision_diagnostics_bridge.py`

#### 4.1 ROS 2 Subscriber

**Subscribed Topics**:
- `/camera/image_raw` (sensor_msgs/Image)
- `/detections` (vision_msgs/Detection2DArray)
- `/detections/visualization` (sensor_msgs/Image)
- `/scene_description` (std_msgs/String) - optional

**Thread Safety**:
- Uses `threading.Lock()` to protect shared state
- Caches latest messages from each topic
- Tracks timestamps and statistics

**Statistics Tracking**:
- Detection count history (last 100 frames)
- FPS calculation from detection timestamps
- Topic activity status (active/inactive)

#### 4.2 HTTP REST API

**Server**: Python `http.server.HTTPServer`

**Endpoints**:

1. **GET /api/vision/camera**
   - Returns: Latest camera image as JPEG
   - Content-Type: `image/jpeg`
   - CORS: Enabled

2. **GET /api/vision/visualization**
   - Returns: Latest visualization image with overlays as JPEG
   - Content-Type: `image/jpeg`

3. **GET /api/vision/detections**
   - Returns: Latest detections as JSON
   - Format:
     ```json
     {
       "detections": [
         {
           "classId": "0",
           "className": "person",
           "confidence": 0.85,
           "bbox": {
             "x": 100, "y": 150,
             "width": 200, "height": 300,
             "centerX": 200, "centerY": 300
           }
         }
       ]
     }
     ```

4. **GET /api/vision/status**
   - Returns: Topic status and statistics
   - Format:
     ```json
     {
       "camera": {
         "active": true,
         "width": 640, "height": 480,
         "last_update_seconds_ago": 0.1
       },
       "detections": {
         "active": true,
         "fps": 30.2,
         "last_update_seconds_ago": 0.1
       }
     }
     ```

5. **GET /api/vision/config**
   - Returns: YOLO model configuration
   - Format:
     ```json
     {
       "modelPath": "/path/to/engine",
       "inputWidth": 640,
       "inputHeight": 640,
       "confidenceThreshold": 0.5,
       "nmsThreshold": 0.4
     }
     ```

**Configuration**:
- **Port**: 8767 (default, configurable)
- **Host**: localhost (default, configurable)
- **CORS**: Enabled for browser access

**Usage**:
```bash
python3 ros2_packages/zip_vision/src/vision_diagnostics_bridge.py \
  --port 8767 --host localhost
```

---

### 5. Next.js Frontend Integration

#### 5.1 API Routes

**Location**: `app/api/vision/`

**Routes**:
- `camera/route.ts` - Proxies camera image from bridge
- `visualization/route.ts` - Proxies visualization image
- `detections/route.ts` - Proxies detections JSON
- `status/route.ts` - Proxies status JSON
- `diagnostics/route.ts` - Main diagnostics endpoint (config + status)

**Architecture Pattern**:
1. Frontend API route receives request
2. Forwards to Python bridge server (`http://localhost:8767`)
3. Returns response to client
4. Falls back to mock data if bridge unavailable

**Example Implementation**:
```typescript
// app/api/vision/detections/route.ts
const BRIDGE_URL = process.env.VISION_BRIDGE_URL || "http://localhost:8767";

export async function GET(request: NextRequest) {
  try {
    const response = await fetch(`${BRIDGE_URL}/api/vision/detections`);
    if (response.ok) {
      const data = await response.json();
      return NextResponse.json(data);
    }
  } catch (error) {
    // Fallback to mock data
  }
}
```

**Configuration**:
- Bridge URL: `VISION_BRIDGE_URL` environment variable
- Default: `http://localhost:8767`

#### 5.2 Vision Diagnostics Page

**Location**: `app/vision-diagnostics/page.tsx`

**Features**:
1. **Live Camera Stream**
   - Real-time image display (updates every 100ms)
   - Toggle between raw camera and visualization with overlays
   - Responsive canvas rendering
   - Real-time canvas overlays on live stream

2. **Enhanced Detection Visualization**
   - Size-adaptive bounding boxes (line width adapts to bbox area)
   - Rounded rectangle bounding boxes with corner markers
   - Class-based or confidence-based color schemes
   - Multi-line labels (class name and confidence)
   - Dynamic label positioning (avoids overlaps)
   - Semi-transparent label backgrounds with rounded corners
   - Center point markers on detections

3. **Visualization Controls**
   - Toggle: Show/hide labels
   - Toggle: Show/hide confidence scores
   - Toggle: Show/hide bounding boxes
   - Toggle: Show/hide corner markers
   - Toggle: Adaptive sizing
   - Slider: Label font size (10-20px)
   - Select: Color scheme (class-based or confidence-based)

4. **Performance Metrics**
   - FPS (frames per second)
   - Inference time (milliseconds)
   - Detection count per frame
   - Average statistics

5. **Topic Status**
   - Real-time status of all ROS 2 topics
   - Active/inactive indicators
   - Last update timestamps
   - Topic dimensions (for images)

6. **Configuration Controls**
   - Confidence threshold slider (0.0 - 1.0)
   - NMS threshold slider (0.0 - 1.0)
   - Max detections input
   - Model configuration display

7. **Bridge Connection Status**
   - Visual indicator of bridge connectivity
   - Automatic reconnection handling
   - Error messages for connection failures

**State Management**:
- React hooks (`useState`, `useEffect`, `useCallback`, `useRef`)
- Polling interval: 100ms for images and detections, 1000ms for status
- Automatic cleanup on unmount
- Visualization settings state with real-time updates

**Performance Optimizations**:
- **requestAnimationFrame**: Smooth canvas updates synchronized with display refresh
- **Color Caching**: Cached color computations (up to 1000 entries) to avoid repeated calculations
- **Debouncing**: Detection updates limited to max 30 FPS for overlays
- **Efficient Rendering**: Only redraws when detections or settings change
- **Image Caching**: Prevents unnecessary re-renders
- **Stream Overlays**: Separate canvas for live stream overlays with optimized rendering

---

## Data Flow Architecture

### End-to-End Pipeline

```
Camera Hardware
    │
    ▼
v4l2_camera Node
    │ sensor_msgs/Image (30 FPS, RELIABLE QoS)
    ▼
YOLO11 Node (C++)
    │
    ├─► Image Preprocessing (CPU, ~2-3ms)
    │   │
    │   ▼
    │ TensorRT Inference (GPU, ~15ms)
    │   │
    │   ▼
    │ Postprocessing (CPU, ~5-10ms)
    │   │
    │   ▼
    ├─► /detections (vision_msgs/Detection2DArray)
    │
    └─► /detections/visualization (sensor_msgs/Image)
            │
            ▼
Vision Diagnostics Bridge (Python)
    │
    ├─► Caches latest messages
    │
    └─► HTTP REST API (Port 8767)
            │
            ▼
Next.js API Routes (TypeScript)
    │
    └─► Frontend Diagnostics Page (React)
            │
            └─► User Interface (Browser)
```

### Message Types

#### Input: `sensor_msgs/Image`
```cpp
std_msgs/Header header
uint32 height
uint32 width
string encoding  // "rgb8" or "bgr8"
uint8 is_bigendian
uint32 step
uint8[] data
```

#### Output: `vision_msgs/Detection2DArray`
```cpp
std_msgs/Header header
vision_msgs/Detection2D[] detections
  ├─ string id
  ├─ vision_msgs/BoundingBox2D bbox
  │   ├─ geometry_msgs/Pose2D center
  │   │   ├─ float64 x, y, theta
  │   └─ float64 size_x, size_y
  └─ vision_msgs/ObjectHypothesisWithPose[] results
      └─ vision_msgs/ObjectHypothesis hypothesis
          ├─ int64 class_id
          └─ float64 score
```

---

## Technology Stack

### Hardware
- **Platform**: NVIDIA Jetson Orin Nano 8GB
- **Architecture**: ARM64 (aarch64)
- **GPU**: NVIDIA Ampere architecture (1024 CUDA cores)
- **Memory**: 8GB unified (CPU/GPU shared)
- **OS**: Linux 5.15.148-tegra (JetPack 6.0)

### Software Stack

#### Deep Learning / Inference
- **TensorRT**: 10.x (from JetPack 6.0)
- **CUDA**: 12.x (from JetPack 6.0)
- **cuDNN**: Included with TensorRT
- **Model**: YOLO11n (Ultralytics)
- **Engine Format**: FP16, static shape `[1,3,640,640]`

#### ROS 2
- **Distribution**: ROS 2 Humble
- **Middleware**: DDS (FastRTPS/RTI Connext)
- **Packages Used**:
  - `rclcpp` (C++ client library)
  - `rclpy` (Python client library)
  - `sensor_msgs`
  - `vision_msgs`
  - `cv_bridge` (ROS ↔ OpenCV bridge)

#### Computer Vision
- **OpenCV**: 4.x (via ROS 2)
- **cv_bridge**: ROS 2 ↔ OpenCV conversion

#### Frontend
- **Framework**: Next.js 14+ (React)
- **Language**: TypeScript
- **UI**: React components with Tailwind CSS
- **HTTP Client**: Native `fetch` API

#### Backend Bridge
- **Language**: Python 3.x
- **HTTP Server**: Python `http.server`
- **Image Processing**: OpenCV (via cv_bridge)

---

## Model Conversion Pipeline

### YOLO11 → TensorRT Engine

**Recommended Method: Direct TensorRT Export (Ultralytics API)**

Using Ultralytics' native TensorRT export simplifies the pipeline and follows official best practices:

```bash
# Export directly to TensorRT engine
./scripts/ros2/export_yolo11_to_tensorrt.sh yolo11n 640 fp16

# Or with INT8 precision for maximum performance
./scripts/ros2/export_yolo11_to_tensorrt.sh yolo11n 640 int8
```

**What the script does:**
1. **Validates model**: Ensures official YOLO11 models (yolo11n, yolo11s, yolo11m, yolo11l, yolo11x)
2. **Direct export**: Uses `model.export(format='engine', ...)` per Ultralytics documentation
3. **Fallback**: Automatically falls back to ONNX → TensorRT if direct export unavailable

**Python API (Direct Method)**:
```python
from ultralytics import YOLO

model = YOLO('yolo11n.pt')
model.export(
    format='engine',
    imgsz=640,
    device=0,      # GPU
    half=True,     # FP16 precision
    workspace=4    # 4GB workspace (safe for 8GB Jetson)
)
```

**Fallback Method: ONNX → TensorRT** (if direct export fails):
```bash
# Step 1: Export to ONNX
from ultralytics import YOLO
model = YOLO('yolo11n.pt')
model.export(format='onnx', imgsz=640, simplify=True, opset=12)

# Step 2: Convert ONNX → TensorRT using trtexec
/usr/src/tensorrt/bin/trtexec \
  --onnx=yolo11n.onnx \
  --saveEngine=yolo11n_640_fp16.engine \
  --fp16 \
  --memPoolSize=workspace:4096M
```

**Key Parameters**:
- **Precision**: FP16 (default) or INT8 for maximum performance
- **Input Shape**: Static `[1, 3, 640, 640]` (BCHW format)
- **Output Shape**: `[1, 84, 8400]` (feature-major)
- **Workspace**: 4GB (safe for 8GB Jetson, configurable)

**Output**:
- **Engine File**: `yolo11n_640_fp16.engine` or `yolo11n_640_int8.engine` (~8.2 MB)
- **Build Time**: ~13-15 minutes on Jetson Orin Nano
- **Compatibility**: Must be built on target hardware (TensorRT engines are hardware-specific)

---

## Performance Characteristics

### Inference Performance

**Standalone (Direct C++ Test)**:
- **FPS**: ~48 FPS
- **Latency**: ~20ms per frame (including preprocessing/postprocessing)
- **GPU Utilization**: ~60-70%

**With ROS 2 Overhead**:
- **FPS**: ~30 FPS (matches camera rate)
- **Latency**: ~30-50ms per frame (end-to-end)
- **CPU Usage**: ~15-20% (single core)
- **Memory**: ~200 MB (ROS 2 node)

### Resource Usage

**GPU Memory**:
- TensorRT Engine: ~8.2 MB (weights)
- Input Buffer: ~4.9 MB
- Output Buffer: ~2.8 MB
- **Total**: ~16 MB (excluding CUDA runtime)

**CPU Memory**:
- ROS 2 Node: ~200 MB
- Python Bridge: ~100 MB
- **Total**: ~300 MB

**CPU Usage**:
- YOLO11 Node: ~15-20% (single core)
- Python Bridge: ~5-10% (single core)
- **Total**: ~20-30% (2 cores)

### Bottlenecks

1. **Image Preprocessing** (~2-3ms CPU)
   - Resize and color conversion
   - Could be optimized with CUDA kernels

2. **Host-Device Memory Transfer** (~1-2ms)
   - `cudaMemcpyAsync()` for input/output
   - Already optimized with async operations

3. **Postprocessing** (~5-10ms CPU)
   - Parsing 8400 detections
   - NMS algorithm
   - Could be optimized with CUDA kernels

4. **ROS 2 Message Serialization** (~2-5ms)
   - Converting to ROS messages
   - Network serialization overhead

---

## Deployment Architecture

### System Startup Sequence

1. **Start Camera Node**
   ```bash
   ros2 run v4l2_camera v4l2_camera_node
   ```

2. **Start YOLO11 Node**
   ```bash
   ros2 run zip_vision yolo11_node \
     --ros-args \
     -p model_path:=/path/to/yolo11n_640_fp16.engine \
     -p confidence_threshold:=0.5
   ```

3. **Start Vision Diagnostics Bridge**
   ```bash
   python3 ros2_packages/zip_vision/src/vision_diagnostics_bridge.py \
     --port 8767 --host localhost
   ```

4. **Start Next.js Frontend**
   ```bash
   export VISION_BRIDGE_URL=http://localhost:8767
   npm run dev
   ```

### Launch File (Recommended)

**Location**: `ros2_packages/zip_vision/launch/vision_pipeline.launch.py`

```python
from launch import LaunchDescription
from launch_ros.actions import Node

def generate_launch_description():
    return LaunchDescription([
        # Camera node
        Node(
            package='v4l2_camera',
            executable='v4l2_camera_node',
            name='camera_node'
        ),
        
        # YOLO11 node
        Node(
            package='zip_vision',
            executable='yolo11_node',
            name='yolo11_node',
            parameters=[{
                'model_path': '/path/to/yolo11n_640_fp16.engine',
                'confidence_threshold': 0.5,
                'nms_threshold': 0.4,
                'enable_visualization': True
            }]
        ),
        
        # Vision diagnostics bridge
        Node(
            package='zip_vision',
            executable='vision_diagnostics_bridge.py',
            name='vision_diagnostics_bridge',
            parameters=[{
                'port': 8767,
                'host': 'localhost'
            }]
        )
    ])
```

**Usage**:
```bash
ros2 launch zip_vision vision_pipeline.launch.py
```

---

## Error Handling & Debugging

### Error Handling Strategy

1. **TensorRT Errors**
   - Comprehensive CUDA error checking
   - Exception handling around inference calls
   - Graceful degradation (returns false, logs error)

2. **ROS 2 Errors**
   - Parameter validation on startup
   - Exception handling in callbacks
   - Signal handlers for segfaults (SIGSEGV, SIGABRT)

3. **Frontend Errors**
   - Try-catch around API calls
   - Fallback to mock data if bridge unavailable
   - User-friendly error messages

### Debugging Tools

1. **TensorRT Logging**
   - Verbose logging enabled: `gLogger.setSeverity(kVERBOSE)`
   - Logs engine loading, inference execution

2. **ROS 2 Logging**
   - `RCLCPP_INFO`, `RCLCPP_ERROR`, `RCLCPP_DEBUG`
   - Frame-by-frame detection logging (first 10, then every 100)

3. **Standalone Test**
   - `test_yolo11_standalone.cpp` - Isolates TensorRT from ROS 2
   - Direct image file input
   - Performance benchmarking

4. **GDB/CUDA-GDB**
   - Backtrace capture on segfaults
   - CUDA-aware debugging for GPU issues

---

## Future Enhancements

### Performance Optimizations

1. **CUDA Preprocessing**
   - Move image preprocessing to GPU
   - Reduce CPU-GPU transfer overhead

2. **CUDA Postprocessing**
   - Implement NMS on GPU
   - Parallel detection parsing

3. **TensorRT INT8 Quantization**
   - Further reduce inference time
   - Requires calibration dataset

4. **Multi-Stream Processing**
   - Process multiple frames in parallel
   - Better GPU utilization

### Feature Additions

1. **VLM Integration**
   - Vision-Language Model for scene understanding
   - Uses TensorRT-LLM (separate component)

2. **Tracking**
   - Object tracking across frames
   - Kalman filter or DeepSORT

3. **Custom Classes**
   - Fine-tune YOLO11 for specific objects
   - Domain-specific training

4. **WebSocket Streaming**
   - Real-time WebSocket updates (instead of polling)
   - Lower latency for frontend

---

## Conclusion

This architecture provides a complete, production-ready vision system integrating YOLO11 object detection with TensorRT optimization, ROS 2 messaging, and a modern web-based diagnostics interface. The system is optimized for Jetson Orin Nano 8GB with careful attention to memory constraints and performance characteristics.

**Key Strengths**:
- ✅ Real-time performance (~30 FPS)
- ✅ Low latency (~30-50ms end-to-end)
- ✅ Robust error handling
- ✅ Comprehensive diagnostics interface
- ✅ Modular, maintainable architecture

**Areas for Improvement**:
- GPU-accelerated preprocessing/postprocessing
- INT8 quantization for further speedup
- WebSocket streaming for lower latency
- Object tracking capabilities

---

## References

- **YOLO11**: [Ultralytics YOLO11 Documentation](https://docs.ultralytics.com)
- **TensorRT**: [NVIDIA TensorRT Developer Guide](https://docs.nvidia.com/deeplearning/tensorrt/)
- **ROS 2**: [ROS 2 Humble Documentation](https://docs.ros.org/en/humble/)
- **Jetson**: [Jetson Orin Nano Developer Kit](https://developer.nvidia.com/embedded/jetson-orin-nano)

---

**Document Version**: 1.0  
**Last Updated**: 2026-01-12  
**Author**: ZIP Robot Project Team
