#!/bin/bash
# Optimize Jetson performance for YOLO11 inference
# Following Ultralytics YOLO11 Jetson guide best practices
# Based on: https://docs.ultralytics.com/guides/nvidia-jetson/
#
# Usage: 
#   ./optimize_jetson_performance.sh           # Interactive mode
#   ./optimize_jetson_performance.sh --auto    # Non-interactive (applies all optimizations)
#   ./optimize_jetson_performance.sh --check   # Check current status only
# Note: Some commands require sudo and may require reboot

set -e

# Parse arguments
AUTO_MODE=false
CHECK_ONLY=false

for arg in "$@"; do
    case $arg in
        --auto|--non-interactive|-y)
            AUTO_MODE=true
            shift
            ;;
        --check|--verify)
            CHECK_ONLY=true
            shift
            ;;
        *)
            shift
            ;;
    esac
done

# If check-only mode, run verification script
if [ "$CHECK_ONLY" = true ]; then
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    if [ -f "${SCRIPT_DIR}/verify_jetson_optimization.sh" ]; then
        exec "${SCRIPT_DIR}/verify_jetson_optimization.sh"
    else
        echo "Error: verify_jetson_optimization.sh not found"
        exit 1
    fi
fi

echo "=========================================="
echo "Jetson Performance Optimization"
echo "Following Ultralytics Best Practices"
echo "=========================================="
echo ""

# Check if running on Jetson
if [ ! -f /etc/nv_tegra_release ]; then
    echo "Warning: This script is designed for Jetson hardware."
    echo "Some commands may not work on non-Jetson systems."
    read -p "Continue anyway? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Step 1: Enable MAX Power Mode
echo "Step 1: Enabling MAX Power Mode..."
echo "  This enables all CPU and GPU cores at maximum power."
echo "  Command: sudo nvpmodel -m 0"
if [ "$AUTO_MODE" = true ]; then
    echo "  Auto mode: Applying MAX Power Mode..."
    sudo nvpmodel -m 0
    echo "  ✓ MAX Power Mode enabled"
    echo "  Note: This setting persists across reboots"
else
    read -p "  Enable MAX Power Mode? (y/N) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        sudo nvpmodel -m 0
        echo "  ✓ MAX Power Mode enabled"
        echo "  Note: This setting persists across reboots"
    else
        echo "  ⏭ Skipped (current mode: $(sudo nvpmodel -q | grep -o 'Mode[0-9]*' || echo 'unknown'))"
    fi
fi

# Step 2: Enable Jetson Clocks
echo ""
echo "Step 2: Enabling Jetson Clocks..."
echo "  This sets all CPU and GPU cores to maximum frequency."
echo "  Command: sudo jetson_clocks"
if [ "$AUTO_MODE" = true ]; then
    echo "  Auto mode: Applying Jetson Clocks (with persistence)..."
    sudo jetson_clocks
    sudo jetson_clocks --store
    echo "  ✓ Jetson Clocks enabled and will persist across reboots"
else
    read -p "  Enable Jetson Clocks? (y/N) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        sudo jetson_clocks
        echo "  ✓ Jetson Clocks enabled"
        echo "  Note: This setting resets on reboot (use --store to persist)"
        
        # Offer to make it persistent
        read -p "  Make this setting persistent across reboots? (y/N) " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            sudo jetson_clocks --store
            echo "  ✓ Jetson Clocks will persist across reboots"
        fi
    else
        echo "  ⏭ Skipped"
    fi
fi

# Step 3: Install Jetson Stats
echo ""
echo "Step 3: Installing Jetson Stats..."
echo "  Jetson Stats provides system monitoring (CPU, GPU, RAM, temperature)."
echo "  It also allows changing power modes and checking JetPack info."
if command -v jtop &> /dev/null; then
    echo "  ✓ jetson-stats already installed"
    echo "  Run 'jtop' to monitor system stats"
else
    if [ "$AUTO_MODE" = true ]; then
        echo "  Auto mode: Installing jetson-stats..."
        sudo apt update
        sudo pip3 install jetson-stats || {
            echo "  ⚠ pip3 install failed, trying alternative..."
            sudo apt install -y python3-pip
            sudo pip3 install jetson-stats
        }
        echo "  ✓ jetson-stats installed"
        echo ""
        echo "  ⚠ IMPORTANT: Reboot required for jetson-stats to work properly"
        echo "  Please reboot manually: sudo reboot"
    else
        read -p "  Install jetson-stats? (y/N) " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            echo "  Installing jetson-stats..."
            sudo apt update
            sudo pip3 install jetson-stats || {
                echo "  ⚠ pip3 install failed, trying alternative..."
                sudo apt install -y python3-pip
                sudo pip3 install jetson-stats
            }
            echo "  ✓ jetson-stats installed"
            echo ""
            echo "  ⚠ IMPORTANT: Reboot required for jetson-stats to work properly"
            read -p "  Reboot now? (y/N) " -n 1 -r
            echo
            if [[ $REPLY =~ ^[Yy]$ ]]; then
                echo "  Rebooting in 5 seconds..."
                sleep 5
                sudo reboot
            else
                echo "  Please reboot manually: sudo reboot"
            fi
        else
            echo "  ⏭ Skipped"
        fi
    fi
fi

# Display current status
echo ""
echo "=========================================="
echo "Current System Status"
echo "=========================================="

# Power mode
echo "Power Mode:"
sudo nvpmodel -q 2>/dev/null || echo "  (Unable to query)"

# Clock status
if command -v jetson_clocks &> /dev/null; then
    echo ""
    echo "Clock Status:"
    jetson_clocks --show 2>/dev/null || echo "  (Run 'sudo jetson_clocks' to enable)"
fi

# System info
if command -v jtop &> /dev/null; then
    echo ""
    echo "System Monitoring:"
    echo "  Run 'jtop' to view detailed system stats"
fi

echo ""
echo "=========================================="
echo "Optimization Complete!"
echo "=========================================="
echo ""
echo "Summary:"
echo "  • MAX Power Mode: $(sudo nvpmodel -q 2>/dev/null | grep -o 'Mode[0-9]*' || echo 'Check manually')"
echo "  • Jetson Clocks: $(if command -v jetson_clocks &> /dev/null && jetson_clocks --show 2>/dev/null | grep -q 'enabled'; then echo 'Enabled'; else echo 'Check manually'; fi)"
echo "  • Jetson Stats: $(if command -v jtop &> /dev/null; then echo 'Installed (run jtop)'; else echo 'Not installed'; fi)"
echo ""
echo "Best Practices for YOLO11 Performance:"
echo "  1. Always run with MAX Power Mode enabled (nvpmodel -m 0)"
echo "  2. Enable Jetson Clocks for maximum frequency (jetson_clocks)"
echo "  3. Monitor system with jtop to avoid thermal throttling"
echo "  4. Use TensorRT FP16 or INT8 for best inference performance"
echo ""
echo "For more details, see:"
echo "  https://docs.ultralytics.com/guides/nvidia-jetson/"
echo ""
