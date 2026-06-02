# Full Camera Test - Execution Instructions

## Quick Test Command

Run this single command to execute the full test:

```bash
bash /home/zip/Zip/zip/FULL_CAMERA_TEST.sh
```

## Manual Test Steps

If the script doesn't work, run these commands manually:

### 1. Build Package
```bash
cd /home/zip/Zip/zip/ros2_packages
source /opt/ros/humble/setup.bash
colcon build --packages-select zip_vision
source install/setup.bash
```

### 2. Start Vision Pipeline
```bash
# Stop existing
pkill -9 -f vision_pipeline
pkill -9 -f yolo11_node

# Start new
ros2 launch zip_vision vision_pipeline.launch.py \
    enable_vlm:=false \
    yolo11_model_path:=/home/zip/Zip/zip/ros2_packages/zip_vision/models/yolo11/yolo11n_640_fp16.engine \
    > /tmp/vision_test.log 2>&1 &

# Wait for startup
sleep 20
```

### 3. Run Detection Test
```bash
cd /home/zip/Zip/zip
source /opt/ros/humble/setup.bash
source ros2_packages/install/setup.bash
python3 test_camera_detections.py
```

### 4. Check Results
```bash
# View logs
tail -f /tmp/vision_test.log | grep -E "(Frame|Detections|unique|adaptive)"

# Check ROS topic
ros2 topic echo /detections --once

# Check API
curl http://localhost:8767/api/vision/detections | jq '.detections | length'
```

## Expected Results

✅ **Success Indicators:**
- Logs show "✅ X unique object classes detected" where X >= 4
- Test script reports "TEST PASSED: Multiple objects detected"
- Maximum detections >= 4 in test output
- Multiple different class IDs in detection output

## What Was Implemented

1. **Class-Aware NMS**: Only suppresses same-class detections
2. **Adaptive Thresholding**: Auto-lowers threshold if no detections
3. **Optimized Thresholds**: Confidence 0.15, NMS 0.3
4. **Enhanced Logging**: Shows unique class counts

## Troubleshooting

If test fails:
1. Check camera is connected: `ls /dev/video*`
2. Check logs: `tail -100 /tmp/vision_test.log`
3. Verify model exists: `ls /home/zip/Zip/zip/ros2_packages/zip_vision/models/yolo11/`
4. Check ROS topics: `ros2 topic list | grep detection`
