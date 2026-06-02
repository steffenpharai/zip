#!/bin/bash
# ROS 2 Workspace Setup Script
# Creates ~/zip_ros2_ws/ and initializes package structure

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
WORKSPACE_DIR="$HOME/zip_ros2_ws"

echo "=========================================="
echo "ROS 2 Workspace Setup"
echo "=========================================="

# Source ROS 2 if available
if [ -f /opt/ros/humble/setup.bash ]; then
    source /opt/ros/humble/setup.bash
    echo "Sourced ROS 2 Humble environment"
else
    echo "Warning: ROS 2 Humble not found. Please install first:"
    echo "  ./scripts/ros2/install_ros2_humble_native.sh"
    exit 1
fi

# Create workspace directory
echo "Creating workspace at $WORKSPACE_DIR..."
mkdir -p "$WORKSPACE_DIR/src"
cd "$WORKSPACE_DIR"

# Create symlink to project (for easy access to firmware, etc.)
if [ ! -L "$WORKSPACE_DIR/zip_project" ]; then
    ln -s "$PROJECT_ROOT" "$WORKSPACE_DIR/zip_project"
    echo "Created symlink to project root"
    # Exclude symlinked directory from colcon builds to avoid duplicate packages
    touch "$WORKSPACE_DIR/zip_project/COLCON_IGNORE"
    echo "Created COLCON_IGNORE to exclude symlink from builds"
fi

echo ""
echo "Workspace created at: $WORKSPACE_DIR"
echo ""
echo "Next steps:"
echo "  1. Packages will be created in: $WORKSPACE_DIR/src/"
echo "  2. Build with: cd $WORKSPACE_DIR && colcon build"
echo "  3. Source workspace: source $WORKSPACE_DIR/install/setup.bash"
echo ""
