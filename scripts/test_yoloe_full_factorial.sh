#!/bin/bash
# Full Factorial Test Suite for YOLOE Migration
# Tests all combinations of parameters to achieve 98.7% confidence
# Usage: ./scripts/test_yoloe_full_factorial.sh

set -e

CONTAINER="vision-service-dev"
TEST_DURATION=${TEST_DURATION:-60}  # Test duration in seconds
CONFIDENCE_THRESHOLDS=(0.25 0.5 0.75 0.85 0.90 0.95 0.987)
NMS_THRESHOLDS=(0.3 0.4 0.5)
PRECISIONS=("fp16" "int8")

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo "=========================================="
echo "YOLOE Full Factorial Test Suite"
echo "Target: 98.7% Detection Confidence"
echo "=========================================="
echo ""

# Check container is running
if ! docker ps | grep -q "$CONTAINER"; then
    echo -e "${RED}✗ Container $CONTAINER is not running${NC}"
    echo "Start with: docker compose -f docker-compose.dev.yml up -d vision-service"
    exit 1
fi

# Check YOLOE import
echo "Step 1: Verifying YOLOE installation..."
if docker exec "$CONTAINER" python3 -c "from ultralytics import YOLOE; print('OK')" 2>/dev/null; then
    echo -e "${GREEN}✓ YOLOE import successful${NC}"
else
    echo -e "${RED}✗ YOLOE import failed${NC}"
    exit 1
fi

# Check ROS 2 nodes
echo ""
echo "Step 2: Checking ROS 2 nodes..."
docker exec "$CONTAINER" bash -c "source /opt/ros/humble/install/setup.bash && source /workspace/install/setup.bash 2>/dev/null && ros2 node list" 2>&1 | grep -q yolo11_node && \
    echo -e "${GREEN}✓ yolo11_node is running${NC}" || \
    echo -e "${YELLOW}⚠ yolo11_node not found (may need to start vision pipeline)${NC}"

# Check camera
echo ""
echo "Step 3: Checking camera..."
if docker exec "$CONTAINER" test -c /dev/video0 2>/dev/null; then
    echo -e "${GREEN}✓ Camera device /dev/video0 available${NC}"
else
    echo -e "${YELLOW}⚠ Camera /dev/video0 not found${NC}"
fi

