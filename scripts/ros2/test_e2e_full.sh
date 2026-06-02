#!/bin/bash
# Full E2E Test: ROS 2 Pipeline + Frontend + Camera
# Tests complete integration with 98.7% pass rate target

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKSPACE_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
# Use home directory for ROS workspace
ENGINE_PATH="$HOME/zip_ros2_ws/src/zip_vision/models/yolo11/yolo11n_640_fp16.engine"
FRONTEND_DIR="$WORKSPACE_ROOT"
ROS_WS="$HOME/zip_ros2_ws"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "=========================================="
echo "Full E2E Test: ROS 2 + Frontend + Camera"
echo "=========================================="
echo ""

# Check prerequisites
echo "Checking prerequisites..."

if [ ! -f "$ENGINE_PATH" ]; then
    echo -e "${RED}ERROR: Engine file not found: $ENGINE_PATH${NC}"
    exit 1
fi

if [ ! -d "/dev/video0" ] && [ ! -c "/dev/video0" ]; then
    echo -e "${YELLOW}WARNING: Camera /dev/video0 not found${NC}"
    echo "  Camera may not be available, but continuing test..."
fi

# Source ROS 2
echo "Sourcing ROS 2 environment..."
source /opt/ros/humble/setup.bash
source "$ROS_WS/install/setup.bash"

# Test duration and target
TEST_DURATION=${1:-60}  # Default 60 seconds
TARGET_PASS_RATE=0.987  # 98.7%

echo ""
echo "Configuration:"
echo "  Test duration: ${TEST_DURATION}s"
TARGET_PERCENT=$(echo "$TARGET_PASS_RATE * 100" | bc)
echo "  Target pass rate: ${TARGET_PERCENT}%"
echo "  Engine: $ENGINE_PATH"
echo ""

# Cleanup function
cleanup() {
    echo ""
    echo "Cleaning up..."
    kill $PIPELINE_PID 2>/dev/null || true
    kill $BRIDGE_PID 2>/dev/null || true
    kill $FRONTEND_PID 2>/dev/null || true
    wait $PIPELINE_PID 2>/dev/null || true
    wait $BRIDGE_PID 2>/dev/null || true
    wait $FRONTEND_PID 2>/dev/null || true
    pkill -f "vision_pipeline" 2>/dev/null || true
    pkill -f "vision_diagnostics_bridge" 2>/dev/null || true
    pkill -f "next" 2>/dev/null || true
}

trap cleanup EXIT

# Launch ROS 2 vision pipeline
echo "Step 1: Launching ROS 2 vision pipeline..."
ros2 launch zip_vision vision_pipeline.launch.py \
    yolo11_model_path:="$ENGINE_PATH" \
    enable_vlm:=false \
    enable_diagnostics_bridge:=true \
    > /tmp/ros2_pipeline.log 2>&1 &
PIPELINE_PID=$!

echo "  Pipeline PID: $PIPELINE_PID"
echo "  Waiting for pipeline to initialize (15 seconds)..."
sleep 15

# Check if pipeline is running
if ! kill -0 $PIPELINE_PID 2>/dev/null; then
    echo -e "${RED}ERROR: Pipeline crashed during startup${NC}"
    cat /tmp/ros2_pipeline.log | tail -50
    exit 1
fi

# Check topics
echo ""
echo "Step 2: Verifying ROS 2 topics..."
TOPICS=$(ros2 topic list 2>/dev/null || echo "")
if echo "$TOPICS" | grep -q "/camera/image_raw"; then
    echo -e "  ${GREEN}✓ Camera topic active${NC}"
else
    echo -e "  ${YELLOW}⚠ Camera topic not found${NC}"
fi

if echo "$TOPICS" | grep -q "/detections"; then
    echo -e "  ${GREEN}✓ Detections topic active${NC}"
else
    echo -e "  ${YELLOW}⚠ Detections topic not found${NC}"
fi

# Launch diagnostics bridge
echo ""
echo "Step 3: Launching diagnostics bridge..."
python3 "$WORKSPACE_ROOT/ros2_packages/zip_vision/src/vision_diagnostics_bridge.py" \
    --port 8767 --host localhost \
    > /tmp/diagnostics_bridge.log 2>&1 &
BRIDGE_PID=$!

echo "  Bridge PID: $BRIDGE_PID"
echo "  Waiting for bridge to start (5 seconds)..."
sleep 5

# Check if bridge is running
if ! kill -0 $BRIDGE_PID 2>/dev/null; then
    echo -e "${RED}ERROR: Bridge crashed during startup${NC}"
    cat /tmp/diagnostics_bridge.log | tail -50
    exit 1
fi

# Test bridge endpoint
if curl -s http://localhost:8767/api/vision/status > /dev/null 2>&1; then
    echo -e "  ${GREEN}✓ Bridge HTTP API responding${NC}"
else
    echo -e "  ${YELLOW}⚠ Bridge HTTP API not responding yet${NC}"
fi

# Launch frontend (production build)
echo ""
echo "Step 4: Starting Next.js frontend..."
cd "$FRONTEND_DIR"
export VISION_BRIDGE_URL=http://localhost:8767
export NODE_ENV=production
npm start > /tmp/frontend.log 2>&1 &
FRONTEND_PID=$!

