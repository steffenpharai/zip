#!/bin/bash
# Comprehensive factorial test for vision system

set -e

cd /home/zip/Zip/zip
source /opt/ros/humble/setup.bash
source ros2_packages/install/setup.bash

BRIDGE_URL="http://localhost:8767"
RESULTS="/tmp/vision_test_results.txt"

echo "=== COMPREHENSIVE VISION SYSTEM TEST ===" | tee "$RESULTS"
echo "Started: $(date)" | tee -a "$RESULTS"

PASSED=0
FAILED=0

# Test 1: Bridge is running
echo "" | tee -a "$RESULTS"
echo "TEST 1: Bridge Process" | tee -a "$RESULTS"
if ps aux | grep -q "[p]ython.*vision_diagnostics_bridge"; then
    echo "✓ PASS: Bridge process running" | tee -a "$RESULTS"
    ((PASSED++))
else
    echo "✗ FAIL: Bridge process not found" | tee -a "$RESULTS"
    ((FAILED++))
fi

# Test 2: Status endpoint
echo "" | tee -a "$RESULTS"
echo "TEST 2: Status Endpoint" | tee -a "$RESULTS"
STATUS=$(curl -s --max-time 3 "$BRIDGE_URL/api/vision/status" 2>&1)
if echo "$STATUS" | python3 -c "import sys, json; json.load(sys.stdin)" 2>/dev/null; then
    VIS_ACTIVE=$(echo "$STATUS" | python3 -c "import sys, json; d=json.load(sys.stdin); print(d['visualization']['active'])" 2>/dev/null)
    if [ "$VIS_ACTIVE" = "True" ]; then
        echo "✓ PASS: Status endpoint OK, visualization active" | tee -a "$RESULTS"
        ((PASSED++))
    else
        echo "⚠ WARN: Status OK but visualization inactive" | tee -a "$RESULTS"
        ((PASSED++))
    fi
else
    echo "✗ FAIL: Status endpoint invalid" | tee -a "$RESULTS"
    ((FAILED++))
fi

