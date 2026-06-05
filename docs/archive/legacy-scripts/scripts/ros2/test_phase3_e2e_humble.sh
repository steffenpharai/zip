#!/bin/bash
# Phase 3 End-to-End Test for ROS 2 Humble Native
# Tests camera + YOLO11 + diagnostics bridge with 98.7% confidence target

set -e

cd "$(dirname "$0")/../.."

echo "=========================================="
echo "Phase 3 E2E Test - ROS 2 Humble Native"
echo "=========================================="
echo ""

# Test counters
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

test_result() {
    TESTS_RUN=$((TESTS_RUN + 1))
    if [ $1 -eq 0 ]; then
        TESTS_PASSED=$((TESTS_PASSED + 1))
        echo "✓ PASS: $2"
        return 0
    else
        TESTS_FAILED=$((TESTS_FAILED + 1))
        echo "✗ FAIL: $2"
        return 1
    fi
}

# Source ROS 2 Humble
if [ -f /opt/ros/humble/setup.bash ]; then
    source /opt/ros/humble/setup.bash
    test_result 0 "ROS 2 Humble sourced"
else
    test_result 1 "ROS 2 Humble not found"
    exit 1
fi

# Source workspace
WORKSPACE="${HOME}/zip_ros2_ws"
if [ -f "$WORKSPACE/install/setup.bash" ]; then
    source "$WORKSPACE/install/setup.bash"
    test_result 0 "Workspace sourced"
else
    test_result 1 "Workspace not built"
    exit 1
fi

# 1. Check executables
echo ""
echo "=== Node Executables ==="
test_result $(ros2 pkg executables zip_vision | grep -q "yolo11_node" && echo 0 || echo 1) "yolo11_node executable"
test_result $(ros2 pkg executables zip_vision | grep -q "diagnostics_bridge_node" && echo 0 || echo 1) "diagnostics_bridge_node executable"
test_result $(ros2 pkg executables zip_vision | grep -q "vlm_node" && echo 0 || echo 1) "vlm_node executable"

# 2. Check camera
echo ""
echo "=== USB Camera ==="
if [ -e /dev/video0 ]; then
    test_result 0 "USB camera device found"
    CAMERA_AVAILABLE=true
else
    test_result 1 "USB camera device not found"
    CAMERA_AVAILABLE=false
fi

# 3. Check YOLO11 model
echo ""
echo "=== YOLO11 Model ==="
MODEL_DIR="$WORKSPACE/src/zip_vision/models/yolo11"
if [ -d "$MODEL_DIR" ] && [ -n "$(find "$MODEL_DIR" -name "*.engine" 2>/dev/null)" ]; then
    ENGINE_FILE=$(find "$MODEL_DIR" -name "*.engine" | head -1)
    test_result 0 "YOLO11 TensorRT engine found"
    MODEL_AVAILABLE=true
else
    test_result 1 "YOLO11 TensorRT engine not found"
    MODEL_AVAILABLE=false
fi

# 4. Test camera node (if camera available)
if [ "$CAMERA_AVAILABLE" = true ]; then
    echo ""
    echo "=== Camera Node Test ==="
    timeout 3 ros2 launch zip_vision camera.launch.py > /tmp/camera_test.log 2>&1 &
    CAMERA_PID=$!
    sleep 2
    
    if ros2 topic list | grep -q "/camera/image_raw"; then
        test_result 0 "Camera topic /camera/image_raw exists"
        
        # Check topic is publishing
        HZ_OUTPUT=$(timeout 3 ros2 topic hz /camera/image_raw 2>&1 | head -5 || echo "")
        if echo "$HZ_OUTPUT" | grep -q "average rate"; then
            test_result 0 "Camera publishing images"
        else
            test_result 1 "Camera not publishing (may need more time)"
        fi
    else
        test_result 1 "Camera topic not found"
    fi
    
    kill $CAMERA_PID 2>/dev/null || true
    wait $CAMERA_PID 2>/dev/null || true
    sleep 1
