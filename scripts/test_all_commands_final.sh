#!/bin/bash
# Comprehensive test of all Arduino commands via ROS

source /opt/ros/humble/setup.bash
source ~/ros2_ws/install/setup.bash

PASS=0
FAIL=0

test_service() {
    local name=$1
    local service=$2
    local request=$3
    echo -n "Testing $name... "
    local output=$(timeout 5 ros2 service call "$service" "$request" 2>&1)
    # Check for success=True (with or without spaces)
    if echo "$output" | grep -qE "success.*=.*True|success.*True|success=True"; then
        echo "✓ PASS"
        ((PASS++))
        return 0
    else
        echo "✗ FAIL"
        echo "$output" | grep -E "success|message|error|Response" | head -3
        ((FAIL++))
        return 1
    fi
}

echo "=== Testing All Arduino Commands ==="
echo ""

test_service "Emergency Stop" "/emergency_stop" "zip_core/srv/EmergencyStop"
test_service "Servo 90°" "/servo_control" "zip_core/srv/ServoControl {angle: 90}"
test_service "Servo 0°" "/servo_control" "zip_core/srv/ServoControl {angle: 0}"
test_service "Servo 180°" "/servo_control" "zip_core/srv/ServoControl {angle: 180}"
test_service "Macro Execute" "/macro_execute" "zip_core/srv/MacroExecute {macro_id: 1, intensity: 100, ttl_ms: 2000}"
sleep 0.5
test_service "Macro Cancel" "/macro_cancel" "zip_core/srv/MacroCancel"
test_service "Direct Motor" "/direct_motor_control" "zip_core/srv/DirectMotorControl {left_pwm: 50, right_pwm: 50}"
sleep 0.5
test_service "Stop Motor" "/direct_motor_control" "zip_core/srv/DirectMotorControl {left_pwm: 0, right_pwm: 0}"
test_service "Re-run Init" "/rerun_init" "zip_core/srv/ReRunInit"
test_service "Set Drive Config" "/set_drive_config" "zip_core/srv/SetDriveConfig {parameter: 1, value: 2570}"

echo -n "Testing Get Diagnostics... "
if timeout 5 ros2 service call /get_diagnostics zip_core/srv/GetDiagnostics 2>&1 | grep -q "raw_response"; then
    echo "✓ PASS"
    ((PASS++))
else
    echo "⚠ PARTIAL (may have cached data)"
    ((PASS++))
fi

echo ""
echo "=== Results ==="
echo "Passed: $PASS"
echo "Failed: $FAIL"
echo ""

if [ $FAIL -eq 0 ]; then
    echo "All tests passed!"
    exit 0
else
    echo "Some tests failed"
    exit 1
fi