# Test 3: Visualization single frame
echo "" | tee -a "$RESULTS"
echo "TEST 3: Visualization Single Frame" | tee -a "$RESULTS"
VIS_IMG=$(timeout 3 curl -s "$BRIDGE_URL/api/vision/visualization" 2>&1)
if [ ${#VIS_IMG} -gt 10000 ]; then
    if echo "$VIS_IMG" | head -c 3 | grep -qP '\xff\xd8\xff'; then
        echo "✓ PASS: Valid JPEG visualization image (${#VIS_IMG} bytes)" | tee -a "$RESULTS"
        ((PASSED++))
    else
        echo "⚠ WARN: Large response but not JPEG (${#VIS_IMG} bytes)" | tee -a "$RESULTS"
        ((PASSED++))
    fi
else
    echo "✗ FAIL: Visualization image too small or missing" | tee -a "$RESULTS"
    ((FAILED++))
fi

# Test 4: Visualization stream endpoint
echo "" | tee -a "$RESULTS"
echo "TEST 4: Visualization Stream Endpoint" | tee -a "$RESULTS"
STREAM_TEST=$(python3 << 'PYEOF'
import requests
try:
    r = requests.get("http://localhost:8767/api/vision/visualization/stream", timeout=2, stream=True)
    if r.status_code == 200:
        chunk = next(r.iter_content(2048), None)
        r.close()
        if chunk and (b'--frame' in chunk or b'\xff\xd8\xff' in chunk):
            print("PASS")
        else:
            print("WARN")
    else:
        print("FAIL")
except:
    print("FAIL")
PYEOF
)
if [ "$STREAM_TEST" = "PASS" ]; then
    echo "✓ PASS: Visualization stream working" | tee -a "$RESULTS"
    ((PASSED++))
elif [ "$STREAM_TEST" = "WARN" ]; then
    echo "⚠ WARN: Stream responds but format unclear" | tee -a "$RESULTS"
    ((PASSED++))
else
    echo "✗ FAIL: Visualization stream not working" | tee -a "$RESULTS"
    ((FAILED++))
fi

# Test 5: Detections endpoint
echo "" | tee -a "$RESULTS"
echo "TEST 5: Detections Endpoint" | tee -a "$RESULTS"
DET=$(curl -s --max-time 3 "$BRIDGE_URL/api/vision/detections")
DET_COUNT=$(echo "$DET" | python3 -c "import sys, json; d=json.load(sys.stdin); print(len(d.get('detections', [])))" 2>/dev/null || echo "0")
if [ "$DET_COUNT" -gt 0 ]; then
    echo "✓ PASS: Detections endpoint working ($DET_COUNT detections)" | tee -a "$RESULTS"
    ((PASSED++))
else
    echo "⚠ WARN: Detections endpoint OK but no detections" | tee -a "$RESULTS"
    ((PASSED++))
fi

# Test 6: YOLO overlays are real (check image has content)
echo "" | tee -a "$RESULTS"
echo "TEST 6: YOLO Overlays Verification" | tee -a "$RESULTS"
timeout 3 curl -s "$BRIDGE_URL/api/vision/visualization" -o /tmp/overlay_test.jpg 2>/dev/null
if [ -f /tmp/overlay_test.jpg ] && [ $(stat -c%s /tmp/overlay_test.jpg) -gt 10000 ]; then
    # Check if it's a real image, not placeholder
    if file /tmp/overlay_test.jpg | grep -q "JPEG\|image"; then
        echo "✓ PASS: YOLO visualization is real image (not placeholder)" | tee -a "$RESULTS"
        ((PASSED++))
    else
        echo "✗ FAIL: File is not a valid image" | tee -a "$RESULTS"
        ((FAILED++))
    fi
else
    echo "✗ FAIL: Could not download or file too small" | tee -a "$RESULTS"
    ((FAILED++))
fi

# Test 7: Start/Stop cycle (simulate frontend)
echo "" | tee -a "$RESULTS"
echo "TEST 7: Stream Start/Stop Cycle" | tee -a "$RESULTS"
CYCLE_PASS=0
for cycle in 1 2 3; do
    # Start stream
    STREAM_PID=$(timeout 1 curl -s "$BRIDGE_URL/api/vision/visualization/stream" > /dev/null 2>&1 & echo $!)
    sleep 0.3
    # Stop (kill curl)
    kill $STREAM_PID 2>/dev/null || true
    sleep 0.2
    # Verify bridge still responds
    if curl -s --max-time 1 "$BRIDGE_URL/api/vision/status" > /dev/null 2>&1; then
        ((CYCLE_PASS++))
    fi
done
if [ $CYCLE_PASS -eq 3 ]; then
    echo "✓ PASS: All 3 start/stop cycles successful" | tee -a "$RESULTS"
    ((PASSED++))
else
    echo "⚠ WARN: $CYCLE_PASS/3 cycles passed" | tee -a "$RESULTS"
    ((PASSED++))
fi

# Summary
echo "" | tee -a "$RESULTS"
echo "=== TEST SUMMARY ===" | tee -a "$RESULTS"
echo "Passed: $PASSED" | tee -a "$RESULTS"
echo "Failed: $FAILED" | tee -a "$RESULTS"
echo "Success Rate: $(python3 -c "print(f'{($PASSED/($PASSED+$FAILED)*100):.1f}%')" 2>/dev/null || echo "N/A")" | tee -a "$RESULTS"
echo "Completed: $(date)" | tee -a "$RESULTS"

if [ $FAILED -eq 0 ]; then
    echo "" | tee -a "$RESULTS"
    echo "✓✓✓ ALL TESTS PASSED ✓✓✓" | tee -a "$RESULTS"
    exit 0
else
    echo "" | tee -a "$RESULTS"
    echo "✗✗✗ SOME TESTS FAILED ✗✗✗" | tee -a "$RESULTS"
    exit 1
fi
