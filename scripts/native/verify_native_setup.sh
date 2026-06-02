#!/bin/bash
#
# Verify Native ZIP Robot Setup
#
# This script verifies that all components of the native installation
# are properly configured and running.
#

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

PASS=0
FAIL=0

# Function to check command
check() {
    local name="$1"
    local command="$2"
    
    echo -n "Checking ${name}... "
    if eval "${command}" > /dev/null 2>&1; then
        echo -e "${GREEN}✓${NC}"
        ((PASS++))
        return 0
    else
        echo -e "${RED}✗${NC}"
        ((FAIL++))
        return 1
    fi
}

# Function to check with message
check_msg() {
    local name="$1"
    local command="$2"
    local msg="$3"
    
    echo -n "Checking ${name}... "
    if eval "${command}" > /dev/null 2>&1; then
        echo -e "${GREEN}✓${NC} ${msg}"
        ((PASS++))
        return 0
    else
        echo -e "${RED}✗${NC} ${msg}"
        ((FAIL++))
        return 1
    fi
}

echo -e "${GREEN}ZIP Robot Native Setup Verification${NC}"
echo "======================================"
echo ""

# 1. System checks
echo "=== System Checks ==="
check "JetPack" "cat /etc/nv_tegra_release"
check "CUDA" "nvcc --version"
check "GPU" "nvidia-smi"
check_msg "Python 3.10+" "python3 --version | grep -q 'Python 3.1[0-9]'" "$(python3 --version 2>&1)"
check "Node.js" "node --version"
check "npm" "npm --version"
echo ""

# 2. ROS 2 checks
echo "=== ROS 2 Checks ==="
if [[ -f /opt/ros/humble/setup.bash ]]; then
    source /opt/ros/humble/setup.bash
    check "ROS 2 Humble" "ros2 --help"
    check "ROS 2 packages" "ros2 pkg list | grep -q cv_bridge"
else
    echo -e "${RED}✗${NC} ROS 2 Humble not found at /opt/ros/humble"
    ((FAIL++))
fi
echo ""

# 3. Python environment checks
echo "=== Python Environment Checks ==="
if [[ -n "${VIRTUAL_ENV}" ]]; then
    echo -e "${GREEN}✓${NC} Virtual environment active: ${VIRTUAL_ENV}"
    ((PASS++))
else
    if [[ -f ~/zip_vision_env/bin/activate ]]; then
        echo -e "${YELLOW}⚠${NC} Virtual environment exists but not activated: ~/zip_vision_env"
        source ~/zip_vision_env/bin/activate
    else
        echo -e "${RED}✗${NC} Virtual environment not found"
        ((FAIL++))
    fi
fi

if [[ -n "${VIRTUAL_ENV}" ]]; then
    check "PyTorch" "python3 -c 'import torch'"
    check_msg "CUDA in PyTorch" "python3 -c 'import torch; assert torch.cuda.is_available()'" "$(python3 -c 'import torch; print(f\"CUDA: {torch.cuda.is_available()}, Device: {torch.cuda.get_device_name(0) if torch.cuda.is_available() else \"N/A\"}')' 2>&1)"
    check "Ultralytics" "python3 -c 'import ultralytics'"
    check "FastAPI" "python3 -c 'import fastapi'"
fi
echo ""

# 4. ROS 2 workspace checks
echo "=== ROS 2 Workspace Checks ==="
if [[ -d ~/ros2_ws ]]; then
    echo -e "${GREEN}✓${NC} Workspace directory exists: ~/ros2_ws"
    ((PASS++))
    
    if [[ -f ~/ros2_ws/install/setup.bash ]]; then
        source ~/ros2_ws/install/setup.bash
        check "zip_vision package" "ros2 pkg list | grep -q zip_vision"
        check "yoloe_ros_node.py" "ros2 pkg executables zip_vision | grep -q yoloe_ros_node"
        check "vision_diagnostics_bridge.py" "ros2 pkg executables zip_vision | grep -q vision_diagnostics_bridge"
    else
        echo -e "${YELLOW}⚠${NC} Workspace not built (run: colcon build)"
        ((FAIL++))
    fi
