#!/bin/bash
# Quick Start Verification for Phase 1 (Native ROS 2 Humble)
# Non-interactive verification of all Phase 1 components

set -e

echo "=========================================="
echo "Phase 1 Quick Start Verification (Native Humble)"
echo "=========================================="

# Step 1: Verify package structure
echo ""
echo "Step 1: Package Structure"
echo "-------------------------"
cd /home/zip/Zip/zip
if [ -f "./scripts/ros2/verify_phase1_complete.sh" ]; then
    ./scripts/ros2/verify_phase1_complete.sh
else
    echo "⚠ Verification script not found, skipping..."
fi

# Step 2: Verify ROS 2 Humble installation
echo ""
echo "Step 2: ROS 2 Humble Installation"
echo "-------------------------"
if [ -f /opt/ros/humble/setup.bash ]; then
    source /opt/ros/humble/setup.bash
    ROS_DISTRO=$(echo $ROS_DISTRO)
    echo "✓ ROS 2 Humble installed: $ROS_DISTRO"
    
    # Check if packages are accessible
    PKG_COUNT=$(ros2 pkg list 2>/dev/null | wc -l || echo "0")
    echo "  ✓ ROS 2 packages accessible: $PKG_COUNT packages"
else
    echo "✗ ROS 2 Humble not found"
    echo "  Install with: ./scripts/ros2/install_ros2_humble_native.sh"
fi

# Step 3: Verify workspace
echo ""
echo "Step 3: Workspace"
echo "-------------------------"
WORKSPACE_DIR="$HOME/zip_ros2_ws"
if [ -d "$WORKSPACE_DIR/src" ]; then
    echo "✓ Workspace exists: $WORKSPACE_DIR"
    echo "  Packages in workspace:"
    ls -1 "$WORKSPACE_DIR/src" 2>/dev/null | while read pkg; do
        echo "    - $pkg"
    done || echo "    (none)"
    
    # Check if workspace is built
    if [ -d "$WORKSPACE_DIR/install" ]; then
        echo "  ✓ Workspace is built"
        
        # Test custom messages if workspace is sourced
        if [ -f "$WORKSPACE_DIR/install/setup.bash" ]; then
            source "$WORKSPACE_DIR/install/setup.bash" 2>/dev/null || true
            if ros2 interface show zip_core/msg/BatteryStatus > /dev/null 2>&1; then
                echo "  ✓ Custom messages accessible"
            else
                echo "  ⚠ Custom messages not accessible (may need rebuild)"
            fi
        fi
    else
        echo "  ⚠ Workspace not built (run: cd $WORKSPACE_DIR && colcon build)"
    fi
else
    echo "⚠ Workspace not found (will be created on first setup)"
    echo "  Create with: ./scripts/ros2/setup_workspace.sh"
fi

# Step 4: Verify required packages
echo ""
echo "Step 4: Required ROS 2 Packages"
echo "-------------------------"
source /opt/ros/humble/setup.bash 2>/dev/null || true
REQUIRED_PKGS=("ros-humble-v4l2-camera" "ros-humble-camera-info-manager" "ros-humble-vision-msgs" "ros-humble-cv-bridge")
for pkg in "${REQUIRED_PKGS[@]}"; do
    if dpkg -l | grep -q "^ii.*$pkg"; then
        echo "  ✓ $pkg installed"
    else
        echo "  ✗ $pkg missing"
    fi
done

# Summary
echo ""
echo "=========================================="
echo "Verification Summary"
echo "=========================================="
echo ""

# Check overall status
if [ -f /opt/ros/humble/setup.bash ] && [ -d "$WORKSPACE_DIR/src" ]; then
    echo "✓ ROS 2 Humble: Installed"
    echo "✓ Workspace: Created"
    
    if [ -d "$WORKSPACE_DIR/install" ]; then
        echo "✓ Workspace: Built"
        echo ""
        echo "Phase 1 is READY for use!"
        echo ""
        echo "Next steps:"
        echo "  1. Source ROS 2: source /opt/ros/humble/setup.bash"
        echo "  2. Source workspace: source ~/zip_ros2_ws/install/setup.bash"
        echo "  3. Test: ros2 pkg list | grep zip"
    else
        echo "⚠ Workspace: Not built"
        echo ""
        echo "To complete setup:"
        echo "  1. cd ~/zip_ros2_ws"
        echo "  2. source /opt/ros/humble/setup.bash"
        echo "  3. rosdep install --from-paths src --ignore-src -r -y"
        echo "  4. colcon build"
    fi
else
    echo "⚠ Setup incomplete"
    echo ""
    if [ ! -f /opt/ros/humble/setup.bash ]; then
        echo "To complete setup:"
        echo "  1. Install ROS 2 Humble: ./scripts/ros2/install_ros2_humble_native.sh"
        echo "  2. Set up workspace: ./scripts/ros2/setup_workspace.sh"
        echo "  3. Deploy packages: ./scripts/ros2/deploy_packages.sh"
        echo "  4. Continue setup: ./scripts/ros2/continue_setup.sh"
    elif [ ! -d "$WORKSPACE_DIR/src" ]; then
        echo "To complete setup:"
        echo "  1. Set up workspace: ./scripts/ros2/setup_workspace.sh"
        echo "  2. Deploy packages: ./scripts/ros2/deploy_packages.sh"
        echo "  3. Continue setup: ./scripts/ros2/continue_setup.sh"
    fi
fi
echo ""
