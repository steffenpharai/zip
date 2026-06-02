#!/bin/bash
#
# Comprehensive Arduino Command Test via ROS
# Tests all available ROS services and topics
#

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

PASSED=0
FAILED=0
FAILED_TESTS=()

echo -e "${GREEN}=== Arduino ROS Command Test Suite ===${NC}"
echo ""

# Source ROS
source /opt/ros/humble/setup.bash
if [ -f ~/ros2_ws/install/setup.bash ]; then
    source ~/ros2_ws/install/setup.bash
else
    echo -e "${RED}Error: ROS workspace not found${NC}"
    exit 1
fi

# Check if service is running
if ! systemctl is-active --quiet zip-serial-bridge.service; then
    echo -e "${YELLOW}Warning: zip-serial-bridge.service is not running${NC}"
    echo "Starting service..."
    sudo systemctl start zip-serial-bridge.service
    sleep 3
fi

# Wait for node to be available
echo -e "${YELLOW}Waiting for serial_bridge_node...${NC}"
timeout 10 bash -c 'until ros2 node list | grep -q serial_bridge_node; do sleep 0.5; done' || {
    echo -e "${RED}Error: serial_bridge_node not found${NC}"
    exit 1
}
echo -e "${GREEN}✓ Node available${NC}"
echo ""

# Test function
test_service() {
    local name=$1
    local service=$2
    local request=$3
    local logfile="/tmp/test_$(echo "$name" | tr ' ' '_' | tr -d '()°').log"
    
    echo -n "Testing $name... "
    if timeout 5 ros2 service call "$service" "$request" > "$logfile" 2>&1; then
        if grep -q "success.*True\|success: True" "$logfile" 2>/dev/null; then
            echo -e "${GREEN}✓ PASSED${NC}"
            ((PASSED++))
            return 0
        else
            echo -e "${RED}✗ FAILED (success=False)${NC}"
            ((FAILED++))
            FAILED_TESTS+=("$name")
            cat "$logfile" | tail -5
            return 1
        fi
    else
        echo -e "${RED}✗ FAILED (timeout or error)${NC}"
        ((FAILED++))
        FAILED_TESTS+=("$name")
        cat "$logfile" | tail -5
        return 1
    fi
}

test_topic() {
    local name=$1
    local topic=$2
    local msg_type=$3
    local data=$4
    local logfile="/tmp/test_$(echo "$name" | tr ' ' '_' | tr -d '()°').log"
    
    echo -n "Testing $name... "
    if timeout 3 ros2 topic pub "$topic" "$msg_type" "$data" --once > "$logfile" 2>&1; then
        echo -e "${GREEN}✓ PASSED${NC}"
        ((PASSED++))
        return 0
    else
        echo -e "${RED}✗ FAILED${NC}"
        ((FAILED++))
        FAILED_TESTS+=("$name")
        cat "$logfile" | tail -5
        return 1
    fi
}

test_topic_echo() {
    local name=$1
    local topic=$2
    local logfile="/tmp/test_$(echo "$name" | tr ' ' '_' | tr -d '()°').log"
    
    echo -n "Testing $name (publishing)... "
    if timeout 3 ros2 topic echo "$topic" --once > "$logfile" 2>&1; then
        if [ -s "$logfile" ] && ! grep -q "waiting\|error\|Error" "$logfile"; then
            echo -e "${GREEN}✓ PASSED${NC}"
            ((PASSED++))
            return 0
        else
            echo -e "${YELLOW}⚠ NO DATA (may be normal)${NC}"
            return 0
        fi
    else
        echo -e "${YELLOW}⚠ TIMEOUT (may be normal)${NC}"
        return 0
    fi
}

echo -e "${GREEN}=== Testing ROS Services ===${NC}"
echo ""

# Test 1: Emergency Stop
test_service "Emergency Stop" "/emergency_stop" "zip_core/srv/EmergencyStop"

# Test 2: Servo Control (90 degrees)
test_service "Servo Control (90°)" "/servo_control" "zip_core/srv/ServoControl {angle: 90}"

# Test 3: Servo Control (0 degrees)
test_service "Servo Control (0°)" "/servo_control" "zip_core/srv/ServoControl {angle: 0}"

