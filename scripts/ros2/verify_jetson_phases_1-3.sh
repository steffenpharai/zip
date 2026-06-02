#!/bin/bash
# Comprehensive Jetson & ROS 2 Migration Verification Script
# Verifies Jetson Orin Nano hardware and Phases 1-3 per migration plan
# References: https://elinux.org/Jetson_Zoo, TensorRT docs, Ultralytics guides

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

echo "=========================================="
echo "Jetson Orin Nano & ROS 2 Migration Verification"
echo "Phases 1-3 Compliance Check"
echo "=========================================="
echo ""

ERRORS=0
WARNINGS=0

# ============================================
# PART 1: Jetson Hardware Verification
# ============================================
echo "PART 1: Jetson Hardware Verification"
echo "-----------------------------------"

# Check if running on Jetson
if [ ! -f /etc/nv_tegra_release ]; then
    echo "✗ ERROR: Not running on Jetson hardware"
    echo "  /etc/nv_tegra_release not found"
    ERRORS=$((ERRORS + 1))
else
    echo "✓ Jetson hardware detected"
    
    # Read Jetson model info
    if [ -f /proc/device-tree/model ]; then
        MODEL=$(cat /proc/device-tree/model 2>/dev/null | tr -d '\0')
        echo "  Model: $MODEL"
        
        # Verify it's Orin Nano
        if echo "$MODEL" | grep -qi "orin.*nano"; then
            echo "  ✓ Confirmed: Jetson Orin Nano"
        else
            echo "  ⚠ WARNING: Model may not be Orin Nano (expected for migration plan)"
            WARNINGS=$((WARNINGS + 1))
        fi
    fi
    
    # Check JetPack version
    if [ -f /etc/nv_tegra_release ]; then
        JETPACK_VERSION=$(cat /etc/nv_tegra_release | head -1)
        echo "  JetPack: $JETPACK_VERSION"
        
        # Check for JetPack 6.x (required for TensorRT 10.x)
        if echo "$JETPACK_VERSION" | grep -q "R36"; then
            echo "  ✓ JetPack 6.x detected (compatible with TensorRT 10.x)"
        else
            echo "  ⚠ WARNING: May not be JetPack 6.x (check TensorRT compatibility)"
            WARNINGS=$((WARNINGS + 1))
        fi
    fi
    
    # Check CUDA
    if command -v nvcc > /dev/null 2>&1; then
        CUDA_VERSION=$(nvcc --version | grep "release" | sed 's/.*release \([0-9]\+\.[0-9]\+\).*/\1/')
        echo "  ✓ CUDA installed: $CUDA_VERSION"
    else
        echo "  ⚠ CUDA not found in PATH (may be installed but not in PATH)"
        WARNINGS=$((WARNINGS + 1))
    fi
    
    # Check TensorRT
    if [ -d "/usr/src/tensorrt" ] || [ -d "/usr/local/TensorRT" ]; then
        echo "  ✓ TensorRT directory found"
        if python3 -c "import tensorrt" 2>/dev/null; then
            TRT_VERSION=$(python3 -c "import tensorrt; print(tensorrt.__version__)" 2>/dev/null || echo "unknown")
            echo "    TensorRT Python: $TRT_VERSION"
        fi
    else
        echo "  ⚠ TensorRT directory not found (may be in non-standard location)"
        WARNINGS=$((WARNINGS + 1))
    fi
fi

# Check power mode (per Ultralytics guide)
if command -v nvpmodel > /dev/null 2>&1; then
    POWER_MODE=$(sudo nvpmodel -q 2>/dev/null | grep -oP 'Mode\K[0-9]+' || echo "")
    if [ "$POWER_MODE" = "0" ]; then
        echo "  ✓ MAX Power Mode enabled (Mode 0)"
    else
        echo "  ⚠ Power Mode: $POWER_MODE (recommend Mode 0 for performance)"
        echo "    Fix: sudo nvpmodel -m 0"
        WARNINGS=$((WARNINGS + 1))
    fi
fi

# Check jetson_clocks
if command -v jetson_clocks > /dev/null 2>&1; then
    if jetson_clocks --show 2>/dev/null | grep -qi "enabled"; then
        echo "  ✓ Jetson Clocks enabled"
    else
        echo "  ⚠ Jetson Clocks not enabled (recommend for YOLO11 performance)"
        echo "    Fix: sudo jetson_clocks"
        WARNINGS=$((WARNINGS + 1))
    fi
