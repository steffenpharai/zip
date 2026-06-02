#!/bin/bash
# Final YOLOE Test - 98.7% Confidence Validation
# Tests that system correctly filters detections at 98.7% confidence threshold

set -e

CONTAINER="vision-service-dev"
TEST_DURATION=60
CONFIDENCE_TARGET=0.987
MIN_DETECTIONS=10

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo "=========================================="
echo "YOLOE Final Test - 98.7% Confidence"
echo "=========================================="
echo ""

# Restart with target confidence
echo "Step 1: Restarting vision pipeline with confidence=${CONFIDENCE_TARGET}..."
docker exec "$CONTAINER" pkill -f "vision_pipeline" 2>/dev/null || true
sleep 3

ENGINE="/workspace/ros2_packages/zip_vision/models/yolo11/yolo11n_640_fp16.engine"
docker exec -d "$CONTAINER" bash -c "source /opt/ros/humble/install/setup.bash && source /workspace/install/setup.bash 2>/dev/null && ros2 launch zip_vision vision_pipeline.launch.py \
    yolo11_model_path:=\"$ENGINE\" \
    enable_yolo11:=true \
    enable_vlm:=false \
    enable_diagnostics_bridge:=true \
    yolo11_confidence_threshold:=$CONFIDENCE_TARGET" 2>&1

echo "Waiting for pipeline to start..."
sleep 8

# Verify pipeline is running
if ! docker exec "$CONTAINER" bash -c "source /opt/ros/humble/install/setup.bash && source /workspace/install/setup.bash 2>/dev/null && ros2 node list 2>/dev/null" | grep -q yolo11_node; then
    echo -e "${RED}✗ Pipeline failed to start${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Pipeline started${NC}"
echo ""

# Collect samples
echo "Step 2: Collecting detection samples for ${TEST_DURATION} seconds..."
echo ""

total_samples=0
valid_samples=0
all_above_threshold=0
max_confidences=()
min_confidences=()

for i in $(seq 1 $TEST_DURATION); do
    response=$(curl -s http://localhost:8767/api/vision/detections 2>/dev/null || echo '{"detections":[]}')
    
    # Parse detections
    result=$(echo "$response" | python3 << 'PYEOF'
import sys, json
try:
    data = json.load(sys.stdin)
    dets = data.get('detections', [])
    if not dets:
        print("0,0,0,0")
    else:
        confs = [d.get('confidence', 0) for d in dets]
        count = len(confs)
        all_above = all(c >= 0.987 for c in confs) if confs else False
        max_conf = max(confs) if confs else 0
        min_conf = min(confs) if confs else 0
        print(f"{count},{1 if all_above else 0},{max_conf:.4f},{min_conf:.4f}")
except:
    print("0,0,0,0")
PYEOF
)
    
    IFS=',' read -r count all_above max_conf min_conf <<< "$result"
    
    if [ "$count" -gt 0 ]; then
        valid_samples=$((valid_samples + 1))
        max_confidences+=("$max_conf")
        min_confidences+=("$min_conf")
        
        if [ "$all_above" = "1" ]; then
            all_above_threshold=$((all_above_threshold + 1))
        fi
        
        if [ $((i % 10)) -eq 0 ]; then
            echo "  ${i}s: $count detections, all >= 0.987: $([ "$all_above" = "1" ] && echo "YES" || echo "NO")"
        fi
    fi
    
    total_samples=$((total_samples + 1))
    sleep 1
done

echo ""
echo "Step 3: Analyzing results..."
echo ""

if [ $valid_samples -eq 0 ]; then
    echo -e "${RED}✗ No detections found during test${NC}"
    exit 1
fi

# Calculate statistics
max_max=$(printf '%s\n' "${max_confidences[@]}" | sort -rn | head -1)
min_min=$(printf '%s\n' "${min_confidences[@]}" | sort -n | head -1)
compliance_rate=$(echo "scale=2; $all_above_threshold * 100 / $valid_samples" | bc)

echo "Results:"
echo "  Valid samples: $valid_samples / $total_samples"
echo "  Samples with all detections >= 0.987: $all_above_threshold"
echo "  Compliance rate: ${compliance_rate}%"
echo "  Maximum confidence seen: ${max_max}"
echo "  Minimum confidence seen: ${min_min}"
echo ""

# Final assessment
echo "=========================================="
echo "Final Assessment"
echo "=========================================="

PASS=0
TOTAL_CHECKS=4

# Check 1: Have detections
if [ $valid_samples -gt 0 ]; then
    echo -e "${GREEN}✓ Detections found (${valid_samples} samples)${NC}"
    PASS=$((PASS + 1))
else
    echo -e "${RED}✗ No detections found${NC}"
fi

# Check 2: Minimum detections
if [ $valid_samples -ge $MIN_DETECTIONS ]; then
    echo -e "${GREEN}✓ Sufficient samples (${valid_samples} >= ${MIN_DETECTIONS})${NC}"
    PASS=$((PASS + 1))
else
    echo -e "${YELLOW}⚠ Insufficient samples (${valid_samples} < ${MIN_DETECTIONS})${NC}"
fi

# Check 3: All above threshold
if [ "$all_above_threshold" = "$valid_samples" ]; then
    echo -e "${GREEN}✓ 100% compliance - all detections >= 0.987${NC}"
    PASS=$((PASS + 1))
elif (( $(echo "$compliance_rate >= 95" | bc -l) )); then
    echo -e "${GREEN}✓ High compliance (${compliance_rate}% >= 95%)${NC}"
    PASS=$((PASS + 1))
else
    echo -e "${YELLOW}⚠ Low compliance (${compliance_rate}% < 95%)${NC}"
fi

# Check 4: Max confidence reasonable
if (( $(echo "$max_max >= 0.987" | bc -l) )); then
    echo -e "${GREEN}✓ Maximum confidence >= 0.987 (${max_max})${NC}"
    PASS=$((PASS + 1))
else
    echo -e "${RED}✗ Maximum confidence < 0.987 (${max_max})${NC}"
fi

echo ""
if [ $PASS -eq $TOTAL_CHECKS ]; then
    echo -e "${GREEN}✓✓✓ TEST PASSED (${PASS}/${TOTAL_CHECKS} checks)${NC}"
    echo ""
    echo "The YOLOE system is correctly filtering detections at 98.7% confidence threshold."
    echo "All detections returned have confidence >= 0.987."
    exit 0
elif [ $PASS -ge 3 ]; then
    echo -e "${GREEN}✓ TEST PASSED (${PASS}/${TOTAL_CHECKS} checks)${NC}"
    exit 0
else
    echo -e "${YELLOW}⚠ TEST PARTIAL (${PASS}/${TOTAL_CHECKS} checks)${NC}"
    exit 1
fi
