#!/bin/bash
# Continue Phase 1 Setup After Native ROS 2 Humble Installation
# This script sets up the workspace natively (no Docker)

set -e

echo "=========================================="
echo "Continuing Phase 1 Setup (Native ROS 2 Humble)"
echo "=========================================="

# Check if ROS 2 Humble is installed
if [ ! -f /opt/ros/humble/setup.bash ]; then
    echo "Error: ROS 2 Humble is not installed."
    echo "Please install it first:"
    echo "  ./scripts/ros2/install_ros2_humble_native.sh"
    exit 1
fi

echo "  ✓ ROS 2 Humble is installed"

# Source ROS 2 Humble
source /opt/ros/humble/setup.bash

# Check workspace
WORKSPACE_DIR="$HOME/zip_ros2_ws"
if [ ! -d "$WORKSPACE_DIR/src" ]; then
    echo "Creating workspace directory..."
    mkdir -p "$WORKSPACE_DIR/src"
    echo "  ✓ Workspace created at $WORKSPACE_DIR"
else
    echo "  ✓ Workspace exists at $WORKSPACE_DIR"
fi

# Deploy packages
echo ""
echo "Deploying packages to workspace..."
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$PROJECT_ROOT"
./scripts/ros2/deploy_packages.sh

# Install dependencies
echo ""
echo "Installing dependencies (this may take a few minutes)..."
cd "$WORKSPACE_DIR"
rosdep install --from-paths src --ignore-src -r -y || echo "  ⚠ Some dependencies may need manual installation"

echo "  ✓ Dependencies installed"

# Clean up old backup directories before building (they cause duplicate package errors)
echo ""
echo "Cleaning up old backup directories..."
find "$WORKSPACE_DIR" -maxdepth 1 -type d -name "*.backup.*" -exec rm -rf {} + 2>/dev/null || true
echo "  ✓ Old backups cleaned"

# Build workspace
echo ""
echo "Building workspace (this may take several minutes)..."
cd "$WORKSPACE_DIR"
colcon build --symlink-install

echo "  ✓ Workspace built"

# Verify installation
echo ""
echo "Verifying installation..."
source "$WORKSPACE_DIR/install/setup.bash"
ros2 pkg list | grep zip || echo 'No zip packages found'
ros2 interface show zip_core/msg/BatteryStatus || echo 'Custom messages not found'

echo ""
echo "=========================================="
echo "Phase 1 setup complete!"
echo "=========================================="
echo ""
echo "To use ROS 2 Humble:"
echo "  1. Source ROS 2: source /opt/ros/humble/setup.bash"
echo "  2. Source workspace: source ~/zip_ros2_ws/install/setup.bash"
echo "  3. Or use helper: source scripts/ros2/source_ros2.sh (after it's created)"
echo ""
echo "Example commands:"
echo "  ros2 pkg list | grep zip"
echo "  ros2 interface list | grep zip"
echo ""