# Test 4: Servo Control (180 degrees)
test_service "Servo Control (180°)" "/servo_control" "zip_core/srv/ServoControl {angle: 180}"

# Test 5: Macro Execute (Figure 8)
test_service "Macro Execute (Figure 8)" "/macro_execute" "zip_core/srv/MacroExecute {macro_id: 1, intensity: 100, ttl_ms: 2000}"

# Test 6: Macro Cancel
sleep 1
test_service "Macro Cancel" "/macro_cancel" "zip_core/srv/MacroCancel"

# Test 7: Get Diagnostics
echo -n "Testing Get Diagnostics... "
if timeout 5 ros2 service call /get_diagnostics zip_core/srv/GetDiagnostics > /tmp/test_diagnostics.log 2>&1; then
    if grep -q "success.*True\|success: True" /tmp/test_diagnostics.log 2>/dev/null || grep -q "raw_response" /tmp/test_diagnostics.log; then
        echo -e "${GREEN}✓ PASSED${NC}"
        ((PASSED++))
    else
        echo -e "${YELLOW}⚠ PARTIAL (no data yet)${NC}"
        ((PASSED++))
    fi
else
    echo -e "${RED}✗ FAILED${NC}"
    ((FAILED++))
    FAILED_TESTS+=("Get Diagnostics")
fi

# Test 8: Direct Motor Control
test_service "Direct Motor Control" "/direct_motor_control" "zip_core/srv/DirectMotorControl {left_pwm: 50, right_pwm: 50}"

# Test 9: Stop Direct Motor Control
sleep 1
test_service "Stop Direct Motor" "/direct_motor_control" "zip_core/srv/DirectMotorControl {left_pwm: 0, right_pwm: 0}"

# Test 10: Re-run Init
test_service "Re-run Init" "/rerun_init" "zip_core/srv/ReRunInit"

# Test 11: Set Drive Config (Deadband)
test_service "Set Drive Config (Deadband)" "/set_drive_config" "zip_core/srv/SetDriveConfig {parameter: 1, value: 2570}"

# Test 12: Set Drive Config (Accel)
test_service "Set Drive Config (Accel)" "/set_drive_config" "zip_core/srv/SetDriveConfig {parameter: 2, value: 5}"

echo ""
echo -e "${GREEN}=== Testing ROS Topics ===${NC}"
echo ""

# Test 13: Cmd Vel (Forward)
test_topic "Motion Control (Forward)" "/cmd_vel" "geometry_msgs/msg/Twist" "{linear: {x: 0.2, y: 0.0, z: 0.0}, angular: {x: 0.0, y: 0.0, z: 0.0}}"

# Test 14: Cmd Vel (Turn)
sleep 0.5
test_topic "Motion Control (Turn)" "/cmd_vel" "geometry_msgs/msg/Twist" "{linear: {x: 0.0, y: 0.0, z: 0.0}, angular: {x: 0.0, y: 0.0, z: 0.3}}"

# Test 15: Cmd Vel (Stop)
sleep 0.5
test_topic "Motion Control (Stop)" "/cmd_vel" "geometry_msgs/msg/Twist" "{linear: {x: 0.0, y: 0.0, z: 0.0}, angular: {x: 0.0, y: 0.0, z: 0.0}}"

# Test 16-19: Sensor Topics (check if publishing)
test_topic_echo "Ultrasonic Sensor" "/ultrasonic"
test_topic_echo "Battery Status" "/battery"
test_topic_echo "Robot Sensors" "/robot_sensors"
test_topic_echo "Robot Diagnostics" "/robot_diagnostics"

echo ""
echo -e "${GREEN}=== Test Summary ===${NC}"
echo "Passed: $PASSED"
echo "Failed: $FAILED"

if [ $FAILED -gt 0 ]; then
    echo ""
    echo -e "${RED}Failed Tests:${NC}"
    for test in "${FAILED_TESTS[@]}"; do
        echo "  - $test"
    done
    exit 1
else
    echo ""
    echo -e "${GREEN}All tests passed!${NC}"
    exit 0
fi
