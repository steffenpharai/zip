#!/bin/bash
# Kill all and restart vision pipeline

echo "Killing all vision processes..."
pkill -9 -f vision_pipeline
pkill -9 -f yoloe_ros_node  
pkill -9 -f diagnostics_bridge
pkill -9 -f v4l2_camera
sleep 2

echo "Starting vision pipeline..."
cd /home/zip/Zip/zip/ros2_packages
source /opt/ros/humble/setup.bash
source install/setup.bash
ros2 launch zip_vision vision_native.launch.py > /tmp/vision_test.log 2>&1 &

echo "Waiting 20 seconds for startup..."
sleep 20

echo "Checking status..."
ps aux | grep yolo11_node | grep -v grep

echo ""
echo "Recent logs:"
tail -30 /tmp/vision_test.log | grep -E "(Frame|Detections|unique|✅)"

echo ""
echo "Running detection test..."
cd /home/zip/Zip/zip
source /opt/ros/humble/setup.bash
source ros2_packages/install/setup.bash
python3 test_camera_detections.py