else
    echo -e "${RED}✗${NC} Workspace directory not found: ~/ros2_ws"
    ((FAIL++))
fi
echo ""

# 5. Model checks
echo "=== Model Checks ==="
MODELS_DIR="${HOME}/ros2_ws/src/zip_vision/models"
if [[ -d "${MODELS_DIR}" ]]; then
    check_msg "Models directory" "test -d ${MODELS_DIR}" "${MODELS_DIR}"
    
    # Check for model files
    if ls ${MODELS_DIR}/yoloe-11*.{pt,engine} 1> /dev/null 2>&1; then
        echo -e "${GREEN}✓${NC} Model files found:"
        ls -lh ${MODELS_DIR}/yoloe-11*.{pt,engine} 2>/dev/null | awk '{print "    " $9 " (" $5 ")"}'
        ((PASS++))
    else
        echo -e "${RED}✗${NC} No YOLOE model files found in ${MODELS_DIR}"
        ((FAIL++))
    fi
else
    echo -e "${RED}✗${NC} Models directory not found: ${MODELS_DIR}"
    ((FAIL++))
fi
echo ""

# 6. Camera checks
echo "=== Camera Checks ==="
if [[ -e /dev/video0 ]]; then
    echo -e "${GREEN}✓${NC} Camera device found: /dev/video0"
    ((PASS++))
    
    # Check permissions
    if [[ -r /dev/video0 ]]; then
        echo -e "${GREEN}✓${NC} Camera is readable"
        ((PASS++))
    else
        echo -e "${YELLOW}⚠${NC} Camera may not be readable (check permissions)"
        echo "  Try: sudo usermod -a -G video ${USER}"
        ((FAIL++))
    fi
else
    echo -e "${YELLOW}⚠${NC} Camera device not found: /dev/video0"
    echo "  Available devices:"
    ls -l /dev/video* 2>/dev/null || echo "    (none)"
fi
echo ""

# 7. Service checks
echo "=== Systemd Service Checks ==="
for service in zip-vision zip-robot-bridge zip-web; do
    if systemctl list-unit-files | grep -q "${service}.service"; then
        if systemctl is-enabled "${service}.service" > /dev/null 2>&1; then
            echo -e "${GREEN}✓${NC} ${service}.service is enabled"
            ((PASS++))
        else
            echo -e "${YELLOW}⚠${NC} ${service}.service exists but not enabled"
        fi
        
        if systemctl is-active "${service}.service" > /dev/null 2>&1; then
            echo -e "${GREEN}✓${NC} ${service}.service is running"
            ((PASS++))
        else
            echo -e "${YELLOW}⚠${NC} ${service}.service is not running"
        fi
    else
        echo -e "${YELLOW}⚠${NC} ${service}.service not installed"
    fi
done
echo ""

# 8. Network/API checks
echo "=== Network/API Checks ==="
if systemctl is-active zip-vision.service > /dev/null 2>&1; then
    sleep 2  # Give service time to start
    check "Vision API (8767)" "curl -s http://localhost:8767/api/vision/status > /dev/null"
fi

if systemctl is-active zip-robot-bridge.service > /dev/null 2>&1; then
    check "Robot Bridge HTTP (8766)" "curl -s http://localhost:8766/health > /dev/null"
fi

if systemctl is-active zip-web.service > /dev/null 2>&1; then
    check "Web App (3000)" "curl -s http://localhost:3000/api/health > /dev/null"
fi
echo ""

# Summary
echo "======================================"
echo -e "Summary: ${GREEN}${PASS} passed${NC}, ${RED}${FAIL} failed${NC}"
echo ""

if [[ ${FAIL} -eq 0 ]]; then
    echo -e "${GREEN}All checks passed! Setup looks good.${NC}"
    exit 0
else
    echo -e "${YELLOW}Some checks failed. Please review the output above.${NC}"
    exit 1
fi
