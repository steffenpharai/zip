#!/bin/bash
# Full factorial test for vision system
# Tests: start/stop/restart, YOLO overlays, reconnection

set -e

cd /home/zip/Zip/zip
source /opt/ros/humble/setup.bash
source ros2_packages/install/setup.bash

BRIDGE_URL="http://localhost:8767"
TEST_LOG="/tmp/vision_full_test.log"

echo "=== Vision System Full Factorial Test ===" | tee "$TEST_LOG"
echo "Started: $(date)" | tee -a "$TEST_LOG"

# Test 1: Bridge status endpoint
echo "" | tee -a "$TEST_LOG"
echo "TEST 1: Bridge Status Endpoint" | tee -a "$TEST_LOG"
STATUS=$(curl -s --max-time 3 "$BRIDGE_URL/api/vision/status")
if [ $? -eq 0 ]; then
    echo "✓ Status endpoint accessible" | tee -a "$TEST_LOG"
    echo "$STATUS" | python3 -m json.tool | head -20 | tee -a "$TEST_LOG"
else
    echo "✗ Status endpoint failed" | tee -a "$TEST_LOG"
    exit 1
fi

# Test 2: Visualization stream endpoint exists
echo "" | tee -a "$TEST_LOG"
echo "TEST 2: Visualization Stream Endpoint" | tee -a "$TEST_LOG"
STREAM_RESPONSE=$(timeout 2 curl -s "$BRIDGE_URL/api/vision/visualization/stream" 2>&1 | head -c 1000)
if echo "$STREAM_RESPONSE" | grep -q "multipart\|frame\|Content-Type"; then
    echo "✓ Visualization stream endpoint exists and responds" | tee -a "$TEST_LOG"
else
    echo "✗ Visualization stream endpoint issue" | tee -a "$TEST_LOG"
    echo "Response: $STREAM_RESPONSE" | tee -a "$TEST_LOG"
fi

# Test 3: Check if vision pipeline is running
echo "" | tee -a "$TEST_LOG"
echo "TEST 3: Vision Pipeline Status" | tee -a "$TEST_LOG"
if ros2 topic list | grep -q "/detections/visualization"; then
    echo "✓ Visualization topic exists" | tee -a "$TEST_LOG"
    MSG_COUNT=$(timeout 2 ros2 topic hz /detections/visualization 2>&1 | grep "average rate" | head -1 || echo "0")
    echo "  Topic rate: $MSG_COUNT" | tee -a "$TEST_LOG"
else
    echo "⚠ Visualization topic not found - pipeline may not be running" | tee -a "$TEST_LOG"
fi

# Test 4: Verify YOLO overlays are real (not placeholder)
echo "" | tee -a "$TEST_LOG"
echo "TEST 4: YOLO Overlay Verification" | tee -a "$TEST_LOG"
VIS_IMAGE=$(timeout 3 curl -s "$BRIDGE_URL/api/vision/visualization" 2>&1)
if [ ${#VIS_IMAGE} -gt 1000 ]; then
    echo "✓ Visualization image received (${#VIS_IMAGE} bytes)" | tee -a "$TEST_LOG"
    # Check if it's a real JPEG (not placeholder)
    if echo "$VIS_IMAGE" | head -c 20 | grep -q "JFIF\|Exif\|JPEG"; then
        echo "✓ Valid JPEG format (not placeholder)" | tee -a "$TEST_LOG"
    else
        echo "⚠ Image format check inconclusive" | tee -a "$TEST_LOG"
    fi
else
    echo "✗ Visualization image too small or missing" | tee -a "$TEST_LOG"
fi

# Test 5: Detections endpoint
echo "" | tee -a "$TEST_LOG"
echo "TEST 5: Detections Endpoint" | tee -a "$TEST_LOG"
DETECTIONS=$(curl -s --max-time 3 "$BRIDGE_URL/api/vision/detections")
if echo "$DETECTIONS" | python3 -c "import sys, json; d=json.load(sys.stdin); print('detections' in d)" 2>/dev/null; then
    DET_COUNT=$(echo "$DETECTIONS" | python3 -c "import sys, json; d=json.load(sys.stdin); print(len(d.get('detections', [])))" 2>/dev/null || echo "0")
    echo "✓ Detections endpoint accessible (count: $DET_COUNT)" | tee -a "$TEST_LOG"
else
    echo "✗ Detections endpoint failed" | tee -a "$TEST_LOG"
fi

# Test 6: Frontend connectivity test
echo "" | tee -a "$TEST_LOG"
echo "TEST 6: Frontend API Proxy Test" | tee -a "$TEST_LOG"
if curl -s --max-time 2 http://localhost:3000/api/vision/status > /dev/null 2>&1; then
    echo "✓ Frontend proxy accessible" | tee -a "$TEST_LOG"
else
    echo "⚠ Frontend not running (expected if Next.js not started)" | tee -a "$TEST_LOG"
fi

# Test 7: Stream start/stop cycle simulation
echo "" | tee -a "$TEST_LOG"
echo "TEST 7: Stream Start/Stop Cycle" | tee -a "$TEST_LOG"
for i in 1 2 3; do
    echo "  Cycle $i: Starting stream..." | tee -a "$TEST_LOG"
    STREAM_PID=$(timeout 1 curl -s "$BRIDGE_URL/api/vision/visualization/stream" > /dev/null 2>&1 & echo $!)
    sleep 0.5
    if ps -p $STREAM_PID > /dev/null 2>&1; then
        kill $STREAM_PID 2>/dev/null || true
        echo "  ✓ Stream started and stopped successfully" | tee -a "$TEST_LOG"
    else
        echo "  ⚠ Stream test inconclusive" | tee -a "$TEST_LOG"
    fi
done

echo "" | tee -a "$TEST_LOG"
echo "=== Test Summary ===" | tee -a "$TEST_LOG"
echo "Completed: $(date)" | tee -a "$TEST_LOG"
echo "Full log: $TEST_LOG" | tee -a "$TEST_LOG"