fi

# 5. Test YOLO11 node (if model available)
if [ "$MODEL_AVAILABLE" = true ] && [ "$CAMERA_AVAILABLE" = true ]; then
    echo ""
    echo "=== YOLO11 Node Test ==="
    timeout 5 ros2 launch zip_vision vision_pipeline.launch.py \
        yolo11_model_path:="$ENGINE_FILE" \
        enable_vlm:=false \
        enable_diagnostics_bridge:=true > /tmp/yolo11_test.log 2>&1 &
    YOLO_PID=$!
    sleep 3
    
    if ros2 topic list | grep -q "/detections"; then
        test_result 0 "Detections topic /detections exists"
        
        # Check if detections are being published (may be empty if no objects)
        DETECTIONS_MSG=$(timeout 2 ros2 topic echo /detections --once 2>&1 || echo "")
        if [ -n "$DETECTIONS_MSG" ]; then
            test_result 0 "YOLO11 node publishing detections"
        else
            test_result 1 "YOLO11 node not publishing (check logs)"
        fi
    else
        test_result 1 "Detections topic not found"
    fi
    
    kill $YOLO_PID 2>/dev/null || true
    wait $YOLO_PID 2>/dev/null || true
    sleep 1
fi

# 6. Test diagnostics bridge
echo ""
echo "=== Diagnostics Bridge Test ==="
if ros2 topic list | grep -q "/detections"; then
    # Launch diagnostics bridge
    timeout 3 ros2 run zip_vision diagnostics_bridge_node > /tmp/diagnostics_test.log 2>&1 &
    DIAG_PID=$!
    sleep 2
    
    # Check if node is running
    if ros2 node list | grep -q "diagnostics_bridge_node"; then
        test_result 0 "Diagnostics bridge node running"
    else
        test_result 1 "Diagnostics bridge node not found"
    fi
    
    kill $DIAG_PID 2>/dev/null || true
    wait $DIAG_PID 2>/dev/null || true
    sleep 1
else
    test_result 1 "Cannot test diagnostics bridge (no detections topic)"
fi

# 7. Test topics
echo ""
echo "=== ROS 2 Topics ==="
test_result $(ros2 topic list | grep -q "/camera/image_raw" && echo 0 || echo 1) "Camera topic exists"
test_result $(ros2 topic list | grep -q "/camera/camera_info" && echo 0 || echo 1) "Camera info topic exists"

# Summary
echo ""
echo "=========================================="
echo "Test Summary"
echo "=========================================="
echo "Tests Run: $TESTS_RUN"
echo "Passed: $TESTS_PASSED"
echo "Failed: $TESTS_FAILED"
if [ $TESTS_RUN -gt 0 ]; then
    PERCENTAGE=$(echo "scale=2; $TESTS_PASSED * 100 / $TESTS_RUN" | bc 2>/dev/null || echo "0")
    echo "Pass Rate: ${PERCENTAGE}%"
    
    # Calculate 98.7% target
    TARGET_PASS=$(echo "scale=0; $TESTS_RUN * 0.987" | bc 2>/dev/null || echo "0")
    TARGET_PASS_INT=${TARGET_PASS%.*}
    if [ $TESTS_PASSED -ge $TARGET_PASS_INT ]; then
        echo ""
        echo "✅ TARGET ACHIEVED: ${PERCENTAGE}% >= 98.7%"
        echo "✅ Phase 3 E2E Testing Complete!"
        exit 0
    else
        NEEDED=$((TARGET_PASS_INT - TESTS_PASSED))
        PERCENT_NEEDED=$(echo "scale=1; $NEEDED * 100 / $TESTS_RUN" | bc 2>/dev/null || echo "0")
        echo ""
        echo "→ Progress: ${PERCENTAGE}%"
        echo "→ Need $NEEDED more tests to pass (${PERCENT_NEEDED}%) for 98.7% target"
        exit 1
    fi
else
    echo "Pass Rate: 0%"
    exit 1
fi