fi

echo ""

# ============================================
# PART 2: ROS 2 Humble Installation
# ============================================
echo "PART 2: ROS 2 Humble Installation"
echo "-----------------------------------"

if [ -f "/opt/ros/humble/setup.bash" ]; then
    echo "✓ ROS 2 Humble installed"
    source /opt/ros/humble/setup.bash 2>/dev/null || true
    
    if command -v ros2 > /dev/null 2>&1; then
        ROS_VERSION=$(ros2 --version 2>/dev/null | head -1 || echo "unknown")
        echo "  ROS 2 version: $ROS_VERSION"
        
        if [ "$ROS_DISTRO" = "humble" ]; then
            echo "  ✓ ROS_DISTRO: humble"
        else
            echo "  ⚠ ROS_DISTRO: $ROS_DISTRO (expected: humble)"
            WARNINGS=$((WARNINGS + 1))
        fi
        
        # Check required ROS 2 packages
        echo "  Checking required packages..."
        REQUIRED_PKGS=(
            "v4l2_camera"
            "cv_bridge"
            "image_transport"
            "vision_msgs"
            "rosbridge_suite"
        )
        
        for pkg in "${REQUIRED_PKGS[@]}"; do
            if ros2 pkg list 2>/dev/null | grep -q "ros-humble-$pkg\|$pkg"; then
                echo "    ✓ $pkg"
            else
                echo "    ✗ $pkg missing"
                echo "      Install: sudo apt install ros-humble-$pkg"
                ERRORS=$((ERRORS + 1))
            fi
        done
    else
        echo "  ✗ ros2 command not available"
        ERRORS=$((ERRORS + 1))
    fi
else
    echo "✗ ROS 2 Humble not installed"
    echo "  Install with: sudo ./scripts/ros2/install_ros2_humble_native.sh"
    ERRORS=$((ERRORS + 1))
fi

echo ""

# ============================================
# PART 3: Phase 1 Verification
# ============================================
echo "PART 3: Phase 1 - ROS 2 Foundation"
echo "-----------------------------------"

# Check workspace
if [ -d "$HOME/zip_ros2_ws/src" ]; then
    echo "✓ Workspace exists: ~/zip_ros2_ws/"
    PACKAGE_COUNT=$(ls -1 "$HOME/zip_ros2_ws/src" 2>/dev/null | wc -l)
    echo "  Packages in workspace: $PACKAGE_COUNT"
else
    echo "✗ Workspace not found: ~/zip_ros2_ws/src"
    ERRORS=$((ERRORS + 1))
fi

# Check package structure
echo "  Checking packages..."
REQUIRED_PACKAGES=("zip_core" "zip_control" "zip_vision" "zip_orchestration" "zip_voice" "zip_bridge")
for pkg in "${REQUIRED_PACKAGES[@]}"; do
    if [ -d "$PROJECT_ROOT/ros2_packages/$pkg" ]; then
        if [ -f "$PROJECT_ROOT/ros2_packages/$pkg/package.xml" ]; then
            echo "    ✓ $pkg (package.xml present)"
        else
            echo "    ✗ $pkg (package.xml missing)"
            ERRORS=$((ERRORS + 1))
        fi
    else
        echo "    ✗ $pkg (package directory missing)"
        ERRORS=$((ERRORS + 1))
    fi
done

# Check custom messages
echo "  Checking custom messages..."
REQUIRED_MSGS=("RobotDiagnostics.msg" "RobotSensors.msg" "BatteryStatus.msg" "VoiceState.msg")
for msg in "${REQUIRED_MSGS[@]}"; do
    if [ -f "$PROJECT_ROOT/ros2_packages/zip_core/msg/$msg" ]; then
        echo "    ✓ $msg"
    else
        echo "    ✗ $msg missing"
        ERRORS=$((ERRORS + 1))
    fi
done

# Check services
if [ -f "$PROJECT_ROOT/ros2_packages/zip_core/srv/EmergencyStop.srv" ]; then
    echo "    ✓ EmergencyStop.srv"
else
    echo "    ✗ EmergencyStop.srv missing"
    ERRORS=$((ERRORS + 1))
fi

