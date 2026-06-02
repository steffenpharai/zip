#!/bin/bash
# Simplified E2E Test for quick verification
set -e

ENGINE_PATH="$HOME/zip_ros2_ws/src/zip_vision/models/yolo11/yolo11n_640_fp16.engine"

echo "=========================================="
echo "E2E Test: ROS 2 + Frontend + Camera"
echo "=========================================="

# Source ROS 2
source /opt/ros/humble/setup.bash
source "$HOME/zip_ros2_ws/install/setup.bash"

# Launch pipeline
echo "Launching ROS 2 pipeline..."
ros2 launch zip_vision vision_pipeline.launch.py \
    yolo11_model_path:="$ENGINE_PATH" \
    enable_vlm:=false \
    enable_diagnostics_bridge:=true \
    > /tmp/ros2_pipeline.log 2>&1 &
PIPELINE_PID=$!

sleep 15

# Launch bridge
echo "Launching diagnostics bridge..."
cd /home/zip/Zip/zip
python3 ros2_packages/zip_vision/src/vision_diagnostics_bridge.py \
    --port 8767 --host localhost \
    > /tmp/bridge.log 2>&1 &
BRIDGE_PID=$!

sleep 5

# Test detections
echo ""
echo "Testing detections (30 seconds)..."
DETECTION_COUNT=0
for i in {1..15}; do
    DET=$(timeout 2 ros2 topic echo /detections --once 2>&1 | grep -c "class_id:" || echo "0")
    if [ "$DET" -gt 0 ]; then
        DETECTION_COUNT=$((DETECTION_COUNT + 1))
        echo "[$i/15] ✓ $DET detections found"
    else
        echo "[$i/15] - No detections"
    fi
    sleep 2
done

# Cleanup
kill $PIPELINE_PID 2>/dev/null || true
kill $BRIDGE_PID 2>/dev/null || true

# Results
echo ""
echo "=========================================="
echo "Results: $DETECTION_COUNT/15 frames with detections"
if [ $DETECTION_COUNT -ge 10 ]; then
    echo "✅ SUCCESS: Detections working!"
    exit 0
else
    echo "❌ FAILURE: Too few detections"
    exit 1
fi
