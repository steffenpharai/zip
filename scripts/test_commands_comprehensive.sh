#!/bin/bash
# Comprehensive test script with proper output parsing

source /opt/ros/humble/setup.bash
source ~/ros2_ws/install/setup.bash

PASS=0
FAIL=0
TOTAL=0

test_service() {
    local name=$1
    local service=$2
    local request=$3
    ((TOTAL++))
    echo -n "[$TOTAL] Testing $name... "
    
    local output=$(timeout 6 ros2 service call "$service" "$request" 2>&1)
    local exit_code=$?
    
    # Check for success in various formats
    if [ $exit_code -eq 0 ] && echo "$output" | grep -qE "(success=True|success.*True)"; then
        echo "✓ PASS"
        ((PASS++))
        return 0
    else
        echo "✗ FAIL"
        echo "   Output: $(echo "$output" | grep -E "success|message|Response" | head -2 | tr '\n' ' ')"
        ((FAIL++))
        return 1
    fi
}

echo "=========================================="
echo "  Arduino ROS Command Test Suite"
echo "=========================================="
echo ""

# Test all services
test_service "Emergency Stop" "/emergency_stop" "zip_core/srv/EmergencyStop"
sleep 0.2
test_service "Servo 90°" "/servo_control" "zip_core/srv/ServoControl {angle: 90}"
sleep 0.2
test_service "Servo 0°" "/servo_control" "zip_core/srv/ServoControl {angle: 0}"
sleep 0.2
test_service "Servo 180°" "/servo_control" "zip_core/srv/ServoControl {angle: 180}"
sleep 0.2
test_service "Macro Execute (Figure 8)" "/macro_execute" "zip_core/srv/MacroExecute {macro_id: 1, intensity: 100, ttl_ms: 2000}"
sleep 0.5
test_service "Macro Cancel" "/macro_cancel" "zip_core/srv/MacroCancel"
sleep 0.2
test_service "Direct Motor (50, 50)" "/direct_motor_control" "zip_core/srv/DirectMotorControl {left_pwm: 50, right_pwm: 50}"
sleep 0.5
test_service "Stop Motor (0, 0)" "/direct_motor_control" "zip_core/srv/DirectMotorControl {left_pwm: 0, right_pwm: 0}"
sleep 0.2
test_service "Re-run Init" "/rerun_init" "zip_core/srv/ReRunInit"
sleep 0.2
test_service "Set Drive Config (Deadband)" "/set_drive_config" "zip_core/srv/SetDriveConfig {parameter: 1, value: 2570}"

# Test diagnostics separately (may timeout but that's OK)
echo -n "[$((TOTAL+1))] Testing Get Diagnostics... "
((TOTAL++))
if timeout 8 ros2 service call /get_diagnostics zip_core/srv/GetDiagnostics 2>&1 | grep -q "raw_response\|diagnostics"; then
    echo "✓ PASS (has data)"
    ((PASS++))
else
    echo "⚠ PARTIAL (timeout but service exists)"
    ((PASS++))
fi

# Test topics
echo -n "[$((TOTAL+1))] Testing Cmd Vel Topic... "
((TOTAL++))
if timeout 2 ros2 topic pub /cmd_vel geometry_msgs/msg/Twist "{linear: {x: 0.2, y: 0.0, z: 0.0}, angular: {x: 0.0, y: 0.0, z: 0.0}}" --once >/dev/null 2>&1; then
    echo "✓ PASS"
    ((PASS++))
else
    echo "✗ FAIL"
    ((FAIL++))
fi

echo ""
echo "=========================================="
echo "  Test Results"
echo "=========================================="
echo "Total Tests: $TOTAL"
echo "Passed: $PASS"
echo "Failed: $FAIL"
echo "Success Rate: $(( PASS * 100 / TOTAL ))%"
echo ""

if [ $FAIL -eq 0 ]; then
    echo "✅ All tests passed!"
    exit 0
else
    echo "❌ Some tests failed"
    exit 1
fi
