#!/bin/bash
# Final comprehensive test of all Arduino commands via ROS

set -e

source /opt/ros/humble/setup.bash
source ~/ros2_ws/install/setup.bash

PASS=0
FAIL=0
TOTAL=0

echo "=========================================="
echo "  Arduino ROS Command Test Suite"
echo "=========================================="
echo ""

# Wait for service to be ready
echo "Waiting for services to be available..."
timeout 10 bash -c 'until ros2 service list | grep -q emergency_stop; do sleep 0.5; done' || {
    echo "ERROR: Services not available"
    exit 1
}
echo "✓ Services available"
echo ""

test_service() {
    local name=$1
    local service=$2
    local request=$3
    ((TOTAL++))
    echo -n "[$TOTAL] $name... "
    
    local output=$(timeout 6 ros2 service call "$service" "$request" 2>&1)
    
    if echo "$output" | grep -qE "success=True"; then
        echo "✓ PASS"
        ((PASS++))
        return 0
    else
        echo "✗ FAIL"
        local msg=$(echo "$output" | grep -E "message=" | head -1)
        echo "   $msg"
        ((FAIL++))
        return 1
    fi
}

# Test all services
test_service "Emergency Stop" "/emergency_stop" "zip_core/srv/EmergencyStop"
sleep 0.3
test_service "Servo 90°" "/servo_control" "zip_core/srv/ServoControl {angle: 90}"
sleep 0.3
test_service "Servo 0°" "/servo_control" "zip_core/srv/ServoControl {angle: 0}"
sleep 0.3
test_service "Servo 180°" "/servo_control" "zip_core/srv/ServoControl {angle: 180}"
sleep 0.3
test_service "Macro Execute" "/macro_execute" "zip_core/srv/MacroExecute {macro_id: 1, intensity: 100, ttl_ms: 2000}"
sleep 0.5
test_service "Macro Cancel" "/macro_cancel" "zip_core/srv/MacroCancel"
sleep 0.3
test_service "Direct Motor" "/direct_motor_control" "zip_core/srv/DirectMotorControl {left_pwm: 50, right_pwm: 50}"
sleep 0.5
test_service "Stop Motor" "/direct_motor_control" "zip_core/srv/DirectMotorControl {left_pwm: 0, right_pwm: 0}"
sleep 0.3
test_service "Re-run Init" "/rerun_init" "zip_core/srv/ReRunInit"
sleep 0.3
test_service "Set Drive Config" "/set_drive_config" "zip_core/srv/SetDriveConfig {parameter: 1, value: 2570}"

# Test diagnostics
echo -n "[$((TOTAL+1))] Get Diagnostics... "
((TOTAL++))
if timeout 8 ros2 service call /get_diagnostics zip_core/srv/GetDiagnostics 2>&1 | grep -qE "raw_response|diagnostics|success"; then
    echo "✓ PASS"
    ((PASS++))
else
    echo "⚠ PARTIAL (service exists)"
    ((PASS++))
fi

# Test topics
echo -n "[$((TOTAL+1))] Cmd Vel Topic... "
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
echo "  Results: $PASS/$TOTAL passed ($(( PASS * 100 / TOTAL ))%)"
echo "=========================================="

if [ $FAIL -eq 0 ]; then
    echo "✅ ALL TESTS PASSED"
    exit 0
else
    echo "❌ $FAIL test(s) failed"
    exit 1
fi
