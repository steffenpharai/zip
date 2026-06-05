#!/bin/bash
#
# Start Complete Vision System
# 
# Starts all components of the YOLOE vision system:
# 1. Vision Pipeline (Camera + YOLOE + Diagnostics Bridge Node)
# 2. HTTP Diagnostics Bridge (Python)
# 3. Next.js Frontend
#
# Usage:
#   ./start_vision_system.sh [stop|status|restart]
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Source ROS 2 environment
source /opt/ros/humble/setup.bash
cd ros2_packages
source install/setup.bash
cd ..

# Get engine path
ENGINE_PATH=$(realpath ros2_packages/zip_vision/models/yolo11/yolo11n_640_fp16.engine)

# Log files
VISION_PIPELINE_LOG="/tmp/vision_pipeline.log"
DIAGNOSTICS_BRIDGE_LOG="/tmp/diagnostics_bridge.log"
NEXTJS_LOG="/tmp/nextjs.log"

# PID files
VISION_PIPELINE_PID="/tmp/vision_pipeline.pid"
DIAGNOSTICS_BRIDGE_PID="/tmp/diagnostics_bridge.pid"
NEXTJS_PID="/tmp/nextjs.pid"

function start_vision_pipeline() {
    if [ -f "$VISION_PIPELINE_PID" ] && ps -p $(cat "$VISION_PIPELINE_PID") > /dev/null 2>&1; then
        echo "⚠ Vision pipeline already running (PID: $(cat $VISION_PIPELINE_PID))"
        return
    fi
    
    echo "Starting vision pipeline..."
    cd ros2_packages
    source /opt/ros/humble/setup.bash
    source install/setup.bash
    ros2 launch zip_vision vision_pipeline.launch.py \
        yolo11_model_path:="$ENGINE_PATH" \
        enable_vlm:=false \
        enable_diagnostics_bridge:=true \
        yolo11_confidence_threshold:=0.5 \
        > "$VISION_PIPELINE_LOG" 2>&1 &
    
    VISION_PID=$!
    echo $VISION_PID > "$VISION_PIPELINE_PID"
    echo "✓ Vision pipeline started (PID: $VISION_PID)"
    cd ..
    sleep 3
}

function start_diagnostics_bridge() {
    # Kill any existing bridge processes first to prevent conflicts
    pkill -f "vision_diagnostics_bridge" 2>/dev/null
    lsof -ti:8767 | xargs kill -9 2>/dev/null
    sleep 1
    
    if [ -f "$DIAGNOSTICS_BRIDGE_PID" ] && ps -p $(cat "$DIAGNOSTICS_BRIDGE_PID") > /dev/null 2>&1; then
        echo "⚠ Diagnostics bridge already running (PID: $(cat $DIAGNOSTICS_BRIDGE_PID))"
        return
    fi
    
    echo "Starting diagnostics bridge..."
    cd ros2_packages
    source /opt/ros/humble/setup.bash
    source install/setup.bash
    
    # Start bridge with nohup and proper error handling
    nohup ros2 launch zip_vision vision_diagnostics_bridge.launch.py \
        port:=8767 \
        host:=0.0.0.0 \
        > "$DIAGNOSTICS_BRIDGE_LOG" 2>&1 &
    
    BRIDGE_PID=$!
    echo $BRIDGE_PID > "$DIAGNOSTICS_BRIDGE_PID"
    echo "✓ Diagnostics bridge started (PID: $BRIDGE_PID)"
    cd ..
    sleep 3  # Increased wait time for bridge to initialize
}

function start_frontend() {
    if [ -f "$NEXTJS_PID" ] && ps -p $(cat "$NEXTJS_PID") > /dev/null 2>&1; then
        echo "⚠ Next.js frontend already running (PID: $(cat $NEXTJS_PID))"
        return
    fi
    
    echo "Starting Next.js frontend..."
    npm run dev > "$NEXTJS_LOG" 2>&1 &
    
    FRONTEND_PID=$!
    echo $FRONTEND_PID > "$NEXTJS_PID"
    echo "✓ Next.js frontend started (PID: $FRONTEND_PID)"
    sleep 5
}