# Check if workspace is built
if [ -d "$HOME/zip_ros2_ws/install" ]; then
    echo "  ✓ Workspace is built"
    source /opt/ros/humble/setup.bash 2>/dev/null || true
    source "$HOME/zip_ros2_ws/install/setup.bash" 2>/dev/null || true
    
    # Verify custom messages are accessible
    if ros2 interface show zip_core/msg/BatteryStatus > /dev/null 2>&1; then
        echo "    ✓ Custom messages accessible via ROS 2"
    else
        echo "    ⚠ Custom messages not accessible (may need rebuild)"
        WARNINGS=$((WARNINGS + 1))
    fi
else
    echo "  ⚠ Workspace not built"
    echo "    Build with: cd ~/zip_ros2_ws && colcon build"
    WARNINGS=$((WARNINGS + 1))
fi

echo ""

# ============================================
# PART 4: Phase 2 Verification
# ============================================
echo "PART 4: Phase 2 - Arduino Communication"
echo "-----------------------------------"

# Check serial bridge node
if [ -f "$PROJECT_ROOT/ros2_packages/zip_control/zip_control/serial_bridge_node.py" ]; then
    echo "✓ Serial bridge node exists"
    
    # Check if it's executable
    if [ -x "$PROJECT_ROOT/ros2_packages/zip_control/zip_control/serial_bridge_node.py" ]; then
        echo "  ✓ Executable"
    else
        echo "  ⚠ Not executable (chmod +x recommended)"
        WARNINGS=$((WARNINGS + 1))
    fi
    
    # Check launch file
    if [ -f "$PROJECT_ROOT/ros2_packages/zip_control/launch/serial_bridge.launch.py" ]; then
        echo "  ✓ Launch file exists"
    else
        echo "  ⚠ Launch file missing"
        WARNINGS=$((WARNINGS + 1))
    fi
else
    echo "✗ Serial bridge node missing"
    ERRORS=$((ERRORS + 1))
fi

# Check for pyserial dependency
if python3 -c "import serial" 2>/dev/null; then
    echo "  ✓ pyserial installed"
else
    echo "  ⚠ pyserial not installed (required for serial bridge)"
    echo "    Install: pip3 install pyserial"
    WARNINGS=$((WARNINGS + 1))
fi

echo ""

# ============================================
# PART 5: Phase 3 Verification
# ============================================
echo "PART 5: Phase 3 - Vision & AI Stack"
echo "-----------------------------------"

# 5.1 Camera setup
echo "  5.1 Camera Setup:"
if [ -f "$PROJECT_ROOT/ros2_packages/zip_vision/launch/camera.launch.py" ]; then
    echo "    ✓ Camera launch file exists"
else
    echo "    ✗ Camera launch file missing"
    ERRORS=$((ERRORS + 1))
fi

if [ -f "$PROJECT_ROOT/ros2_packages/zip_vision/config/camera_params.yaml" ]; then
    echo "    ✓ Camera config exists"
else
    echo "    ⚠ Camera config missing"
    WARNINGS=$((WARNINGS + 1))
fi

# 5.2 YOLO11 Integration
echo "  5.2 YOLO11 Integration:"
if [ -f "$PROJECT_ROOT/ros2_packages/zip_vision/src/yolo11_node.cpp" ]; then
    echo "    ✓ YOLO11 node source exists"
else
    echo "    ✗ YOLO11 node source missing"
    ERRORS=$((ERRORS + 1))
fi

if [ -f "$PROJECT_ROOT/ros2_packages/zip_vision/src/yolo11_engine.cpp" ]; then
    echo "    ✓ YOLO11 engine source exists"
else
    echo "    ✗ YOLO11 engine source missing"
    ERRORS=$((ERRORS + 1))
fi

if [ -f "$PROJECT_ROOT/ros2_packages/zip_vision/include/zip_vision/yolo11_engine.hpp" ]; then
    echo "    ✓ YOLO11 engine header exists"
else
    echo "    ✗ YOLO11 engine header missing"
    ERRORS=$((ERRORS + 1))
fi

if [ -f "$PROJECT_ROOT/ros2_packages/zip_vision/launch/yolo11.launch.py" ]; then
    echo "    ✓ YOLO11 launch file exists"
else
    echo "    ✗ YOLO11 launch file missing"
    ERRORS=$((ERRORS + 1))
fi

if [ -f "$PROJECT_ROOT/ros2_packages/zip_vision/config/yolo11_params.yaml" ]; then
    echo "    ✓ YOLO11 config exists"
