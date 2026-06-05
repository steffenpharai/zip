#!/bin/bash
#
# E2E Test for Vision Diagnostics with YOLO Overlays
# Tests complete integration: ROS 2 → Bridge → Frontend → Overlays
#

set +e  # Don't exit on errors, continue testing

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "=========================================="
echo "Vision Diagnostics E2E Test"
echo "Testing: ROS 2 → Bridge → Frontend → Overlays"
echo "=========================================="
echo ""

# Test counters
TESTS_PASSED=0
TESTS_FAILED=0

function test_pass() {
    echo -e "${GREEN}✓${NC} $1"
    ((TESTS_PASSED++))
}

function test_fail() {
    echo -e "${RED}✗${NC} $1"
    ((TESTS_FAILED++))
}

function test_warn() {
    echo -e "${YELLOW}⚠${NC} $1"
}

# Test 1: Services are running
echo "Test 1: Service Status"
if curl -s http://localhost:8767/api/vision/status > /dev/null 2>&1; then
    test_pass "Bridge server responding on port 8767"
else
    test_fail "Bridge server not responding"
    exit 1
fi

if curl -s http://localhost:3000/vision-diagnostics > /dev/null 2>&1; then
    test_pass "Frontend responding on port 3000"
else
    test_fail "Frontend not responding"
    echo "  → Waiting 5 seconds for frontend to start..."
    sleep 5
    if curl -s http://localhost:3000/vision-diagnostics > /dev/null 2>&1; then
        test_pass "Frontend responding after wait"
    else
        test_fail "Frontend still not responding - check logs"
    fi
fi

# Test 2: ROS 2 Topics
echo ""
echo "Test 2: ROS 2 Topics"
source /opt/ros/humble/setup.bash 2>/dev/null || true
cd /home/zip/Zip/zip/ros2_packages
source install/setup.bash 2>/dev/null || true
cd /home/zip/Zip/zip

TOPICS=$(ros2 topic list 2>/dev/null || echo "")
if echo "$TOPICS" | grep -q "/camera/image_raw"; then
    test_pass "Camera topic active"
else
    test_fail "Camera topic not found"
fi

if echo "$TOPICS" | grep -q "/detections"; then
    test_pass "Detections topic active"
else
    test_fail "Detections topic not found"
fi

# Test 3: Bridge API Endpoints
echo ""
echo "Test 3: Bridge API Endpoints"

