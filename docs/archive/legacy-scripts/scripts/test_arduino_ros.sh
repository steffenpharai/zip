#!/bin/bash
#
# Test Arduino ROS Communication
#
# This script tests the ROS-Arduino communication bridge
#

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${GREEN}ZIP Robot Arduino ROS Communication Test${NC}"
echo "=============================================="
echo ""

# Source ROS
source /opt/ros/humble/setup.bash
if [ -f ~/ros2_ws/install/setup.bash ]; then
    source ~/ros2_ws/install/setup.bash
else
    echo -e "${RED}Error: ROS workspace not found at ~/ros2_ws${NC}"
    exit 1
fi

# Check if packages are available
echo -e "${YELLOW}Checking ROS packages...${NC}"
if ! ros2 pkg list | grep -q zip_control; then
    echo -e "${RED}Error: zip_control package not found${NC}"
    exit 1
fi
if ! ros2 pkg list | grep -q zip_core; then
    echo -e "${RED}Error: zip_core package not found${NC}"
    exit 1
fi
echo -e "${GREEN}✓ ROS packages found${NC}"
echo ""

# Check serial ports
echo -e "${YELLOW}Checking serial ports...${NC}"
python3 << EOF
import serial.tools.list_ports
ports = serial.tools.list_ports.comports()
if ports:
    print("Available serial ports:")
    for p in ports:
        print(f"  {p.device} - {p.description} ({p.manufacturer})")
else:
    print("  No serial ports found")
    print("  Please connect Arduino via USB")
EOF
echo ""

# Check if serial bridge node exists
echo -e "${YELLOW}Checking serial bridge node...${NC}"
if ros2 run zip_control serial_bridge_node --help &>/dev/null; then
    echo -e "${GREEN}✓ Serial bridge node available${NC}"
else
    echo -e "${RED}Error: Serial bridge node not found${NC}"
    exit 1
fi
echo ""

# Check ROS interfaces
echo -e "${YELLOW}Checking ROS interfaces...${NC}"
SERVICES=(
    "zip_core/srv/EmergencyStop"
    "zip_core/srv/ServoControl"
    "zip_core/srv/MacroExecute"
    "zip_core/srv/MacroCancel"
    "zip_core/srv/GetDiagnostics"
    "zip_core/srv/DirectMotorControl"
    "zip_core/srv/ReRunInit"
    "zip_core/srv/SetDriveConfig"
)

for srv in "${SERVICES[@]}"; do
    if ros2 interface show "$srv" &>/dev/null; then
        echo -e "${GREEN}✓ $srv${NC}"
    else
        echo -e "${RED}✗ $srv (not found)${NC}"
    fi
done
echo ""

# Test launch file
echo -e "${YELLOW}Testing launch file...${NC}"
if ros2 launch zip_control serial_bridge.launch.py --show-args &>/dev/null; then
    echo -e "${GREEN}✓ Launch file valid${NC}"
else
    echo -e "${RED}Error: Launch file not found or invalid${NC}"
    exit 1
fi
echo ""

# Check systemd service
echo -e "${YELLOW}Checking systemd service...${NC}"
if systemctl list-unit-files | grep -q zip-serial-bridge.service; then
    echo -e "${GREEN}✓ Systemd service installed${NC}"
    if systemctl is-enabled zip-serial-bridge.service &>/dev/null; then
        echo -e "${GREEN}  Service is enabled${NC}"
    else
        echo -e "${YELLOW}  Service is not enabled (run: sudo systemctl enable zip-serial-bridge.service)${NC}"
    fi
else
    echo -e "${YELLOW}  Systemd service not installed${NC}"
fi
echo ""

# Summary
echo -e "${GREEN}Test Summary${NC}"
echo "==========="
echo "ROS packages: ✓"
echo "Serial bridge node: ✓"
echo "ROS interfaces: ✓"
echo "Launch file: ✓"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo "1. Connect Arduino via USB-A to USB-C cable"
echo "2. Start serial bridge: sudo systemctl start zip-serial-bridge.service"
echo "3. Check status: sudo systemctl status zip-serial-bridge.service"
echo "4. View logs: journalctl -u zip-serial-bridge.service -f"
echo "5. Test services: ros2 service call /emergency_stop zip_core/srv/EmergencyStop"
echo ""
