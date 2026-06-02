#!/bin/bash
# Build script with comprehensive logging and visual feedback

set -e

cd /home/steffen/Projects/Zip

echo "=========================================="
echo "YOLO 11 Workspace Build with Logging"
echo "=========================================="
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

LOG_FILE="/tmp/build_detailed.log"

log_step() {
    echo -e "${BLUE}[STEP]${NC} $1"
    echo "[$(date +%H:%M:%S)] $1" >> "$LOG_FILE"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
    echo "[$(date +%H:%M:%S)] SUCCESS: $1" >> "$LOG_FILE"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
    echo "[$(date +%H:%M:%S)] ERROR: $1" >> "$LOG_FILE"
}

log_info() {
    echo -e "${YELLOW}[INFO]${NC} $1"
    echo "[$(date +%H:%M:%S)] INFO: $1" >> "$LOG_FILE"
}

# Step 1: Clean workspace
log_step "Cleaning workspace..."
docker compose -f docker-compose.dev.yml exec vision-service bash -c "
    cd /workspace/ros2_workspace
    echo 'Removing build artifacts...'
    rm -rf build install log 2>/dev/null || true
    find . -name 'CMakeCache.txt' -delete 2>/dev/null || true
    find . -name 'CMakeFiles' -type d -exec rm -rf {} + 2>/dev/null || true
    mkdir -p build install log
    echo 'Workspace cleaned'
" 2>&1 | tee -a "$LOG_FILE"

if [ ${PIPESTATUS[0]} -ne 0 ]; then
    log_error "Failed to clean workspace"
    exit 1
fi
log_success "Workspace cleaned"

# Step 2: Verify ROS 2
log_step "Verifying ROS 2 installation..."
docker compose -f docker-compose.dev.yml exec vision-service bash -c "
    if [ ! -f /opt/ros/humble/setup.bash ]; then
        echo 'ERROR: ROS 2 not installed'
        exit 1
    fi
    source /opt/ros/humble/setup.bash
    echo 'ROS 2 version:'
    ros2 --version
    echo 'ROS 2 packages available:'
    ros2 pkg list | head -5
" 2>&1 | tee -a "$LOG_FILE"

if [ ${PIPESTATUS[0]} -ne 0 ]; then
    log_error "ROS 2 verification failed"
    exit 1
fi
log_success "ROS 2 verified"

# Step 3: Check source files
log_step "Checking source files..."
docker compose -f docker-compose.dev.yml exec vision-service bash -c "
    cd /workspace/ros2_workspace
    echo 'Source directory structure:'
    ls -la zip_vision/ 2>/dev/null | head -10
    echo ''
    echo 'Checking key files:'
    [ -f zip_vision/CMakeLists.txt ] && echo '✓ CMakeLists.txt exists' || echo '✗ CMakeLists.txt missing'
    [ -f zip_vision/package.xml ] && echo '✓ package.xml exists' || echo '✗ package.xml missing'
    [ -f zip_vision/src/yoloe_ros_node.py ] && echo '✓ yoloe_ros_node.py exists' || echo '✗ yoloe_ros_node.py missing'
" 2>&1 | tee -a "$LOG_FILE"

# Step 4: Build with detailed output
log_step "Starting build with detailed logging..."
echo "Build output will be shown in real-time..."
echo ""

docker compose -f docker-compose.dev.yml exec vision-service bash -c "
    source /opt/ros/humble/setup.bash
    cd /workspace/ros2_workspace
    export COLCON_LOG_PATH=/tmp/colcon_logs
    mkdir -p \$COLCON_LOG_PATH
    
    echo '=== Build Configuration ==='
    echo 'Workspace: /workspace/ros2_workspace'
    echo 'Package: zip_vision'
    echo 'Log path: \$COLCON_LOG_PATH'
    echo ''
    
    echo '=== Starting Colcon Build ==='
    colcon build \
        --packages-select zip_vision \
        --symlink-install \
        --event-handlers console_direct+ \
        --cmake-args -DCMAKE_VERBOSE_MAKEFILE=ON \
        2>&1 | tee /tmp/colcon_build_detailed.log
    
    BUILD_EXIT=\${PIPESTATUS[0]}
    
    echo ''
    echo '=== Build Summary ==='
    if [ \$BUILD_EXIT -eq 0 ]; then
        echo '✓ Build completed successfully'
        if [ -f install/zip_vision/lib/zip_vision/yoloe_ros_node.py ]; then
            echo '✓ Node file created'
            ls -lh install/zip_vision/lib/zip_vision/yoloe_ros_node.py
        else
            echo '✗ Node file not found'
        fi
    else
        echo '✗ Build failed with exit code: '\$BUILD_EXIT
        echo ''
        echo '=== Error Details ==='
        tail -50 /tmp/colcon_build_detailed.log | grep -A 10 -E '(ERROR|Error|error|Failed|failed)' || tail -20 /tmp/colcon_build_detailed.log
        echo ''
        echo '=== CMake Output ==='
        if [ -f build/zip_vision/CMakeCache.txt ]; then
            echo 'CMakeCache.txt exists (this may be the problem)'
            head -20 build/zip_vision/CMakeCache.txt | grep -E '(CMAKE_SOURCE|CMAKE_CACHE)' || echo 'No source path found in cache'
        fi
        if [ -f build/zip_vision/CMakeFiles/CMakeError.log ]; then
            echo 'CMake error log:'
            tail -30 build/zip_vision/CMakeFiles/CMakeError.log
        fi
    fi
    
    exit \$BUILD_EXIT
" 2>&1 | tee -a "$LOG_FILE"

BUILD_RESULT=${PIPESTATUS[0]}

echo ""
echo "=========================================="
if [ $BUILD_RESULT -eq 0 ]; then
    log_success "Build completed successfully!"
    echo ""
    echo "Verifying installation..."
    docker compose -f docker-compose.dev.yml exec vision-service bash -c "
        source /opt/ros/humble/setup.bash
        cd /workspace/ros2_workspace
        source install/setup.bash
        if [ -f install/zip_vision/lib/zip_vision/yoloe_ros_node.py ]; then
            echo '✓ Node installed at: install/zip_vision/lib/zip_vision/yoloe_ros_node.py'
            ls -lh install/zip_vision/lib/zip_vision/yoloe_ros_node.py
            echo ''
            echo 'Testing node syntax...'
            python3 -m py_compile install/zip_vision/lib/zip_vision/yoloe_ros_node.py && echo '✓ Syntax valid' || echo '✗ Syntax error'
        else
            echo '✗ Node file not found'
        fi
    " 2>&1
    exit 0
else
    log_error "Build failed!"
    echo ""
    echo "Detailed logs saved to: $LOG_FILE"
    echo "Colcon build log: /tmp/colcon_build_detailed.log (in container)"
    echo ""
    echo "Common issues:"
    echo "1. CMakeCache.txt has wrong paths - try: rm -rf build/zip_vision"
    echo "2. Missing dependencies - check CMakeLists.txt"
    echo "3. Source files not found - verify ros2_packages mount"
    exit 1
fi
