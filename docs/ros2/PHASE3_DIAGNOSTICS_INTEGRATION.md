# Phase 3 Diagnostics Frontend Integration

## Overview

This document describes how to integrate the ROS 2 vision pipeline (camera + YOLO11 TensorRT) with the diagnostics frontend.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│              Next.js Diagnostics Frontend               │
│              (/robot page, components/robot/)           │
└───────────────────────┬─────────────────────────────────┘
                        │ HTTP API / WebSocket
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
│  └───────────────────┬──────────────────────────────┘  │
│                      │                                  │
│  ┌───────────────────▼──────────────────────────────┐  │
│  │ Diagnostics Bridge Node                          │  │
│  │  Monitors all vision topics                      │  │
│  │  (Future: HTTP API or rosbridge integration)     │  │
│  └──────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

## Current Implementation

### ROS 2 Topics

The vision pipeline publishes the following topics:

- `/camera/image_raw` (sensor_msgs/Image) - Raw camera feed
- `/camera/camera_info` (sensor_msgs/CameraInfo) - Camera calibration info
- `/detections` (vision_msgs/Detection2DArray) - Object detections from YOLO11
- `/detections/visualization` (sensor_msgs/Image) - Annotated image with bounding boxes
- `/scene_description` (std_msgs/String) - Scene description from VLM (if enabled)

### Diagnostics Bridge Node

The `diagnostics_bridge_node` subscribes to all vision topics and monitors their status. Currently, it logs updates but does not expose an HTTP API.

**Future Enhancement:** Use rosbridge_suite to expose ROS 2 topics via WebSocket for direct frontend access.

## Integration Options

### Option 1: rosbridge_suite (Recommended)

rosbridge_suite provides a WebSocket interface to ROS 2 topics, allowing the Next.js frontend to directly subscribe to ROS 2 topics.

**Setup:**

1. Install rosbridge_suite (already installed):
   ```bash
   sudo apt install ros-humble-rosbridge-suite
   ```

2. Launch rosbridge server:
   ```bash
   ros2 launch rosbridge_server rosbridge_websocket_launch.xml port:=9090
   ```

3. In Next.js frontend, use `roslibjs` or custom WebSocket client:
   ```typescript
   import ROSLIB from 'roslib';
   
   const ros = new ROSLIB.Ros({
     url: 'ws://localhost:9090'
   });
   
   const detectionsTopic = new ROSLIB.Topic({
     ros: ros,
     name: '/detections',
     messageType: 'vision_msgs/Detection2DArray'
   });
   
   detectionsTopic.subscribe((message) => {
     // Handle detections
   });
   ```

### Option 2: HTTP API Bridge

Create a Python/Node.js HTTP server that subscribes to ROS 2 topics and exposes REST endpoints.

**Example Python bridge:**

```python
#!/usr/bin/env python3
import rclpy
from rclpy.node import Node
from vision_msgs.msg import Detection2DArray
from flask import Flask, jsonify
import threading

app = Flask(__name__)
latest_detections = None

class ROS2Bridge(Node):
    def __init__(self):
        super().__init__('http_bridge')
        self.subscription = self.create_subscription(
            Detection2DArray,
            '/detections',
            self.detections_callback,
            10
        )
    
    def detections_callback(self, msg):
        global latest_detections
        latest_detections = msg

@app.route('/api/vision/detections')
def get_detections():
    if latest_detections:
        # Convert ROS message to JSON
        return jsonify({
            'detections': [
                {
                    'class_id': det.results[0].hypothesis.class_id,
                    'confidence': det.results[0].hypothesis.score,
                    'bbox': {
                        'x': det.bbox.center.position.x,
                        'y': det.bbox.center.position.y,
                        'width': det.bbox.size_x,
                        'height': det.bbox.size_y,
                    }
                }
                for det in latest_detections.detections
            ]
        })
    return jsonify({'detections': []})

if __name__ == '__main__':
    rclpy.init()
    bridge = ROS2Bridge()
    
    # Run ROS 2 node in background thread
    threading.Thread(target=rclpy.spin, args=(bridge,), daemon=True).start()
    
    # Run Flask server
    app.run(host='0.0.0.0', port=8767)
```

