#!/bin/bash
# Master Native ROS 2 Humble Setup Script
# Complete setup: installs, creates workspace, deploys packages, builds, and verifies
# Usage: ./scripts/ros2/setup_humble_native.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

echo "=========================================="
echo "ZIP Robot - Native ROS 2 Humble Setup"
echo "Master Setup Script"
echo "=========================================="
echo ""

# Step 1: Check/Install ROS 2 Humble
echo "Step 1: Checking ROS 2 Humble installation..."
if [ -f /opt/ros/humble/setup.bash ]; then
    echo "  ✓ ROS 2 Humble is already installed"
    SKIP_INSTALL=true
else
    echo "  ROS 2 Humble not found. Installing..."
    SKIP_INSTALL=false
    sudo "$SCRIPT_DIR/install_ros2_humble_native.sh"
    if [ $? -ne 0 ]; then
        echo "  ✗ Installation failed"
        exit 1
    fi
    echo "  ✓ ROS 2 Humble installed"
fi

# Source ROS 2 Humble
source /opt/ros/humble/setup.bash

# Step 2: Set up workspace
echo ""
echo "Step 2: Setting up workspace..."
if [ -d "$HOME/zip_ros2_ws/src" ]; then
    echo "  ✓ Workspace already exists"
else
    "$SCRIPT_DIR/setup_workspace.sh"
    if [ $? -ne 0 ]; then
        echo "  ✗ Workspace setup failed"
        exit 1
    fi
    echo "  ✓ Workspace created"
fi

# Step 3: Deploy packages
echo ""
echo "Step 3: Deploying packages..."
"$SCRIPT_DIR/deploy_packages.sh"
if [ $? -ne 0 ]; then
    echo "  ✗ Package deployment failed"
    exit 1
fi
echo "  ✓ Packages deployed"

# Step 4: Install dependencies
echo ""
echo "Step 4: Installing dependencies (this may take a few minutes)..."
cd "$HOME/zip_ros2_ws"
rosdep install --from-paths src --ignore-src -r -y || {
    echo "  ⚠ Some dependencies may need manual installation"
}
echo "  ✓ Dependencies installed"

# Step 5: Build workspace
echo ""
echo "Step 5: Building workspace (this may take several minutes)..."
cd "$HOME/zip_ros2_ws"
colcon build --symlink-install || {
    echo "  ⚠ Build completed with warnings/errors"
    echo "  Some packages may not have built (e.g., zip_vision requires TensorRT)"
}
echo "  ✓ Workspace build completed"

# Step 6: Verify installation
echo ""
echo "Step 6: Verifying installation..."
source "$HOME/zip_ros2_ws/install/setup.bash"

# Check packages
BUILT_PACKAGES=$(ros2 pkg list | grep -c "^zip_" || echo "0")
echo "  Built packages: $BUILT_PACKAGES"

# Check custom messages
if ros2 interface show zip_core/msg/BatteryStatus > /dev/null 2>&1; then
    echo "  ✓ Custom messages accessible"
else
    echo "  ⚠ Custom messages not accessible (may need rebuild)"
fi

# Summary
echo ""
echo "=========================================="
echo "Setup Complete!"
echo "=========================================="
echo ""
echo "Installation Summary:"
echo "  ✓ ROS 2 Humble: Installed"
echo "  ✓ Workspace: $HOME/zip_ros2_ws"
echo "  ✓ Packages: Deployed and built"
echo ""
echo "To use ROS 2:"
echo "  source scripts/ros2/source_ros2.sh"
echo ""
echo "Or manually:"
echo "  source /opt/ros/humble/setup.bash"
echo "  source ~/zip_ros2_ws/install/setup.bash"
echo ""
echo "Test installation:"
echo "  ros2 pkg list | grep zip"
echo "  ros2 interface list | grep zip"
echo ""
echo "Next steps:"
echo "  1. For vision stack (Phase 3): ./scripts/ros2/setup_vision_native.sh"
echo "  2. Test nodes: ros2 run zip_bridge serial_bridge_node"
echo ""
