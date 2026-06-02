#!/bin/bash
# YOLOE Camera Confidence Test
# Tests detection confidence with live camera feed
# Target: 98.7% confidence threshold validation

set -e

CONTAINER="vision-service-dev"
TEST_DURATION=${TEST_DURATION:-120}  # 2 minutes of testing
CONFIDENCE_TARGET=0.987
SAMPLE_INTERVAL=2  # Sample every 2 seconds

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo "=========================================="
echo "YOLOE Camera Confidence Test"
echo "Target Confidence: ${CONFIDENCE_TARGET} (98.7%)"
echo "Test Duration: ${TEST_DURATION} seconds"
echo "=========================================="
echo ""

# Check container
if ! docker ps | grep -q "$CONTAINER"; then
    echo -e "${RED}✗ Container $CONTAINER is not running${NC}"
    exit 1
fi

# Check diagnostics bridge
echo "Step 1: Checking diagnostics bridge..."
if curl -s http://localhost:8767/api/vision/status > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Diagnostics bridge is accessible${NC}"
else
    echo -e "${RED}✗ Diagnostics bridge not accessible${NC}"
    exit 1
fi

# Get current configuration
echo ""
echo "Step 2: Getting current configuration..."
CONFIG=$(curl -s http://localhost:8767/api/vision/config 2>/dev/null || echo '{}')
CURRENT_CONF=$(echo "$CONFIG" | python3 -c "import sys, json; d=json.load(sys.stdin); print(d.get('config', {}).get('confidenceThreshold', 0.5))" 2>/dev/null || echo "0.5")
echo "Current confidence threshold: $CURRENT_CONF"

# Test function
test_confidence() {
    local conf_thresh=$1
    echo ""
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}Testing with confidence threshold: $conf_thresh${NC}"
    echo -e "${BLUE}========================================${NC}"
    
    local total_detections=0
    local high_conf_detections=0
    local samples=0
    local frames_with_detections=0
    
    echo "Sampling detections for ${TEST_DURATION} seconds..."
    echo "  (sampling every ${SAMPLE_INTERVAL} seconds)"
    
    local start_time=$(date +%s)
    local end_time=$((start_time + TEST_DURATION))
    
    while [ $(date +%s) -lt $end_time ]; do
        # Get detections
        local response=$(curl -s http://localhost:8767/api/vision/detections 2>/dev/null || echo '{"detections":[]}')
        
        # Parse detections
        local detections_json=$(echo "$response" | python3 << 'PYEOF'
import sys, json
try:
    data = json.load(sys.stdin)
    detections = data.get('detections', [])
    print(json.dumps(detections))
except:
    print('[]')
PYEOF
)
        
        local det_count=$(echo "$detections_json" | python3 -c "import sys, json; d=json.load(sys.stdin); print(len(d))" 2>/dev/null || echo "0")
        
        if [ "$det_count" -gt 0 ]; then
            frames_with_detections=$((frames_with_detections + 1))
            
            # Count high confidence detections
            local high_conf=$(echo "$detections_json" | python3 -c "
import sys, json
conf_thresh = $conf_thresh
d = json.load(sys.stdin)
high = sum(1 for det in d if det.get('confidence', 0) >= conf_thresh)
total = len(d)
print(f'{high},{total}')
" 2>/dev/null || echo "0,0")
            
            local high=$(echo "$high_conf" | cut -d',' -f1)
            local total=$(echo "$high_conf" | cut -d',' -f2)
            
            high_conf_detections=$((high_conf_detections + high))
            total_detections=$((total_detections + total))
            
            # Show sample
            if [ $samples -lt 5 ] || [ $((samples % 10)) -eq 0 ]; then
                echo "  Sample $samples: $total detections, $high above threshold $conf_thresh"
            fi
        fi
        
        samples=$((samples + 1))
        sleep $SAMPLE_INTERVAL
    done
    
    # Calculate metrics
    echo ""
    echo "Results:"
    echo "  Total samples: $samples"
    echo "  Frames with detections: $frames_with_detections"
    echo "  Total detections: $total_detections"
    echo "  High confidence (>= $conf_thresh): $high_conf_detections"
    
    if [ $total_detections -gt 0 ]; then
        local ratio=$(echo "scale=4; $high_conf_detections / $total_detections" | bc)
        local ratio_pct=$(echo "scale=2; $ratio * 100" | bc)
        
        echo "  High confidence ratio: ${ratio_pct}%"
        
        # Check if meets target
        if (( $(echo "$ratio >= $CONFIDENCE_TARGET" | bc -l) )); then
            echo -e "${GREEN}✓ PASS: Ratio ${ratio_pct}% >= 98.7%${NC}"
            return 0
        else
            echo -e "${YELLOW}⚠ FAIL: Ratio ${ratio_pct}% < 98.7%${NC}"
            return 1
        fi
    else
        echo -e "${RED}✗ FAIL: No detections found${NC}"
        return 1
    fi
}

# Run tests with different confidence thresholds
echo ""
echo "Step 3: Running confidence tests..."
echo ""

PASSED=0
FAILED=0

# Test with target confidence
if test_confidence "$CONFIDENCE_TARGET"; then
    PASSED=$((PASSED + 1))
else
    FAILED=$((FAILED + 1))
fi

# Also test with slightly lower threshold to see behavior
echo ""
if test_confidence "0.95"; then
    PASSED=$((PASSED + 1))
else
    FAILED=$((FAILED + 1))
fi

# Summary
echo ""
echo "=========================================="
echo "Test Summary"
echo "=========================================="
echo "Tests passed: $PASSED"
echo "Tests failed: $FAILED"
echo ""

if [ $PASSED -gt 0 ]; then
    echo -e "${GREEN}✓ At least one configuration passed${NC}"
    exit 0
else
    echo -e "${RED}✗ All tests failed${NC}"
    exit 1
fi
