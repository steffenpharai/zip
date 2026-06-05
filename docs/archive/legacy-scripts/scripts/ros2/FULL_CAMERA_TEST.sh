#!/bin/bash
# Full Camera Detection Test Script

set -e

echo "=========================================="
echo "YOLO11 Full Camera Detection Test"
echo "=========================================="
echo ""

# Step 1: Build
echo "[1/5] Building zip_vision package..."
cd /home/zip/Zip/zip/ros2_packages
source /opt/ros/humble/setup.bash
colcon build --packages-select zip_vision 2>&1 | tail -3
echo ""

# Step 2: Stop existing processes
echo "[2/5] Stopping existing processes..."
pkill -9 -f vision_pipeline 2>/dev/null || true
pkill -9 -f yolo11_node 2>/dev/null || true
pkill -9 -f diagnostics_bridge 2>/dev/null || true
sleep 3
echo "   Processes stopped"
echo ""

# Step 3: Start vision pipeline
echo "[3/5] Starting vision pipeline..."
source install/setup.bash
ros2 launch zip_vision vision_pipeline.launch.py \
    enable_vlm:=false \
    yolo11_model_path:=/home/zip/Zip/zip/ros2_packages/zip_vision/models/yolo11/yolo11n_640_fp16.engine \
    > /tmp/vision_test.log 2>&1 &
VISION_PID=$!
echo "   Pipeline started (PID: $VISION_PID)"
echo "   Waiting 20 seconds for initialization..."
sleep 20

# Check if still running
if ! ps -p $VISION_PID > /dev/null 2>&1; then
    echo "   ERROR: Pipeline crashed!"
    tail -30 /tmp/vision_test.log
    exit 1
fi
echo "   Pipeline running"
echo ""

# Step 4: Check logs
echo "[4/5] Recent detection logs:"
tail -100 /tmp/vision_test.log | grep -E "(Frame|Detections:|unique|adaptive|✅)" | tail -10
echo ""

# Step 5: Run Python test
echo "[5/5] Running 30-second detection test..."
cd /home/zip/Zip/zip
source /opt/ros/humble/setup.bash
source ros2_packages/install/setup.bash
timeout 35 python3 test_camera_detections.py
TEST_RESULT=$?

echo ""
echo "=========================================="
if [ $TEST_RESULT -eq 0 ]; then
    echo "✅ TEST PASSED - Multiple objects detected!"
else
    echo "❌ TEST FAILED - Check results above"
fi
echo "=========================================="

# Cleanup
echo ""
echo "Cleaning up..."
kill $VISION_PID 2>/dev/null || true
pkill -9 -f vision_pipeline 2>/dev/null || true

exit $TEST_RESULT