else
    echo "    ⚠ YOLO11 config missing"
    WARNINGS=$((WARNINGS + 1))
fi

# Check for TensorRT export script
if [ -f "$PROJECT_ROOT/scripts/ros2/export_yolo11_to_tensorrt.sh" ]; then
    echo "    ✓ TensorRT export script exists"
else
    echo "    ⚠ TensorRT export script missing"
    WARNINGS=$((WARNINGS + 1))
fi

# 5.3 VLM Integration
echo "  5.3 VLM Integration:"
if [ -f "$PROJECT_ROOT/ros2_packages/zip_vision/src/vlm_node.cpp" ]; then
    echo "    ✓ VLM node source exists"
else
    echo "    ✗ VLM node source missing"
    ERRORS=$((ERRORS + 1))
fi

if [ -f "$PROJECT_ROOT/ros2_packages/zip_vision/include/zip_vision/vlm_engine.hpp" ]; then
    echo "    ✓ VLM engine header exists"
else
    echo "    ✗ VLM engine header missing"
    ERRORS=$((ERRORS + 1))
fi

if [ -f "$PROJECT_ROOT/ros2_packages/zip_vision/launch/vlm.launch.py" ]; then
    echo "    ✓ VLM launch file exists"
else
    echo "    ✗ VLM launch file missing"
    ERRORS=$((ERRORS + 1))
fi

if [ -f "$PROJECT_ROOT/ros2_packages/zip_vision/config/vlm_params.yaml" ]; then
    echo "    ✓ VLM config exists"
else
    echo "    ⚠ VLM config missing"
    WARNINGS=$((WARNINGS + 1))
fi

# Check for VLM service node
if [ -f "$PROJECT_ROOT/ros2_packages/zip_vision/zip_vision/vlm_service_node.py" ]; then
    echo "    ✓ VLM service node exists"
else
    echo "    ⚠ VLM service node missing"
    WARNINGS=$((WARNINGS + 1))
fi

# Check for vision diagnostics bridge
if [ -f "$PROJECT_ROOT/ros2_packages/zip_vision/src/vision_diagnostics_bridge.py" ]; then
    echo "    ✓ Vision diagnostics bridge exists"
else
    echo "    ⚠ Vision diagnostics bridge missing"
    WARNINGS=$((WARNINGS + 1))
fi

echo ""

# ============================================
# PART 6: Performance Optimization Scripts
# ============================================
echo "PART 6: Performance Optimization Scripts"
echo "-----------------------------------"

if [ -f "$PROJECT_ROOT/scripts/ros2/optimize_jetson_performance.sh" ]; then
    echo "✓ Jetson optimization script exists"
    if [ -x "$PROJECT_ROOT/scripts/ros2/optimize_jetson_performance.sh" ]; then
        echo "  ✓ Executable"
    else
        echo "  ⚠ Not executable"
        WARNINGS=$((WARNINGS + 1))
    fi
else
    echo "⚠ Jetson optimization script missing"
    WARNINGS=$((WARNINGS + 1))
fi

if [ -f "$PROJECT_ROOT/scripts/ros2/verify_jetson_optimization.sh" ]; then
    echo "✓ Jetson verification script exists"
else
    echo "⚠ Jetson verification script missing"
    WARNINGS=$((WARNINGS + 1))
fi

echo ""

# ============================================
# SUMMARY
# ============================================
echo "=========================================="
echo "Verification Summary"
echo "=========================================="
echo "Errors: $ERRORS"
echo "Warnings: $WARNINGS"
echo ""

if [ $ERRORS -eq 0 ] && [ $WARNINGS -eq 0 ]; then
    echo "✓ ALL CHECKS PASSED"
    echo ""
    echo "Your Jetson Orin Nano and ROS 2 migration (Phases 1-3) are properly"
    echo "configured according to the migration plan and best practices."
    exit 0
elif [ $ERRORS -eq 0 ]; then
    echo "✓ CORE CHECKS PASSED ($WARNINGS warnings)"
    echo ""
    echo "Your setup is functional but has some warnings. Review the output above."
    exit 0
else
    echo "✗ VERIFICATION FAILED ($ERRORS errors, $WARNINGS warnings)"
    echo ""
    echo "Please fix the errors above before proceeding."
    exit 1
fi
