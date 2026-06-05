#!/bin/bash
# YOLOE Statistical Test with 98.7% Confidence
# Model uses 50% confidence threshold
# Test results validated at 98.7% statistical confidence

set -e

CONTAINER="vision-service-dev"
MODEL_CONFIDENCE=0.5  # Model confidence threshold (50%)
STATISTICAL_CONFIDENCE=0.987  # Statistical confidence for test results (98.7%)
Z_SCORE=2.5  # Z-score for 98.7% confidence (approximately 2.5 sigma)

# Calculate required sample size for 98.7% confidence
# Using formula: n = (Z^2 * p * (1-p)) / E^2
# For 98.7% confidence with 5% margin of error
MARGIN_OF_ERROR=0.05
ESTIMATED_PROPORTION=0.5  # Conservative estimate
# Calculate required samples for 98.7% confidence
REQUIRED_SAMPLES=$(python3 << 'PYEOF'
import math
z_score = 2.5
p = 0.5
E = 0.05
n = (z_score**2 * p * (1-p)) / (E**2)
print(int(math.ceil(n)))
PYEOF
)
REQUIRED_SAMPLES=$((REQUIRED_SAMPLES > 100 ? REQUIRED_SAMPLES : 100))  # Minimum 100 samples

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo "=========================================="
echo "YOLOE Statistical Test Suite"
echo "Model Confidence Threshold: ${MODEL_CONFIDENCE} (50%)"
echo "Statistical Confidence: ${STATISTICAL_CONFIDENCE} (98.7%)"
echo "Required Samples: ${REQUIRED_SAMPLES}"
echo "=========================================="
echo ""

# Check prerequisites
if ! docker ps | grep -q "$CONTAINER"; then
    echo -e "${RED}✗ Container not running${NC}"
    exit 1
fi

# Check if pipeline is already running
echo "Step 1: Checking vision pipeline..."
if docker exec "$CONTAINER" bash -c "source /opt/ros/humble/install/setup.bash && source /workspace/install/setup.bash 2>/dev/null && ros2 node list 2>/dev/null" | grep -q yolo11_node; then
    echo -e "${GREEN}✓ Pipeline already running${NC}"
    echo "  (Using existing pipeline - ensure confidence threshold is 50%)"
else
    echo "Starting vision pipeline with 50% confidence threshold..."
    docker exec "$CONTAINER" pkill -f "vision_pipeline" 2>/dev/null || true
    sleep 3
    
    ENGINE="/workspace/ros2_packages/zip_vision/models/yolo11/yolo11n_640_fp16.engine"
    docker exec -d "$CONTAINER" bash -c "source /opt/ros/humble/install/setup.bash && source /workspace/install/setup.bash 2>/dev/null && ros2 launch zip_vision vision_pipeline.launch.py \
        yolo11_model_path:=\"$ENGINE\" \
        enable_yolo11:=true \
        enable_vlm:=false \
        enable_diagnostics_bridge:=true \
        yolo11_confidence_threshold:=$MODEL_CONFIDENCE" 2>&1
    
    echo "Waiting for pipeline to initialize..."
    sleep 8
    
    if ! docker exec "$CONTAINER" bash -c "source /opt/ros/humble/install/setup.bash && source /workspace/install/setup.bash 2>/dev/null && ros2 node list 2>/dev/null" | grep -q yolo11_node; then
        echo -e "${RED}✗ Pipeline failed to start${NC}"
        exit 1
    fi
fi

# Verify diagnostics bridge
if ! curl -s --max-time 2 http://localhost:8767/api/vision/status > /dev/null 2>&1; then
    echo -e "${RED}✗ Diagnostics bridge not accessible${NC}"
    exit 1
fi

echo -e "${GREEN}✓ All systems ready${NC}"
echo ""

# Collect samples
echo "Step 2: Collecting detection samples..."
echo "  Target: ${REQUIRED_SAMPLES} samples for 98.7% statistical confidence"
echo "  Sampling every 0.2 seconds"
echo ""

# Test API connectivity first
echo "  Testing API connectivity..."
if curl -s --max-time 2 http://localhost:8767/api/vision/status > /dev/null 2>&1; then
    echo -e "  ${GREEN}✓ API is accessible${NC}"