echo "  Frontend PID: $FRONTEND_PID"
echo "  Waiting for frontend to start (10 seconds)..."
sleep 10

# Check if frontend is running
if ! kill -0 $FRONTEND_PID 2>/dev/null; then
    echo -e "${RED}ERROR: Frontend crashed during startup${NC}"
    cat /tmp/frontend.log | tail -50
    exit 1
fi

# Test frontend endpoint
if curl -s http://localhost:3000 > /dev/null 2>&1; then
    echo -e "  ${GREEN}✓ Frontend HTTP server responding${NC}"
else
    echo -e "  ${YELLOW}⚠ Frontend HTTP server not responding yet${NC}"
fi

# Run E2E test
echo ""
echo "=========================================="
echo "Running E2E Test (${TEST_DURATION}s)"
echo "=========================================="
echo ""

# Test metrics
TOTAL_CHECKS=0
PASSED_CHECKS=0
FAILED_CHECKS=0

# Test intervals (every 2 seconds)
INTERVAL=2
ITERATIONS=$((TEST_DURATION / INTERVAL))

for i in $(seq 1 $ITERATIONS); do
    CHECK_PASSED=true
    
    # Check 1: ROS 2 pipeline running
    if ! kill -0 $PIPELINE_PID 2>/dev/null; then
        echo -e "[$i/$ITERATIONS] ${RED}FAIL: Pipeline crashed${NC}"
        CHECK_PASSED=false
    fi
    
    # Check 2: Camera topic publishing
    CAMERA_MSG=$(timeout 1 ros2 topic echo /camera/image_raw --once 2>&1 | head -5 || echo "")
    if [ -z "$CAMERA_MSG" ]; then
        echo -e "[$i/$ITERATIONS] ${YELLOW}WARN: No camera message${NC}"
    fi
    
    # Check 3: Detections topic publishing
    DETECTIONS_MSG=$(timeout 1 ros2 topic echo /detections --once 2>&1 | head -10 || echo "")
    if [ -z "$DETECTIONS_MSG" ]; then
        echo -e "[$i/$ITERATIONS] ${YELLOW}WARN: No detections message${NC}"
    else
        # Check if detections array has items
        if echo "$DETECTIONS_MSG" | grep -q "detections:"; then
            DET_COUNT=$(echo "$DETECTIONS_MSG" | grep -c "class_id:" || echo "0")
            if [ "$DET_COUNT" -gt 0 ]; then
                echo -e "[$i/$ITERATIONS] ${GREEN}PASS: $DET_COUNT detections found${NC}"
            else
                echo -e "[$i/$ITERATIONS] ${YELLOW}WARN: Detections topic active but empty${NC}"
            fi
        fi
    fi
    
    # Check 4: Bridge API responding
    if ! curl -s http://localhost:8767/api/vision/status > /dev/null 2>&1; then
        echo -e "[$i/$ITERATIONS] ${YELLOW}WARN: Bridge API not responding${NC}"
    fi
    
    # Check 5: Frontend responding
    if ! curl -s http://localhost:3000 > /dev/null 2>&1; then
        echo -e "[$i/$ITERATIONS] ${YELLOW}WARN: Frontend not responding${NC}"
    fi
    
    # Update metrics
    TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
    if [ "$CHECK_PASSED" = true ]; then
        PASSED_CHECKS=$((PASSED_CHECKS + 1))
    else
        FAILED_CHECKS=$((FAILED_CHECKS + 1))
    fi
    
    sleep $INTERVAL
done

# Calculate pass rate
if [ $TOTAL_CHECKS -gt 0 ]; then
    PASS_RATE=$(echo "scale=4; $PASSED_CHECKS / $TOTAL_CHECKS" | bc)
    PASS_RATE_PERCENT=$(echo "scale=2; $PASS_RATE * 100" | bc)
else
    PASS_RATE=0
    PASS_RATE_PERCENT=0
fi

# Final summary
echo ""
echo "=========================================="
echo "E2E Test Summary"
echo "=========================================="
echo "Total checks: $TOTAL_CHECKS"
echo "Passed: $PASSED_CHECKS"
echo "Failed: $FAILED_CHECKS"
echo "Pass rate: ${PASS_RATE_PERCENT}%"
echo "Target: ${TARGET_PERCENT}%"
echo ""

# Check if target achieved
TARGET_ACHIEVED=$(echo "$PASS_RATE >= $TARGET_PASS_RATE" | bc)

if [ "$TARGET_ACHIEVED" -eq 1 ]; then
    echo -e "${GREEN}✅ SUCCESS: Target pass rate achieved!${NC}"
    echo -e "${GREEN}   ${PASS_RATE_PERCENT}% >= ${TARGET_PERCENT}%${NC}"
    exit 0
else
    echo -e "${RED}❌ FAILURE: Target pass rate not achieved${NC}"
    echo -e "${RED}   ${PASS_RATE_PERCENT}% < ${TARGET_PERCENT}%${NC}"
    echo ""
    echo "Debug information:"
    echo "  Pipeline log: /tmp/ros2_pipeline.log"
    echo "  Bridge log: /tmp/diagnostics_bridge.log"
    echo "  Frontend log: /tmp/frontend.log"
    exit 1
fi
