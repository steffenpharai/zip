#!/bin/bash
# Wrapper script to run vision diagnostics bridge with ROS 2 environment
# Usage: run_vision_bridge.sh [--port PORT] [--host HOST]

source /opt/ros/humble/install/setup.bash
exec python3 /workspace/install/zip_vision/lib/zip_vision/vision_diagnostics_bridge.py "$@"
