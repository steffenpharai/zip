#!/bin/bash
# Phase 1 Verification Script
# Checks that all Phase 1 components are in place

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

echo "=========================================="
echo "Phase 1 Verification"
echo "=========================================="

ERRORS=0

# Check scripts exist
echo ""
echo "Checking scripts..."
for script in install_ros2_humble_native.sh setup_workspace.sh deploy_packages.sh; do
    if [ -f "$SCRIPT_DIR/$script" ]; then
        echo "  ✓ $script"
    else
        echo "  ✗ $script (MISSING)"
        ERRORS=$((ERRORS + 1))
    fi
done

# Check packages exist
echo ""
echo "Checking packages..."
for pkg in zip_core zip_control zip_vision zip_orchestration zip_voice zip_bridge; do
    if [ -d "$PROJECT_ROOT/ros2_packages/$pkg" ]; then
        echo "  ✓ $pkg"
    else
        echo "  ✗ $pkg (MISSING)"
        ERRORS=$((ERRORS + 1))
    fi
done

# Check zip_core messages
echo ""
echo "Checking zip_core messages..."
for msg in RobotDiagnostics.msg RobotSensors.msg BatteryStatus.msg VoiceState.msg; do
    if [ -f "$PROJECT_ROOT/ros2_packages/zip_core/msg/$msg" ]; then
        echo "  ✓ $msg"
    else
        echo "  ✗ $msg (MISSING)"
        ERRORS=$((ERRORS + 1))
    fi
done

# Check zip_core services
echo ""
echo "Checking zip_core services..."
if [ -f "$PROJECT_ROOT/ros2_packages/zip_core/srv/EmergencyStop.srv" ]; then
    echo "  ✓ EmergencyStop.srv"
else
    echo "  ✗ EmergencyStop.srv (MISSING)"
    ERRORS=$((ERRORS + 1))
fi

# Check documentation
echo ""
echo "Checking documentation..."
for doc in README.md PHASE1_SETUP.md PHASE1_SUMMARY.md; do
    if [ -f "$PROJECT_ROOT/docs/ros2/$doc" ]; then
        echo "  ✓ $doc"
    else
        echo "  ✗ $doc (MISSING)"
        ERRORS=$((ERRORS + 1))
    fi
done

# Summary
echo ""
echo "=========================================="
if [ $ERRORS -eq 0 ]; then
    echo "✓ Phase 1 verification PASSED"
    echo "=========================================="
    exit 0
else
    echo "✗ Phase 1 verification FAILED ($ERRORS errors)"
    echo "=========================================="
    exit 1
fi