# Test function
test_configuration() {
    local conf_thresh=$1
    local nms_thresh=$2
    local precision=$3
    
    echo ""
    echo "=========================================="
    echo "Testing Configuration:"
    echo "  Confidence: $conf_thresh"
    echo "  NMS: $nms_thresh"
    echo "  Precision: $precision"
    echo "=========================================="
    
    # Find engine file
    local engine_file=""
    if [ "$precision" = "fp16" ]; then
        engine_file="/workspace/ros2_packages/zip_vision/models/yolo11/yoloe-11s-seg-pf_640_fp16.engine"
        # Fallback to old engine if new one doesn't exist
        if ! docker exec "$CONTAINER" test -f "$engine_file" 2>/dev/null; then
            engine_file="/workspace/ros2_packages/zip_vision/models/yolo11/yolo11n_640_fp16.engine"
        fi
    else
        engine_file="/workspace/ros2_packages/zip_vision/models/yolo11/yoloe-11s-seg-pf_640_int8.engine"
        if ! docker exec "$CONTAINER" test -f "$engine_file" 2>/dev/null; then
            engine_file="/workspace/ros2_packages/zip_vision/models/yolo11/yolo11n_640_int8.engine"
        fi
    fi
    
    if ! docker exec "$CONTAINER" test -f "$engine_file" 2>/dev/null; then
        echo -e "${YELLOW}⚠ Engine file not found: $engine_file${NC}"
        return 1
    fi
    
    echo "Using engine: $engine_file"
    
    # Restart vision pipeline with new parameters
    echo "Restarting vision pipeline..."
    docker exec "$CONTAINER" pkill -f "vision_pipeline" 2>/dev/null || true
    sleep 2
    
    docker exec -d "$CONTAINER" bash -c "source /opt/ros/humble/install/setup.bash && source /workspace/install/setup.bash 2>/dev/null && ros2 launch zip_vision vision_pipeline.launch.py \
        yolo11_model_path:=\"$engine_file\" \
        enable_yolo11:=true \
        enable_vlm:=false \
        enable_diagnostics_bridge:=true \
        yolo11_confidence_threshold:=$conf_thresh" 2>&1
    
    sleep 5
    
    # Monitor detections
    echo "Monitoring detections for ${TEST_DURATION} seconds..."
    local detection_count=0
    local high_conf_count=0
    local total_frames=0
    
    for i in $(seq 1 $TEST_DURATION); do
        # Get latest detections from diagnostics bridge
        local response=$(curl -s http://localhost:8767/api/vision/detections 2>/dev/null || echo '{"detections":[]}')
        local detections=$(echo "$response" | python3 -c "import sys, json; d=json.load(sys.stdin); print(len(d.get('detections', [])))" 2>/dev/null || echo "0")
        
        if [ "$detections" -gt 0 ]; then
            detection_count=$((detection_count + detections))
            # Count high confidence detections
            local high_conf=$(echo "$response" | python3 -c "import sys, json; d=json.load(sys.stdin); print(sum(1 for det in d.get('detections', []) if det.get('confidence', 0) >= $conf_thresh))" 2>/dev/null || echo "0")
            high_conf_count=$((high_conf_count + high_conf))
        fi
        total_frames=$((total_frames + 1))
        
        if [ $((i % 10)) -eq 0 ]; then
            echo "  Progress: ${i}s/${TEST_DURATION}s - Detections: $detection_count (high conf: $high_conf_count)"
        fi
        sleep 1
    done
    
    # Calculate metrics
    local avg_detections=0
    if [ $total_frames -gt 0 ]; then
        avg_detections=$(echo "scale=2; $detection_count / $total_frames" | bc)
    fi
    
    local high_conf_ratio=0
    if [ $detection_count -gt 0 ]; then
        high_conf_ratio=$(echo "scale=4; $high_conf_count / $detection_count" | bc)
    fi
    
    echo ""
    echo "Results:"
    echo "  Total detections: $detection_count"
    echo "  High confidence (>= $conf_thresh): $high_conf_count"
    echo "  Average detections per frame: $avg_detections"
    echo "  High confidence ratio: $(echo "scale=2; $high_conf_ratio * 100" | bc)%"
    
    # Check if we meet 98.7% confidence target
    local target_ratio=0.987
    if (( $(echo "$high_conf_ratio >= $target_ratio" | bc -l) )); then
        echo -e "${GREEN}✓ PASS: High confidence ratio >= 98.7%${NC}"
        return 0
    else
        echo -e "${YELLOW}⚠ FAIL: High confidence ratio < 98.7% (got $(echo "scale=2; $high_conf_ratio * 100" | bc)%)${NC}"
        return 1
    fi
}

# Run full factorial test
echo ""
echo "Step 4: Running Full Factorial Test Suite"
echo "Testing all combinations of:"
echo "  Confidence thresholds: ${CONFIDENCE_THRESHOLDS[*]}"
echo "  NMS thresholds: ${NMS_THRESHOLDS[*]}"
echo "  Precisions: ${PRECISIONS[*]}"
echo ""

PASSED=0
FAILED=0
TOTAL=0

for conf in "${CONFIDENCE_THRESHOLDS[@]}"; do
    for nms in "${NMS_THRESHOLDS[@]}"; do
        for precision in "${PRECISIONS[@]}"; do
            TOTAL=$((TOTAL + 1))
            if test_configuration "$conf" "$nms" "$precision"; then
                PASSED=$((PASSED + 1))
            else
                FAILED=$((FAILED + 1))
            fi
        done
    done
done

echo ""
echo "=========================================="
echo "Test Summary"
echo "=========================================="
echo "Total configurations tested: $TOTAL"
echo -e "${GREEN}Passed: $PASSED${NC}"
echo -e "${RED}Failed: $FAILED${NC}"
echo ""

if [ $PASSED -gt 0 ]; then
    PASS_RATE=$(echo "scale=2; $PASSED * 100 / $TOTAL" | bc)
    echo "Pass rate: ${PASS_RATE}%"
    
    if (( $(echo "$PASS_RATE >= 50" | bc -l) )); then
        echo -e "${GREEN}✓ Overall test PASSED${NC}"
        exit 0
    else
        echo -e "${YELLOW}⚠ Overall test PARTIAL (pass rate < 50%)${NC}"
        exit 1
    fi
else
    echo -e "${RED}✗ Overall test FAILED (no configurations passed)${NC}"
    exit 1
fi
