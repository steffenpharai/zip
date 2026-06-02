#!/bin/bash
#
# Start Vision Diagnostics Bridge Server
# 
# This script ensures the correct Python environment is used with ROS 2 Humble
# and handles NumPy compatibility issues.

set -e

# Source ROS 2 Humble environment
source /opt/ros/humble/setup.bash

# Source workspace if it exists
if [ -f ~/zip_ros2_ws/install/setup.bash ]; then
    source ~/zip_ros2_ws/install/setup.bash
fi

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BRIDGE_SCRIPT="$SCRIPT_DIR/../src/vision_diagnostics_bridge.py"

# Default arguments
PORT=${1:-8767}
HOST=${2:-localhost}

# Check if bridge script exists
if [ ! -f "$BRIDGE_SCRIPT" ]; then
    echo "Error: Bridge script not found at $BRIDGE_SCRIPT"
    exit 1
fi

# Check NumPy compatibility
echo "Checking NumPy compatibility..."
python3 << EOF
import sys
try:
    import numpy
    numpy_version = numpy.__version__
    major_version = int(numpy_version.split('.')[0])
    if major_version >= 2:
        print(f"WARNING: NumPy {numpy_version} detected. cv_bridge may not work.")
        print("Attempting to use ROS 2 system packages...")
        # Try to use ROS 2 NumPy if available
        import os
        ros_python_path = '/opt/ros/humble/local/lib/python3.10/dist-packages'
        if ros_python_path not in sys.path:
            sys.path.insert(0, ros_python_path)
except ImportError:
    print("NumPy not found")
    sys.exit(1)
EOF

# Start bridge server
echo "Starting vision diagnostics bridge on $HOST:$PORT..."
exec python3 "$BRIDGE_SCRIPT" --port "$PORT" --host "$HOST"
