#!/bin/bash
# Test script to verify multiple object detection

echo "=== YOLO11 Multiple Object Detection Test ==="
echo ""

# Kill existing processes
echo "1. Stopping existing vision pipeline..."
pkill -9 -f vision_pipeline 2>/dev/null
pkill -9 -f yolo11_node 2>/dev/null
sleep 2

# Build
echo "2. Building zip_vision package..."
cd /home/zip/Zip/zip/ros2_packages
source /opt/ros/humble/setup.bash
colcon build --packages-select zip_vision 2>&1 | tail -3

# Start pipeline
echo "3. Starting vision pipeline..."
source install/setup.bash
ros2 launch zip_vision vision_pipeline.launch.py \
    enable_vlm:=false \
    yolo11_model_path:=/home/zip/Zip/zip/ros2_packages/zip_vision/models/yolo11/yolo11n_640_fp16.engine \
    > /tmp/vision_test.log 2>&1 &
VISION_PID=$!

echo "   Pipeline started (PID: $VISION_PID)"
echo "   Waiting 15 seconds for initialization..."
sleep 15

# Check if running
if ! ps -p $VISION_PID > /dev/null; then
    echo "❌ ERROR: Vision pipeline crashed!"
    tail -50 /tmp/vision_test.log
    exit 1
fi

# Monitor detections
echo "4. Monitoring detections for 30 seconds..."
echo ""

python3 << 'PYTHON_SCRIPT'
import rclpy
from rclpy.node import Node
from vision_msgs.msg import Detection2DArray
import time

class TestDetections(Node):
    def __init__(self):
        super().__init__('test_detections')
        self.max_detections = 0
        self.total_frames = 0
        self.detection_counts = []
        self.subscription = self.create_subscription(
            Detection2DArray,
            '/detections',
            self.callback,
            10
        )
        
    def callback(self, msg):
        count = len(msg.detections)
        self.total_frames += 1
        self.detection_counts.append(count)
        if count > self.max_detections:
            self.max_detections = count
            
        if count > 0:
            classes = set()
            for det in msg.detections:
                if det.results:
                    classes.add(det.results[0].hypothesis.class_id)
            
            print(f"Frame {self.total_frames}: {count} detections, {len(classes)} unique classes")
            if count >= 4:
                print(f"  ✅ SUCCESS: {count} objects detected!")
                for det in msg.detections[:5]:
                    if det.results:
                        print(f"    - Class {det.results[0].hypothesis.class_id}, conf={det.results[0].hypothesis.score:.3f}")

rclpy.init()
node = TestDetections()
timeout = time.time() + 30

print("Listening for detections...")
while time.time() < timeout:
    rclpy.spin_once(node, timeout_sec=1.0)

print(f"\n=== RESULTS ===")
print(f"Total frames received: {node.total_frames}")
if node.detection_counts:
    print(f"Max detections in single frame: {node.max_detections}")
    print(f"Average detections: {sum(node.detection_counts)/len(node.detection_counts):.2f}")
    print(f"Frames with 4+ detections: {sum(1 for c in node.detection_counts if c >= 4)}")
    
    if node.max_detections >= 4:
        print(f"\n✅ VERIFICATION PASSED: {node.max_detections} objects detected (target: 4+)")
        exit(0)
    else:
        print(f"\n❌ VERIFICATION FAILED: Only {node.max_detections} objects detected (need 4+)")
        exit(1)
else:
    print("❌ No detections received!")
    exit(1)

node.destroy_node()
rclpy.shutdown()
PYTHON_SCRIPT

RESULT=$?

# Cleanup
echo ""
echo "5. Stopping vision pipeline..."
kill $VISION_PID 2>/dev/null
pkill -9 -f vision_pipeline 2>/dev/null

exit $RESULT