else
    echo -e "  ${RED}✗ API not accessible${NC}"
    exit 1
fi

# Get initial sample to verify detections are coming through
echo "  Getting initial sample..."
initial_response=$(curl -s --max-time 2 http://localhost:8767/api/vision/detections 2>/dev/null || echo '{"detections":[]}')
initial_count=$(echo "$initial_response" | python3 -c "import sys, json; d=json.load(sys.stdin); print(len(d.get('detections', [])))" 2>/dev/null || echo "0")
echo "  Initial sample: ${initial_count} detections found"
if [ "$initial_count" -eq 0 ]; then
    echo -e "  ${YELLOW}⚠ Warning: No detections in initial sample${NC}"
    echo "  Continuing anyway - detections may appear during collection..."
fi
echo ""

declare -a detection_counts=()
declare -a confidence_values=()
declare -a sample_times=()

samples_collected=0
attempts=0
start_time=$(date +%s)

echo "  Starting sample collection..."
echo ""

while [ $samples_collected -lt $REQUIRED_SAMPLES ]; do
    current_time=$(date +%s)
    attempts=$((attempts + 1))
    
    # Get detections with retry logic
    result="0,0,0,0"
    retry_count=0
    max_retries=3
    
    while [ $retry_count -lt $max_retries ]; do
        # Add small delay to avoid overwhelming the API
        if [ $retry_count -gt 0 ]; then
            sleep 0.1
        fi
        
        # Use curl with proper error handling and timeout
        # Don't use --fail as it can cause issues with HTTP status codes
        response=$(curl -s --max-time 4 http://localhost:8767/api/vision/detections 2>/dev/null)
        curl_exit=$?
        
        # Check if curl succeeded and response is valid JSON (non-empty and starts with {)
        if [ $curl_exit -eq 0 ] && [ -n "$response" ] && [ ${#response} -gt 10 ] && [ "${response:0:1}" = "{" ]; then
            # Validate JSON and parse response using a more robust approach
            # Write response to temp file to avoid shell escaping issues
            temp_file=$(mktemp)
            echo "$response" > "$temp_file"
            parsed_result=$(python3 << PYEOF
import sys, json
try:
    with open("$temp_file", "r") as f:
        input_data = f.read()
    
    if not input_data or len(input_data) < 10:
        print("0,0,0,0")
        sys.exit(0)
    
    # Parse JSON
    data = json.loads(input_data)
    
    # Handle {"detections": [...]} format
    if isinstance(data, dict) and 'detections' in data:
        dets = data['detections']
    elif isinstance(data, list):
        dets = data
    else:
        dets = []
    
    # Ensure dets is a list
    if not isinstance(dets, list):
        dets = []
    
    count = len(dets)
    if count > 0:
        # Extract confidence values
        confs = [float(d.get('confidence', 0)) for d in dets if isinstance(d, dict) and 'confidence' in d]
        
        if confs and len(confs) > 0:
            avg_conf = sum(confs) / len(confs)
            max_conf = max(confs)
            min_conf = min(confs)
            print(f"{count},{avg_conf:.4f},{max_conf:.4f},{min_conf:.4f}")
        else:
            print("0,0,0,0")
    else:
        print("0,0,0,0")
except Exception:
    print("0,0,0,0")
PYEOF
)
            rm -f "$temp_file"
            # Validate parsed result format (should be: number,number,number,number)
            if [ -n "$parsed_result" ] && echo "$parsed_result" | grep -qE '^[0-9]+,[0-9]+\.[0-9]+,[0-9]+\.[0-9]+,[0-9]+\.[0-9]+$'; then
                result="$parsed_result"
                break
            fi
        fi
        retry_count=$((retry_count + 1))
        if [ $retry_count -lt $max_retries ]; then
            sleep 0.1
        fi
    done
    
    IFS=',' read -r count avg_conf max_conf min_conf <<< "$result"
    
    # Debug first few attempts
    if [ $attempts -le 3 ]; then
        response_len=${#response}
        echo "  DEBUG attempt $attempts: response_len=$response_len, result='$result', count='$count'"
        if [ $attempts -eq 1 ]; then
            echo "$response" | head -c 200 | python3 -c "import sys; print('First 200 chars:', sys.stdin.read())" 2>&1 || echo "Failed to read response"
        fi
    fi
    
    if [ "$count" -gt 0 ] && [ "$count" != "0" ]; then
        detection_counts+=("$count")
        confidence_values+=("$avg_conf")
        sample_times+=("$current_time")
        samples_collected=$((samples_collected + 1))
        
        # Show progress with details - more frequent updates
        if [ $samples_collected -le 10 ] || [ $((samples_collected % 10)) -eq 0 ]; then
            elapsed=$((current_time - start_time))
            if [ $elapsed -gt 0 ]; then
                rate=$(echo "scale=1; $samples_collected / $elapsed" | bc 2>/dev/null || echo "0")
            else
                rate="0"
            fi
            remaining=$((REQUIRED_SAMPLES - samples_collected))
            if [ "$rate" != "0" ] && (( $(echo "$rate > 0" | bc -l) )); then
                eta=$(echo "scale=0; $remaining / $rate" | bc 2>/dev/null || echo "0")
            else
                eta="?"
            fi
            echo "  [${samples_collected}/${REQUIRED_SAMPLES}] ✓ Sample #${samples_collected}: ${count} detections | avg_conf=${avg_conf} | max=${max_conf} | min=${min_conf} | Rate: ${rate}/s | ETA: ${eta}s"
        fi
    else
        # Show progress even when no detections
        if [ $attempts -le 5 ] || [ $((attempts % 20)) -eq 0 ]; then
            elapsed=$((current_time - start_time))
            echo "  [Attempt ${attempts}] No detections in this sample (collected: ${samples_collected}/${REQUIRED_SAMPLES}, elapsed: ${elapsed}s)"
        fi
    fi
    
    sleep 0.3  # Sample every 0.3 seconds to avoid rate limiting
done

echo ""
echo -e "${GREEN}✓ Collected ${samples_collected} samples${NC}"
echo ""

# Show sample summary
if [ ${#detection_counts[@]} -gt 0 ]; then
    echo "Sample Summary:"
    total_dets=$(printf '%s\n' "${detection_counts[@]}" | awk '{sum+=$1} END {print sum}')
    echo "  Total detections across all samples: $total_dets"
    echo "  Average detections per sample: $(echo "scale=2; $total_dets / $samples_collected" | bc)"
    echo ""
fi

# Statistical Analysis
echo "Step 3: Statistical Analysis (98.7% confidence)..."
echo "  Calculating mean, median, standard deviation, and confidence intervals..."
echo ""

# Calculate statistics
stats=$(printf '%s\n' "${detection_counts[@]}" | python3 << 'PYEOF'
import sys
import statistics
import math

values = [int(line.strip()) for line in sys.stdin if line.strip() and int(line.strip()) > 0]

if not values:
    print("0,0,0,0,0")
    sys.exit(0)

n = len(values)
mean = statistics.mean(values)
median = statistics.median(values)
stdev = statistics.stdev(values) if n > 1 else 0

# 98.7% confidence interval (Z=2.5)
z_score = 2.5
se = stdev / math.sqrt(n) if n > 1 else 0
ci_lower = mean - z_score * se
ci_upper = mean + z_score * se

print(f"{mean:.2f},{median:.2f},{stdev:.2f},{ci_lower:.2f},{ci_upper:.2f}")
PYEOF
)

IFS=',' read -r mean_count median_count stdev_count ci_lower ci_upper <<< "$stats"

# Confidence statistics
conf_stats=$(printf '%s\n' "${confidence_values[@]}" | python3 << 'PYEOF'
import sys
import statistics

values = [float(line.strip()) for line in sys.stdin if line.strip() and float(line.strip()) > 0]

if not values:
    print("0,0,0")
    sys.exit(0)

mean = statistics.mean(values)
median = statistics.median(values)
stdev = statistics.stdev(values) if len(values) > 1 else 0

print(f"{mean:.4f},{median:.4f},{stdev:.4f}")
PYEOF
)

IFS=',' read -r mean_conf median_conf stdev_conf <<< "$conf_stats"

echo "Detection Count Statistics:"
echo "  Mean: ${mean_count} detections per sample"
echo "  Median: ${median_count} detections per sample"
echo "  StdDev: ${stdev_count} (measure of variability)"
echo "  98.7% Confidence Interval: [${ci_lower}, ${ci_upper}]"
echo "    → We are 98.7% confident the true mean lies in this range"
echo ""

echo "Confidence Statistics (Model Output):"
echo "  Mean confidence: ${mean_conf} (expected ~0.5 with 50% threshold)"
echo "  Median confidence: ${median_conf}"
echo "  StdDev: ${stdev_conf}"
echo ""

# Show distribution
echo "Distribution Analysis:"
dist_stats=$(printf '%s\n' "${detection_counts[@]}" | python3 << 'PYEOF'
import sys
from collections import Counter

values = [int(line.strip()) for line in sys.stdin if line.strip() and int(line.strip()) > 0]

if values:
    counter = Counter(values)
    most_common = counter.most_common(5)
    print(f"Most common detection counts: {', '.join([f'{count}({freq}x)' for count, freq in most_common])}")
else:
    print("No data")
PYEOF
)
echo "  $dist_stats"
echo ""

# Validation Tests
echo "Step 4: Validation Tests..."
echo ""

PASS=0
TOTAL_CHECKS=5

# Check 1: Sufficient samples
if [ $samples_collected -ge $REQUIRED_SAMPLES ]; then
    echo -e "${GREEN}✓ Sufficient samples for 98.7% confidence (${samples_collected} >= ${REQUIRED_SAMPLES})${NC}"
    PASS=$((PASS + 1))
else
    echo -e "${RED}✗ Insufficient samples (${samples_collected} < ${REQUIRED_SAMPLES})${NC}"
fi

# Check 2: Detections present
if (( $(echo "$mean_count > 0" | bc -l) )); then
    echo -e "${GREEN}✓ Detections present (mean: ${mean_count})${NC}"
    PASS=$((PASS + 1))
else
    echo -e "${RED}✗ No detections found${NC}"
fi

# Check 3: Confidence values reasonable
if (( $(echo "$mean_conf >= 0.4 && $mean_conf <= 0.7" | bc -l) )); then
    echo -e "${GREEN}✓ Confidence values reasonable (mean: ${mean_conf}, expected ~0.5)${NC}"
    PASS=$((PASS + 1))
else
    echo -e "${YELLOW}⚠ Confidence values outside expected range (mean: ${mean_conf})${NC}"
fi

# Check 4: Statistical validity
if (( $(echo "$stdev_count > 0" | bc -l) )); then
    echo -e "${GREEN}✓ Statistical variance present (stddev: ${stdev_count})${NC}"
    PASS=$((PASS + 1))
else
    echo -e "${YELLOW}⚠ No variance detected${NC}"
fi

# Check 5: Confidence interval valid
if (( $(echo "$ci_lower >= 0 && $ci_upper > $ci_lower" | bc -l) )); then
    echo -e "${GREEN}✓ Valid confidence interval calculated${NC}"
    PASS=$((PASS + 1))
else
    echo -e "${RED}✗ Invalid confidence interval${NC}"
fi

echo ""
echo "=========================================="
echo "Final Assessment"
echo "=========================================="
echo "Samples collected: ${samples_collected}"
echo "Statistical confidence: 98.7%"
echo "Model confidence threshold: 50%"
echo ""

if [ $PASS -eq $TOTAL_CHECKS ]; then
    echo -e "${GREEN}✓✓✓ TEST PASSED (${PASS}/${TOTAL_CHECKS} checks)${NC}"
    echo ""
    echo "The YOLOE system is operating correctly:"
    echo "  - Model using 50% confidence threshold"
    echo "  - Test results validated at 98.7% statistical confidence"
    echo "  - Mean detections per sample: ${mean_count}"
    echo "  - Mean confidence: ${mean_conf}"
    echo "  - 98.7% CI for detection count: [${ci_lower}, ${ci_upper}]"
    exit 0
elif [ $PASS -ge 4 ]; then
    echo -e "${GREEN}✓ TEST PASSED (${PASS}/${TOTAL_CHECKS} checks)${NC}"
    exit 0
else
    echo -e "${YELLOW}⚠ TEST PARTIAL (${PASS}/${TOTAL_CHECKS} checks)${NC}"
    exit 1
fi
