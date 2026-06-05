#!/bin/bash
# Autonomous test for vision diagnostics page
# Tests bridge connection and overlay functionality

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "=========================================="
echo "Vision Diagnostics Autonomous Test"
echo "=========================================="
echo ""

# Source ROS 2
source /opt/ros/humble/setup.bash 2>/dev/null || {
    echo "⚠️  ROS 2 not found, skipping ROS services"
    SKIP_ROS=true
}

# Check if Next.js is running
if ! curl -s http://localhost:3000 > /dev/null 2>&1; then
    echo "Starting Next.js frontend..."
    npm run dev > /tmp/nextjs_test.log 2>&1 &
    NEXTJS_PID=$!
    echo "  Next.js PID: $NEXTJS_PID"
    echo "  Waiting 10 seconds for startup..."
    sleep 10
    
    # Check if it started
    if ! curl -s http://localhost:3000 > /dev/null 2>&1; then
        echo "❌ Next.js failed to start"
        cat /tmp/nextjs_test.log | tail -20
        exit 1
    fi
    echo "✓ Next.js running"
else
    echo "✓ Next.js already running"
    NEXTJS_PID=""
fi

# Start ROS services if available
if [ "$SKIP_ROS" != "true" ]; then
    cd ros2_packages
    source install/setup.bash 2>/dev/null || {
        echo "⚠️  ROS packages not built, skipping ROS services"
        SKIP_ROS=true
    }
    cd ..
    
    if [ "$SKIP_ROS" != "true" ]; then
        # Check if bridge is running
        if ! curl -s http://localhost:8767/api/vision/status > /dev/null 2>&1; then
            echo "Starting diagnostics bridge..."
            python3 ros2_packages/zip_vision/src/vision_diagnostics_bridge.py \
                --port 8767 --host localhost \
                > /tmp/bridge_test.log 2>&1 &
            BRIDGE_PID=$!
            echo "  Bridge PID: $BRIDGE_PID"
            echo "  Waiting 5 seconds for startup..."
            sleep 5
            
            if ! curl -s http://localhost:8767/api/vision/status > /dev/null 2>&1; then
                echo "⚠️  Bridge not responding, but continuing test..."
            else
                echo "✓ Bridge running"
            fi
        else
            echo "✓ Bridge already running"
            BRIDGE_PID=""
        fi
    fi
fi

echo ""
echo "Running Playwright tests..."
echo ""

# Run Playwright test with timeout
timeout 60 npm run test:e2e -- tests/e2e/vision-diagnostics.spec.ts --timeout=30000 || TEST_RESULT=$?
if [ -z "$TEST_RESULT" ]; then TEST_RESULT=0; fi

echo ""
echo "=========================================="
if [ $TEST_RESULT -eq 0 ]; then
    echo "✅ TESTS PASSED"
else
    echo "❌ TESTS FAILED"
fi
echo "=========================================="

# Cleanup
if [ -n "$NEXTJS_PID" ]; then
    echo "Cleaning up Next.js..."
    kill $NEXTJS_PID 2>/dev/null || true
fi

if [ -n "$BRIDGE_PID" ]; then
    echo "Cleaning up bridge..."
    kill $BRIDGE_PID 2>/dev/null || true
fi

exit $TEST_RESULT
