#!/bin/bash
# Complete Phase 1 Verification Script
# Verifies all Phase 1 requirements per migration plan

set -e

echo "=========================================="
echo "Phase 1 Complete Verification"
echo "=========================================="

ERRORS=0
WARNINGS=0

# 1. Verify package structure
echo ""
echo "1. Verifying package structure..."
for pkg in zip_core zip_control zip_vision zip_orchestration zip_voice zip_bridge; do
    if [ -d "ros2_packages/$pkg" ]; then
        echo "  ✓ $pkg package exists"
        if [ -f "ros2_packages/$pkg/package.xml" ]; then
            echo "    ✓ package.xml present"
        else
            echo "    ✗ package.xml missing"
            ERRORS=$((ERRORS + 1))
        fi
    else
        echo "  ✗ $pkg package missing"
        ERRORS=$((ERRORS + 1))
    fi
done

# 2. Verify custom messages
echo ""
echo "2. Verifying custom messages (zip_core)..."
for msg in RobotDiagnostics.msg RobotSensors.msg BatteryStatus.msg VoiceState.msg; do
    if [ -f "ros2_packages/zip_core/msg/$msg" ]; then
        echo "  ✓ $msg"
    else
        echo "  ✗ $msg missing"
        ERRORS=$((ERRORS + 1))
    fi
done

# 3. Verify services
echo ""
echo "3. Verifying services (zip_core)..."
if [ -f "ros2_packages/zip_core/srv/EmergencyStop.srv" ]; then
    echo "  ✓ EmergencyStop.srv"
else
    echo "  ✗ EmergencyStop.srv missing"
    ERRORS=$((ERRORS + 1))
fi

# 4. Verify workspace
echo ""
echo "4. Verifying workspace..."
if [ -d "$HOME/zip_ros2_ws/src" ]; then
    echo "  ✓ Workspace directory exists"
    PACKAGE_COUNT=$(ls -1 "$HOME/zip_ros2_ws/src" 2>/dev/null | wc -l)
    if [ "$PACKAGE_COUNT" -ge 6 ]; then
        echo "    ✓ $PACKAGE_COUNT packages in workspace"
    else
        echo "    ⚠ Only $PACKAGE_COUNT packages in workspace (expected 6)"
        WARNINGS=$((WARNINGS + 1))
    fi
else
    echo "  ⚠ Workspace directory not found (will be created)"
    WARNINGS=$((WARNINGS + 1))
fi

# 5. Verify ROS 2 Humble installation
echo ""
echo "5. Verifying ROS 2 Humble installation..."
if [ -f "/opt/ros/humble/setup.bash" ]; then
    echo "  ✓ ROS 2 Humble installed"
    source /opt/ros/humble/setup.bash 2>/dev/null || true
    if command -v ros2 > /dev/null 2>&1; then
        echo "    ✓ ros2 command available"
    else
        echo "    ⚠ ros2 command not in PATH"
        WARNINGS=$((WARNINGS + 1))
    fi
else
    echo "  ✗ ROS 2 Humble not installed"
    echo "    Install with: ./scripts/ros2/install_ros2_humble_native.sh"
    ERRORS=$((ERRORS + 1))
fi

# 6. Verify scripts
echo ""
echo "6. Verifying scripts..."
for script in install_ros2_humble_native.sh setup_workspace.sh deploy_packages.sh continue_setup.sh; do
    if [ -f "scripts/ros2/$script" ]; then
        if [ -x "scripts/ros2/$script" ]; then
            echo "  ✓ $script (executable)"
        else
            echo "  ⚠ $script (not executable)"
            WARNINGS=$((WARNINGS + 1))
        fi
    else
        echo "  ✗ $script missing"
        ERRORS=$((ERRORS + 1))
    fi
done

# 7. Verify workspace build
echo ""
echo "7. Verifying workspace build..."
if [ -d "$HOME/zip_ros2_ws/install" ]; then
    echo "  ✓ Workspace is built"
    source /opt/ros/humble/setup.bash 2>/dev/null || true
    source "$HOME/zip_ros2_ws/install/setup.bash" 2>/dev/null || true
    if ros2 interface show zip_core/msg/BatteryStatus > /dev/null 2>&1; then
        echo "    ✓ Custom messages accessible"
    else
        echo "    ⚠ Custom messages not accessible (may need rebuild)"
        WARNINGS=$((WARNINGS + 1))
    fi
else
    echo "  ⚠ Workspace not built"
    echo "    Build with: cd ~/zip_ros2_ws && colcon build"
    WARNINGS=$((WARNINGS + 1))
fi

# Summary
echo ""
echo "=========================================="
if [ $ERRORS -eq 0 ] && [ $WARNINGS -eq 0 ]; then
    echo "✓ Phase 1 verification PASSED (no issues)"
    echo "=========================================="
    exit 0
elif [ $ERRORS -eq 0 ]; then
    echo "✓ Phase 1 verification PASSED ($WARNINGS warnings)"
    echo "=========================================="
    exit 0
else
    echo "✗ Phase 1 verification FAILED ($ERRORS errors, $WARNINGS warnings)"
    echo "=========================================="
    exit 1
fi
