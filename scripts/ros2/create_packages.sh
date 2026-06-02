#!/bin/bash
# Create ROS 2 Package Structure
# This script creates all packages for the ZIP robot ROS 2 migration

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKSPACE_DIR="$HOME/zip_ros2_ws/src"

if [ ! -d "$WORKSPACE_DIR" ]; then
    echo "Error: Workspace not found. Run setup_workspace.sh first."
    exit 1
fi

cd "$WORKSPACE_DIR"

echo "Creating ROS 2 packages..."

# Function to create a Python package
create_python_package() {
    local pkg_name=$1
    local pkg_dir="$WORKSPACE_DIR/$pkg_name"
    
    if [ -d "$pkg_dir" ]; then
        echo "Package $pkg_name already exists, skipping..."
        return
    fi
    
    echo "Creating Python package: $pkg_name"
    ros2 pkg create --build-type ament_python "$pkg_name" --dependencies rclpy std_msgs sensor_msgs geometry_msgs
    
    # Create standard directories
    mkdir -p "$pkg_dir/$pkg_name/launch"
    mkdir -p "$pkg_dir/$pkg_name/config"
    
    echo "  Created: $pkg_dir"
}

# Function to create a C++ package
create_cpp_package() {
    local pkg_name=$1
    local pkg_dir="$WORKSPACE_DIR/$pkg_name"
    
    if [ -d "$pkg_dir" ]; then
        echo "Package $pkg_name already exists, skipping..."
        return
    fi
    
    echo "Creating C++ package: $pkg_name"
    ros2 pkg create --build-type ament_cmake "$pkg_name" --dependencies rclcpp std_msgs sensor_msgs geometry_msgs
    
    # Create standard directories
    mkdir -p "$pkg_dir/include/$pkg_name"
    mkdir -p "$pkg_dir/src"
    mkdir -p "$pkg_dir/launch"
    mkdir -p "$pkg_dir/config"
    
    echo "  Created: $pkg_dir"
}

# zip_core - Core robot state, safety, custom messages (C++ for messages)
echo ""
echo "=== Creating zip_core ==="
ros2 pkg create --build-type ament_cmake zip_core --dependencies rclcpp std_msgs sensor_msgs geometry_msgs
mkdir -p "$WORKSPACE_DIR/zip_core/msg"
mkdir -p "$WORKSPACE_DIR/zip_core/srv"
mkdir -p "$WORKSPACE_DIR/zip_core/include/zip_core"
mkdir -p "$WORKSPACE_DIR/zip_core/src"
mkdir -p "$WORKSPACE_DIR/zip_core/launch"
mkdir -p "$WORKSPACE_DIR/zip_core/config"

# zip_control - Motion control (Python for easier serial handling)
create_python_package zip_control

# zip_vision - YOLO11, VLM (C++ for performance)
create_cpp_package zip_vision

# zip_orchestration - MLC-LLM integration (Python for API calls)
create_python_package zip_orchestration

# zip_voice - STT/TTS (Python for easier audio handling)
create_python_package zip_voice

# zip_bridge - rosbridge wrapper (Python)
create_python_package zip_bridge

echo ""
echo "=========================================="
echo "All packages created successfully!"
echo "=========================================="
echo ""
echo "Next steps:"
echo "  1. Define custom messages in zip_core/msg/"
echo "  2. Update package.xml and CMakeLists.txt files"
echo "  3. Build workspace: cd ~/zip_ros2_ws && colcon build"
echo ""