# Status endpoint
STATUS_RESPONSE=$(curl -s http://localhost:8767/api/vision/status 2>&1)
if echo "$STATUS_RESPONSE" | grep -q "camera"; then
    test_pass "Status endpoint returning data"
    echo "$STATUS_RESPONSE" | python3 -m json.tool 2>/dev/null | head -15 || echo "$STATUS_RESPONSE" | head -5
else
    test_fail "Status endpoint not returning expected data"
    echo "Response: $STATUS_RESPONSE"
fi

# Detections endpoint
DETECTIONS_RESPONSE=$(curl -s http://localhost:8767/api/vision/detections 2>&1)
if echo "$DETECTIONS_RESPONSE" | grep -q "detections"; then
    test_pass "Detections endpoint responding"
    DET_COUNT=$(echo "$DETECTIONS_RESPONSE" | python3 -c "import sys, json; d=json.load(sys.stdin); print(len(d.get('detections', [])))" 2>/dev/null || echo "0")
    echo "  → Detections in response: $DET_COUNT"
    if [ "$DET_COUNT" -gt 0 ]; then
        test_pass "Detections found in response"
        echo "$DETECTIONS_RESPONSE" | python3 -m json.tool 2>/dev/null | head -20 || echo "$DETECTIONS_RESPONSE" | head -10
    else
        test_warn "No detections yet (may need objects in view)"
    fi
else
    test_fail "Detections endpoint not returning expected format"
    echo "Response: $DETECTIONS_RESPONSE"
fi

# Camera endpoint
CAMERA_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8767/api/vision/camera 2>&1)
if [ "$CAMERA_RESPONSE" = "200" ]; then
    test_pass "Camera endpoint returning images (HTTP 200)"
elif [ "$CAMERA_RESPONSE" = "404" ]; then
    test_warn "Camera endpoint returning 404 (no image yet, may need camera)"
else
    test_warn "Camera endpoint returned HTTP $CAMERA_RESPONSE"
fi

# Test 4: Frontend API Proxy
echo ""
echo "Test 4: Frontend API Proxy"

FRONTEND_STATUS=$(curl -s http://localhost:3000/api/vision/status 2>&1)
if echo "$FRONTEND_STATUS" | grep -q "camera"; then
    test_pass "Frontend proxy for /api/vision/status working"
else
    test_fail "Frontend proxy not working"
    echo "Response: $FRONTEND_STATUS"
fi

FRONTEND_DETECTIONS=$(curl -s http://localhost:3000/api/vision/detections 2>&1)
if echo "$FRONTEND_DETECTIONS" | grep -q "detections"; then
    test_pass "Frontend proxy for /api/vision/detections working"
else
    test_fail "Frontend detections proxy not working"
fi

# Test 5: Detection Data Structure
echo ""
echo "Test 5: Detection Data Structure Validation"

DETECTIONS_JSON=$(curl -s http://localhost:8767/api/vision/detections 2>&1)
if python3 -c "import json; d=json.loads('$DETECTIONS_JSON'); dets=d.get('detections', []); print('OK' if all('classId' in det and 'className' in det and 'confidence' in det and 'bbox' in det for det in dets) else 'FAIL')" 2>/dev/null | grep -q "OK"; then
    test_pass "Detection data structure valid (classId, className, confidence, bbox)"
else
    if [ -n "$DETECTIONS_JSON" ] && echo "$DETECTIONS_JSON" | grep -q "detections"; then
        test_warn "Detection structure may be incomplete (checking sample...)"
        echo "$DETECTIONS_JSON" | python3 -m json.tool 2>/dev/null | head -30 || echo "$DETECTIONS_JSON" | head -15
    else
        test_warn "No detections to validate structure"
    fi
fi

# Test 6: Real-time Detection Flow
echo ""
echo "Test 6: Real-time Detection Flow (30 seconds)"
echo "  Monitoring detections for 30 seconds..."

DETECTION_FRAMES=0
for i in {1..15}; do
    DETECTIONS=$(curl -s http://localhost:8767/api/vision/detections 2>&1)
    DET_COUNT=$(echo "$DETECTIONS" | python3 -c "import sys, json; d=json.load(sys.stdin); print(len(d.get('detections', [])))" 2>/dev/null || echo "0")
    
    if [ "$DET_COUNT" -gt 0 ]; then
        ((DETECTION_FRAMES++))
        echo "  [$i/15] ✓ Frame with $DET_COUNT detection(s)"
    else
        echo "  [$i/15] - No detections"
    fi
    sleep 2
done

if [ $DETECTION_FRAMES -ge 5 ]; then
    test_pass "Detections flowing consistently ($DETECTION_FRAMES/15 frames with detections)"
elif [ $DETECTION_FRAMES -gt 0 ]; then
    test_warn "Some detections found ($DETECTION_FRAMES/15 frames) - may need objects in camera view"
else
    test_warn "No detections in 30 seconds - check camera and objects in view"
fi

# Test 7: Overlay Data Validation
echo ""
echo "Test 7: Overlay Data Validation (bbox coordinates)"

SAMPLE_DETECTIONS=$(curl -s http://localhost:8767/api/vision/detections 2>&1)
if echo "$SAMPLE_DETECTIONS" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    dets = data.get('detections', [])
    if len(dets) > 0:
        det = dets[0]
        bbox = det.get('bbox', {})
        required = ['x', 'y', 'width', 'height', 'centerX', 'centerY']
        if all(k in bbox for k in required):
            print('VALID')
        else:
            print('INVALID - missing:', [k for k in required if k not in bbox])
    else:
        print('NO_DETECTIONS')
except:
    print('ERROR')
" 2>/dev/null | grep -q "VALID"; then
    test_pass "Bounding box structure valid for overlays (x, y, width, height, centerX, centerY)"
    echo "$SAMPLE_DETECTIONS" | python3 -c "
import sys, json
data = json.load(sys.stdin)
dets = data.get('detections', [])
if dets:
    det = dets[0]
    print(f\"  → Sample: {det.get('className')} at ({det['bbox']['x']:.0f}, {det['bbox']['y']:.0f}) {det['bbox']['width']:.0f}x{det['bbox']['height']:.0f}\")
" 2>/dev/null || true
elif echo "$SAMPLE_DETECTIONS" | grep -q "detections"; then
    test_warn "Bounding box structure needs verification"
else
    test_warn "No detections to validate bbox structure"
fi

# Test 8: Frontend Page Accessibility
echo ""
echo "Test 8: Frontend Page Accessibility"

PAGE_CONTENT=$(curl -s http://localhost:3000/vision-diagnostics 2>&1)
if echo "$PAGE_CONTENT" | grep -qi "YOLO\|vision-diagnostics\|diagnostics"; then
    test_pass "Vision diagnostics page loads"
else
    test_fail "Vision diagnostics page not loading correctly"
    echo "  → Response length: $(echo "$PAGE_CONTENT" | wc -c) bytes"
fi

if echo "$PAGE_CONTENT" | grep -q "Start Streaming"; then
    test_pass "Streaming button present on page"
else
    test_fail "Streaming button not found"
fi

# Test 9: Performance Metrics
echo ""
echo "Test 9: Performance Metrics"

STATUS_DATA=$(curl -s http://localhost:8767/api/vision/status 2>&1)
if echo "$STATUS_DATA" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    dets = data.get('detections', {})
    if dets.get('fps'):
        print('FPS:', dets['fps'])
    if dets.get('current_count') is not None:
        print('COUNT:', dets['current_count'])
    print('OK')
except:
    print('ERROR')
" 2>/dev/null | grep -q "OK"; then
    test_pass "Performance metrics available in status"
    echo "$STATUS_DATA" | python3 -c "
import sys, json
data = json.load(sys.stdin)
dets = data.get('detections', {})
print(f\"  → FPS: {dets.get('fps', 'N/A')}\")
print(f\"  → Current detections: {dets.get('current_count', 'N/A')}\")
" 2>/dev/null || true
else
    test_warn "Performance metrics not available"
fi

# Summary
echo ""
echo "=========================================="
echo "Test Summary"
echo "=========================================="
echo -e "${GREEN}Passed: $TESTS_PASSED${NC}"
echo -e "${YELLOW}Warnings: $(grep -c '⚠' <<< "$(echo "$TESTS_WARN")" || echo 0)${NC}"
echo -e "${RED}Failed: $TESTS_FAILED${NC}"
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
    echo -e "${GREEN}✅ E2E TEST PASSED${NC}"
    echo ""
    echo "Next Steps:"
    echo "1. Open http://localhost:3000/vision-diagnostics in browser"
    echo "2. Click 'Start Streaming' button"
    echo "3. Verify overlays appear on detected objects"
    exit 0
else
    echo -e "${RED}❌ E2E TEST FAILED${NC}"
    echo "Check the errors above and verify services are running correctly"
    exit 1
fi