function stop_all() {
    echo "Stopping all services..."
    
    if [ -f "$VISION_PIPELINE_PID" ]; then
        PID=$(cat "$VISION_PIPELINE_PID")
        if ps -p $PID > /dev/null 2>&1; then
            kill $PID 2>/dev/null || true
            echo "✓ Stopped vision pipeline (PID: $PID)"
        fi
        rm -f "$VISION_PIPELINE_PID"
    fi
    
    if [ -f "$DIAGNOSTICS_BRIDGE_PID" ]; then
        PID=$(cat "$DIAGNOSTICS_BRIDGE_PID")
        if ps -p $PID > /dev/null 2>&1; then
            kill $PID 2>/dev/null || true
            echo "✓ Stopped diagnostics bridge (PID: $PID)"
        fi
        rm -f "$DIAGNOSTICS_BRIDGE_PID"
    fi
    
    if [ -f "$NEXTJS_PID" ]; then
        PID=$(cat "$NEXTJS_PID")
        if ps -p $PID > /dev/null 2>&1; then
            kill $PID 2>/dev/null || true
            echo "✓ Stopped Next.js frontend (PID: $PID)"
        fi
        rm -f "$NEXTJS_PID"
    fi
    
    # Also kill any remaining processes
    pkill -f "vision_pipeline.launch.py" 2>/dev/null || true
    pkill -f "vision_diagnostics_bridge.launch.py" 2>/dev/null || true
    pkill -f "next dev" 2>/dev/null || true
    
    echo "✓ All services stopped"
}

function status() {
    echo "=== Vision System Status ==="
    echo ""
    
    if [ -f "$VISION_PIPELINE_PID" ] && ps -p $(cat "$VISION_PIPELINE_PID") > /dev/null 2>&1; then
        echo "✓ Vision Pipeline: Running (PID: $(cat $VISION_PIPELINE_PID))"
    else
        echo "✗ Vision Pipeline: Not running"
    fi
    
    if [ -f "$DIAGNOSTICS_BRIDGE_PID" ] && ps -p $(cat "$DIAGNOSTICS_BRIDGE_PID") > /dev/null 2>&1; then
        echo "✓ Diagnostics Bridge: Running (PID: $(cat $DIAGNOSTICS_BRIDGE_PID))"
        if curl -s http://localhost:8767/api/vision/status > /dev/null 2>&1; then
            echo "  → HTTP API responding on port 8767"
        else
            echo "  → HTTP API not responding"
        fi
    else
        echo "✗ Diagnostics Bridge: Not running"
    fi
    
    if [ -f "$NEXTJS_PID" ] && ps -p $(cat "$NEXTJS_PID") > /dev/null 2>&1; then
        echo "✓ Next.js Frontend: Running (PID: $(cat $NEXTJS_PID))"
        if curl -s http://localhost:3000/vision-diagnostics > /dev/null 2>&1; then
            echo "  → Frontend responding on port 3000"
        else
            echo "  → Frontend not responding"
        fi
    else
        echo "✗ Next.js Frontend: Not running"
    fi
    
    echo ""
    echo "ROS 2 Topics:"
    cd ros2_packages
    source /opt/ros/humble/setup.bash
    source install/setup.bash
    ros2 topic list 2>&1 | grep -E "(camera|detection)" | head -5 || echo "  No topics found"
    cd ..
}

# Main
case "${1:-start}" in
    start)
        start_vision_pipeline
        start_diagnostics_bridge
        start_frontend
        echo ""
        echo "=== All Services Started ==="
        echo "Vision Pipeline: http://localhost:8767/api/vision/status"
        echo "Frontend: http://localhost:3000/vision-diagnostics"
        echo ""
        echo "To check status: $0 status"
        echo "To stop: $0 stop"
        ;;
    stop)
        stop_all
        ;;
    status)
        status
        ;;
    restart)
        stop_all
        sleep 2
        start_vision_pipeline
        start_diagnostics_bridge
        start_frontend
        ;;
    *)
        echo "Usage: $0 [start|stop|status|restart]"
        exit 1
        ;;
esac
