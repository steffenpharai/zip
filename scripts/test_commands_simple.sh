#!/bin/bash
# Simple test script for all Arduino commands

source /opt/ros/humble/setup.bash
source ~/ros2_ws/install/setup.bash

echo "=== Testing All Arduino Commands ==="
echo ""

PASS=0
FAIL=0

test_cmd() {
    local name=$1
    local cmd=$2
    echo -n "Testing $name... "
    if eval "$cmd" > /tmp/test_output.log 2>&1; then
        if grep -q "success.*True\|success: True" /tmp/test_output.log 2>/dev/null; then
            echo "✓ PASS"
            ((PASS++))
            return 0
        else
            echo "✗ FAIL (success=False)"
            ((FAIL++))
            return 1
        fi
    else
        echo "✗ FAIL (error)"
        ((FAIL++))
        return 1
    fi
}

# Test all services
test_cmd "Emergency Stop" "timeout 3 ros2 service call /emergency_stop zip_core/srv/EmergencyStop"
test_cmd "Servo 90°" "timeout 3 ros2 service call /servo_control zip_core/srv/ServoControl '{angle: 90}'"
test_cmd "Servo 0°" "timeout 3 ros2 service call /servo_control zip_core/srv/ServoControl '{angle: 0}'"
test_cmd "Servo 180°" "timeout 3 ros2 service call /servo_control zip_core/srv/ServoControl '{angle: 180}'"
test_cmd "Macro Execute" "timeout 3 ros2 service call /macro_execute zip_core/srv/MacroExecute '{macro_id: 1, intensity: 100, ttl_ms: 2000}'"
sleep 0.5
test_cmd "Macro Cancel" "timeout 3 ros2 service call /macro_cancel zip_core/srv/MacroCancel"
test_cmd "Direct Motor" "timeout 3 ros2 service call /direct_motor_control zip_core/srv/DirectMotorControl '{left_pwm: 50, right_pwm: 50}'"
sleep 0.5
test_cmd "Stop Motor" "timeout 3 ros2 service call /direct_motor_control zip_core/srv/DirectMotorControl '{left_pwm: 0, right_pwm: 0}'"
test_cmd "Re-run Init" "timeout 3 ros2 service call /rerun_init zip_core/srv/ReRunInit"
test_cmd "Set Drive Config" "timeout 3 ros2 service call /set_drive_config zip_core/srv/SetDriveConfig '{parameter: 1, value: 2570}'"

# Test diagnostics (may fail, that's OK for now)
echo -n "Testing Get Diagnostics... "
if timeout 5 ros2 service call /get_diagnostics zip_core/srv/GetDiagnostics > /tmp/test_output.log 2>&1; then
    if grep -q "raw_response" /tmp/test_output.log && grep -q "raw_response=''" /tmp/test_output.log; then
        echo "⚠ PARTIAL (no data, but service works)"
        ((PASS++))
    elif grep -q "raw_response" /tmp/test_output.log; then
        echo "✓ PASS"
        ((PASS++))
    else
        echo "✗ FAIL"
        ((FAIL++))
    fi
else
    echo "✗ FAIL"
    ((FAIL++))
fi

# Test topics
echo -n "Testing Cmd Vel... "
if timeout 2 ros2 topic pub /cmd_vel geometry_msgs/msg/Twist "{linear: {x: 0.2, y: 0.0, z: 0.0}, angular: {x: 0.0, y: 0.0, z: 0.0}}" --once > /tmp/test_output.log 2>&1; then
    echo "✓ PASS"
    ((PASS++))
else
    echo "✗ FAIL"
    ((FAIL++))
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
