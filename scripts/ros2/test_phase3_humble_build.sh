#!/bin/bash
# Phase 3 Build and Test Script for ROS 2 Humble Native
# Tests camera + YOLO11 TensorRT integration

set -e

cd "$(dirname "$0")/../.."

echo "=========================================="
echo "Phase 3 Build & Test - ROS 2 Humble Native"
echo "=========================================="
echo ""

# Source ROS 2 Humble
if [ -f /opt/ros/humble/setup.bash ]; then
    source /opt/ros/humble/setup.bash
    echo "✓ Sourced ROS 2 Humble"
else
    echo "✗ Error: ROS 2 Humble not found at /opt/ros/humble"
    echo "  Run: ./scripts/ros2/install_ros2_humble_native.sh"
    exit 1
fi

# Check workspace
WORKSPACE="${HOME}/zip_ros2_ws"
if [ ! -d "$WORKSPACE" ]; then
    echo "✗ Error: Workspace not found at $WORKSPACE"
    echo "  Run: ./scripts/ros2/setup_workspace.sh"
    exit 1
fi

# Source workspace
if [ -f "$WORKSPACE/install/setup.bash" ]; then
    source "$WORKSPACE/install/setup.bash"
    echo "✓ Sourced workspace"
else
    echo "→ Workspace not built yet, will build now"
fi

cd "$WORKSPACE"

# Check if packages are deployed
if [ ! -d "$WORKSPACE/src/zip_vision" ]; then
    echo "→ Packages not deployed, deploying now..."
    cd "$(dirname "$0")/../.."
    ./scripts/ros2/deploy_packages.sh
    cd "$WORKSPACE"
fi

# Install dependencies
echo ""
echo "=== Installing Dependencies ==="
rosdep update
rosdep install --from-paths src --ignore-src -r -y || {
    echo "⚠ Warning: Some dependencies may not be installed"
}

# Build workspace
echo ""
echo "=== Building Workspace ==="
colcon build --packages-select zip_vision --cmake-args -DCMAKE_BUILD_TYPE=Release || {
    echo "✗ Build failed"
    exit 1
}

echo ""
echo "✓ Build complete!"

# Source install
source install/setup.bash

# Check if camera is available
echo ""
echo "=== Checking USB Camera ==="
if [ -e /dev/video0 ]; then
    echo "✓ USB camera found at /dev/video0"
    CAMERA_AVAILABLE=true
else
    echo "⚠ Warning: No camera found at /dev/video0"
    echo "  Camera node will not work, but build is successful"
    CAMERA_AVAILABLE=false
fi

# Check if YOLO11 model exists
echo ""
echo "=== Checking YOLO11 Model ==="
MODEL_DIR="$WORKSPACE/src/zip_vision/models/yolo11"
if [ -d "$MODEL_DIR" ] && [ -n "$(find "$MODEL_DIR" -name "*.engine" 2>/dev/null)" ]; then
    ENGINE_FILE=$(find "$MODEL_DIR" -name "*.engine" | head -1)
    echo "✓ YOLO11 TensorRT engine found: $ENGINE_FILE"
    MODEL_AVAILABLE=true
else
    echo "⚠ Warning: No YOLO11 TensorRT engine found"
    echo "  To export model, run:"
    echo "    ./scripts/ros2/export_yolo11_to_tensorrt.sh yolo11n 640"
    MODEL_AVAILABLE=false
fi

# Test node availability
echo ""
echo "=== Testing Node Availability ==="
if ros2 pkg executables zip_vision | grep -q "yolo11_node"; then
    echo "✓ yolo11_node executable found"
else
    echo "✗ yolo11_node not found"
    exit 1
fi

if ros2 pkg executables zip_vision | grep -q "diagnostics_bridge_node"; then
    echo "✓ diagnostics_bridge_node executable found"
else
    echo "✗ diagnostics_bridge_node not found"
    exit 1
fi

# Summary
echo ""
echo "=========================================="
echo "Build & Test Summary"
echo "=========================================="
echo "✓ Workspace built successfully"
echo "✓ zip_vision package compiled"
echo "✓ Nodes available"
if [ "$CAMERA_AVAILABLE" = true ]; then
    echo "✓ USB camera available"
else
    echo "⚠ USB camera not available (plug in camera to test)"
fi
if [ "$MODEL_AVAILABLE" = true ]; then
    echo "✓ YOLO11 model available"
else
    echo "⚠ YOLO11 model not available (export model to test inference)"
fi

echo ""
echo "To test the vision pipeline:"
echo "  1. Ensure camera is plugged in"
echo "  2. Export YOLO11 model if not done:"
echo "     ./scripts/ros2/export_yolo11_to_tensorrt.sh yolo11n 640"
echo "  3. Launch vision pipeline:"
echo "     ros2 launch zip_vision vision_pipeline.launch.py \\"
echo "       yolo11_model_path:=$ENGINE_FILE \\"
echo "       enable_vlm:=false"
echo ""
echo "To view detections:"
echo "  ros2 topic echo /detections"
echo "  ros2 topic echo /detections/visualization"
echo ""

exit 0
