#!/bin/bash
# Verify Jetson optimization settings per Ultralytics YOLO11 guide
# Based on: https://docs.ultralytics.com/guides/nvidia-jetson/
#
# Usage: ./verify_jetson_optimization.sh
# Exit code: 0 if all optimizations are applied, 1 if any are missing

set -e

echo "=========================================="
echo "Jetson Optimization Verification"
echo "Following Ultralytics Best Practices"
echo "=========================================="
echo ""

# Check if running on Jetson
if [ ! -f /etc/nv_tegra_release ]; then
    echo "⚠️  Warning: This script is designed for Jetson hardware."
    echo "   Some checks may not work on non-Jetson systems."
    echo ""
fi

ALL_OK=true

# Check 1: MAX Power Mode (Mode 0)
echo "1. Checking MAX Power Mode..."
if [ -f /etc/nv_tegra_release ]; then
    POWER_MODE=$(sudo nvpmodel -q 2>/dev/null | grep -oP 'Mode\K[0-9]+' || echo "")
    if [ "$POWER_MODE" = "0" ]; then
        echo "   ✓ MAX Power Mode enabled (Mode 0)"
    else
        echo "   ✗ MAX Power Mode NOT enabled (Current: Mode ${POWER_MODE:-unknown})"
        echo "     Fix: sudo nvpmodel -m 0"
        ALL_OK=false
    fi
else
    echo "   ⏭ Skipped (not a Jetson device)"
fi

# Check 2: Jetson Clocks
echo ""
echo "2. Checking Jetson Clocks..."
if command -v jetson_clocks &> /dev/null; then
    CLOCKS_STATUS=$(jetson_clocks --show 2>/dev/null | grep -i "enabled" || echo "")
    if [ -n "$CLOCKS_STATUS" ]; then
        echo "   ✓ Jetson Clocks enabled"
    else
        echo "   ✗ Jetson Clocks NOT enabled"
        echo "     Fix: sudo jetson_clocks"
        echo "     For persistence: sudo jetson_clocks --store"
        ALL_OK=false
    fi
else
    echo "   ⚠ jetson_clocks command not found"
    echo "     This should be available on Jetson devices"
    ALL_OK=false
fi

# Check 3: Jetson Stats
echo ""
echo "3. Checking Jetson Stats..."
if command -v jtop &> /dev/null; then
    echo "   ✓ jetson-stats installed (run 'jtop' to monitor)"
else
    echo "   ✗ jetson-stats NOT installed"
    echo "     Fix: sudo pip3 install jetson-stats && sudo reboot"
    ALL_OK=false
fi

# Summary
echo ""
echo "=========================================="
if [ "$ALL_OK" = true ]; then
    echo "✓ All optimizations are applied!"
    echo "=========================================="
    echo ""
    echo "Your Jetson is configured for optimal YOLO11 performance."
    echo ""
    exit 0
else
    echo "⚠️  Some optimizations are missing"
    echo "=========================================="
    echo ""
    echo "To apply all optimizations, run:"
    echo "  ./scripts/ros2/optimize_jetson_performance.sh"
    echo ""
    echo "Or apply them manually:"
    echo "  1. sudo nvpmodel -m 0"
    echo "  2. sudo jetson_clocks --store"
    echo "  3. sudo pip3 install jetson-stats && sudo reboot"
    echo ""
    exit 1
fi
