#!/bin/bash
# Deploy ROS 2 Packages to Workspace
# Copies packages from ros2_packages/ to ~/zip_ros2_ws/src/

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
PACKAGES_DIR="$PROJECT_ROOT/ros2_packages"
WORKSPACE_DIR="$HOME/zip_ros2_ws/src"

echo "=========================================="
echo "Deploying ROS 2 Packages to Workspace"
echo "=========================================="

# Check if packages directory exists
if [ ! -d "$PACKAGES_DIR" ]; then
    echo "Error: Packages directory not found: $PACKAGES_DIR"
    exit 1
fi

# Check if workspace exists
if [ ! -d "$WORKSPACE_DIR" ]; then
    echo "Error: Workspace not found. Run setup_workspace.sh first."
    exit 1
fi

# Clean up old backup directories (they cause duplicate package errors)
echo "Cleaning up old backup directories..."
find "$WORKSPACE_DIR" -maxdepth 1 -type d -name "*.backup.*" -exec rm -rf {} + 2>/dev/null || true
echo "  ✓ Old backups cleaned"

# Copy packages
echo "Copying packages from $PACKAGES_DIR to $WORKSPACE_DIR..."

for pkg in zip_core zip_control zip_vision zip_orchestration zip_voice zip_bridge; do
    if [ -d "$PACKAGES_DIR/$pkg" ]; then
        echo "  Deploying $pkg..."
        if [ -d "$WORKSPACE_DIR/$pkg" ]; then
            echo "    Removing existing $pkg (no backup to avoid duplicate package errors)..."
            rm -rf "$WORKSPACE_DIR/$pkg"
        fi
        cp -r "$PACKAGES_DIR/$pkg" "$WORKSPACE_DIR/$pkg"
        echo "    ✓ Deployed $pkg"
    else
        echo "    ✗ Package $pkg not found in $PACKAGES_DIR"
    fi
done

echo ""
echo "=========================================="
echo "Package deployment complete!"
echo "=========================================="
echo ""
echo "Next steps:"
echo "  1. cd ~/zip_ros2_ws"
echo "  2. source /opt/ros/humble/setup.bash"
echo "  3. rosdep install --from-paths src --ignore-src -r -y"
echo "  4. colcon build"
echo ""
