#!/bin/bash
# ROS 2 Environment Sourcing Helper
# Sources ROS 2 Humble and workspace setup files
# Usage: source scripts/ros2/source_ros2.sh

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Source ROS 2 Humble
if [ -f /opt/ros/humble/setup.bash ]; then
    source /opt/ros/humble/setup.bash
    echo "✓ Sourced ROS 2 Humble"
else
    echo "✗ ROS 2 Humble not found at /opt/ros/humble/setup.bash"
    echo "  Install with: ./scripts/ros2/install_ros2_humble_native.sh"
    return 1 2>/dev/null || exit 1
fi

# Source workspace if it exists and is built
WORKSPACE_DIR="$HOME/zip_ros2_ws"
if [ -f "$WORKSPACE_DIR/install/setup.bash" ]; then
    source "$WORKSPACE_DIR/install/setup.bash"
    echo "✓ Sourced workspace: $WORKSPACE_DIR"
else
    if [ -d "$WORKSPACE_DIR/src" ]; then
        echo "⚠ Workspace exists but not built"
        echo "  Build with: cd $WORKSPACE_DIR && colcon build"
    else
        echo "⚠ Workspace not found"
        echo "  Set up with: ./scripts/ros2/setup_workspace.sh"
    fi
fi

# Set ROS_DOMAIN_ID if not set (optional, for multi-robot setups)
if [ -z "$ROS_DOMAIN_ID" ]; then
    export ROS_DOMAIN_ID=0
fi

echo "ROS 2 environment ready!"
echo "  ROS_DISTRO: $ROS_DISTRO"
echo "  ROS_DOMAIN_ID: $ROS_DOMAIN_ID"
if [ -d "$WORKSPACE_DIR/install" ]; then
    echo "  Workspace: $WORKSPACE_DIR"
fi