### Option 3: Direct Topic Access (Development)

For development and testing, use ROS 2 command-line tools:

```bash
# View camera feed
ros2 run rqt_image_view rqt_image_view /camera/image_raw

# View detections
ros2 topic echo /detections

# View visualization
ros2 run rqt_image_view rqt_image_view /detections/visualization
```

## Testing the Integration

### 1. Build and Test

```bash
# Build workspace
./scripts/ros2/test_phase3_humble_build.sh

# Launch vision pipeline
ros2 launch zip_vision vision_pipeline.launch.py \
  yolo11_model_path:=/path/to/model.engine \
  enable_vlm:=false \
  enable_diagnostics_bridge:=true
```

### 2. Verify Topics

```bash
# List topics
ros2 topic list

# Check camera feed
ros2 topic hz /camera/image_raw

# Check detections
ros2 topic echo /detections --once
```

### 3. Test with Diagnostics Frontend

**Using rosbridge:**

1. Launch rosbridge:
   ```bash
   ros2 launch rosbridge_server rosbridge_websocket_launch.xml port:=9090
   ```

2. Update frontend to connect to rosbridge (see Option 1 above)

**Using HTTP API:**

1. Run HTTP bridge (see Option 2 above)
2. Frontend can call `/api/vision/detections` endpoint

## Frontend Components

### Displaying Detections

Create a component to display YOLO11 detections:

```typescript
// components/robot/VisionDetections.tsx
"use client";

import { useEffect, useState } from "react";

interface Detection {
  class_id: string;
  confidence: number;
  bbox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export default function VisionDetections() {
  const [detections, setDetections] = useState<Detection[]>([]);

  useEffect(() => {
    // Connect to rosbridge or HTTP API
    const interval = setInterval(async () => {
      const response = await fetch('/api/vision/detections');
      const data = await response.json();
      setDetections(data.detections || []);
    }, 100); // Update every 100ms

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold">Object Detections</h3>
      {detections.length === 0 ? (
        <p className="text-xs text-text-muted">No detections</p>
      ) : (
        <div className="space-y-1">
          {detections.map((det, idx) => (
            <div key={idx} className="text-xs">
              <span className="font-mono">{det.class_id}</span>
              <span className="text-text-muted ml-2">
                {(det.confidence * 100).toFixed(1)}%
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

### Displaying Visualization

Display the annotated camera feed with bounding boxes:

```typescript
// components/robot/VisionStream.tsx
"use client";

export default function VisionStream() {
  return (
    <div className="relative aspect-video bg-black rounded-lg overflow-hidden">
      <img
        src="http://localhost:8767/api/vision/visualization"
        alt="Vision Stream"
        className="w-full h-full object-contain"
      />
    </div>
  );
}
```

## Next Steps

1. **Implement rosbridge integration** in Next.js frontend
2. **Create HTTP API bridge** if rosbridge is not suitable
3. **Add detection visualization** overlay on camera feed
4. **Add detection filtering** by confidence threshold
5. **Add detection history** and statistics

## Troubleshooting

### Camera not detected

```bash
# Check camera device
ls -l /dev/video*

# Test camera with v4l2-ctl
v4l2-ctl --list-devices
```

### YOLO11 model not found

```bash
# Export model
./scripts/ros2/export_yolo11_to_tensorrt.sh yolo11n 640

# Check model location
find ~/zip_ros2_ws -name "*.engine"
```

### Topics not publishing

```bash
# Check node status
ros2 node list

# Check topic info
ros2 topic info /detections

# Check topic echo
ros2 topic echo /detections --once
```

## References

- [rosbridge_suite documentation](http://wiki.ros.org/rosbridge_suite)
- [vision_msgs documentation](https://github.com/ros-perception/vision_msgs)
- [ROS 2 Humble documentation](https://docs.ros.org/en/humble/)
