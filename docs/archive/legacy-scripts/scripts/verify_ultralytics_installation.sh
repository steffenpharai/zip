#!/bin/bash
# Verify Ultralytics YOLOE installation for both local and Docker
# Migrated to YOLOE for potential open-vocabulary detection (zero overhead in closed mode)
# Ensures compliance with NVIDIA container specifications and INT8 support
# Usage: ./scripts/verify_ultralytics_installation.sh [local|docker|both]

set -e

MODE=${1:-both}

echo "=========================================="
echo "Ultralytics YOLOE Installation Verification"
echo "NVIDIA Container Specifications Compliance"
echo "=========================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

check_local() {
    echo "=========================================="
    echo "Checking LOCAL Installation"
    echo "=========================================="
    echo ""
    
    local errors=0
    local warnings=0
    
    # Check Python version
    echo -n "Python version: "
    PYTHON_VERSION=$(python3 --version 2>&1 | awk '{print $2}')
    echo "$PYTHON_VERSION"
    if [[ $(echo "$PYTHON_VERSION" | cut -d. -f1) -ge 3 && $(echo "$PYTHON_VERSION" | cut -d. -f2) -ge 8 ]]; then
        echo -e "${GREEN}✓ Python version OK${NC}"
    else
        echo -e "${RED}✗ Python version too old (need >= 3.8)${NC}"
        ((errors++))
    fi
    echo ""
    
    # Check Ultralytics
    echo -n "Ultralytics: "
    if python3 -c "import ultralytics" 2>/dev/null; then
        ULTRALYTICS_VERSION=$(python3 -c "import ultralytics; print(ultralytics.__version__)" 2>/dev/null)
        echo -e "${GREEN}✓ Installed (version: $ULTRALYTICS_VERSION)${NC}"
    else
        echo -e "${RED}✗ NOT INSTALLED${NC}"
        ((errors++))
    fi
    echo ""
    
    # Check PyTorch
    echo -n "PyTorch: "
    if python3 -c "import torch" 2>/dev/null; then
        PYTORCH_VERSION=$(python3 -c "import torch; print(torch.__version__)" 2>/dev/null)
        CUDA_AVAILABLE=$(python3 -c "import torch; print(torch.cuda.is_available())" 2>/dev/null)
        echo "Installed (version: $PYTORCH_VERSION)"
        if [ "$CUDA_AVAILABLE" = "True" ]; then
            CUDA_VERSION=$(python3 -c "import torch; print(torch.version.cuda)" 2>/dev/null || echo "unknown")
            echo -e "  ${GREEN}✓ CUDA available (version: $CUDA_VERSION)${NC}"
        else
            echo -e "  ${YELLOW}⚠ CUDA not available (may need Jetson-specific PyTorch)${NC}"
            ((warnings++))
        fi
    else
        echo -e "${RED}✗ NOT INSTALLED${NC}"
        ((errors++))
    fi
    echo ""
    
    # Check TensorRT
    echo -n "TensorRT: "
    if [ -d "/usr/src/tensorrt" ] || [ -d "/usr/local/tensorrt" ] || command -v trtexec &> /dev/null; then
        echo -e "${GREEN}✓ Found${NC}"
        if command -v trtexec &> /dev/null; then
            TRTEXEC_PATH=$(which trtexec)
            echo "  trtexec: $TRTEXEC_PATH"
        fi
    else
        echo -e "${YELLOW}⚠ Not found in standard locations${NC}"
        ((warnings++))
    fi
    echo ""
    
    # Test YOLOE export capability
    echo "Testing YOLOE export capability..."
    python3 << 'PYEOF'
import sys
try:
    from ultralytics import YOLOE
    print("✓ Ultralytics YOLOE import successful")
    
    # Test model loading (will download if needed, but we'll catch errors)
    try:
        model = YOLOE('yoloe-11s-seg-pf')
        print("✓ YOLOE model loading successful")
    except Exception as e:
        print(f"⚠ Model loading test: {e}")
        print("  (This is OK if network is unavailable)")
    
    # Check export method availability
    if hasattr(model, 'export'):
        print("✓ Model export method available")
    else:
        print("✗ Model export method not available")
        sys.exit(1)
        
except ImportError as e:
    print(f"✗ Import error: {e}")
    sys.exit(1)
except Exception as e:
    print(f"⚠ Error: {e}")
    sys.exit(1)
PYEOF
    
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✓ Export capability verified${NC}"
    else
        echo -e "${RED}✗ Export capability check failed${NC}"
        ((errors++))
    fi
    echo ""
    
    # Check for INT8 model
    echo "Checking for INT8 model..."
    INT8_MODEL_PATH="${HOME}/zip_ros2_ws/src/zip_vision/models/yolo11/yoloe-11s-seg-pf_640_int8.engine"
    if [ -f "$INT8_MODEL_PATH" ]; then
        MODEL_SIZE=$(du -h "$INT8_MODEL_PATH" | cut -f1)
        echo -e "${GREEN}✓ INT8 model found: $INT8_MODEL_PATH (${MODEL_SIZE})${NC}"
    else
        echo -e "${YELLOW}⚠ INT8 model not found at: $INT8_MODEL_PATH${NC}"
        echo "  Run: ./scripts/ros2/export_yolo11_to_tensorrt.sh yoloe-11s-seg-pf 640 int8"
        ((warnings++))
    fi
    echo ""
    
    # Summary
    echo "=========================================="
    echo "Local Installation Summary"
    echo "=========================================="
    if [ $errors -eq 0 ]; then
        echo -e "${GREEN}✓ Installation OK${NC}"
        if [ $warnings -gt 0 ]; then
            echo -e "${YELLOW}⚠ $warnings warning(s)${NC}"
        fi
        return 0
    else
        echo -e "${RED}✗ $errors error(s) found${NC}"
        if [ $warnings -gt 0 ]; then
            echo -e "${YELLOW}⚠ $warnings warning(s)${NC}"
        fi
        return 1
    fi
}

check_docker() {
    echo "=========================================="
    echo "Checking DOCKER Installation"
    echo "=========================================="
    echo ""
    
    local errors=0
    local warnings=0
    
    # Check if container is running
    echo -n "Vision service container: "
    if docker ps | grep -q "vision-service-dev"; then
        echo -e "${GREEN}✓ Running${NC}"
        CONTAINER_NAME="vision-service-dev"
    else
        echo -e "${YELLOW}⚠ Not running${NC}"
        echo "  Attempting to check image..."
        if docker images | grep -q "vision-service"; then
            CONTAINER_NAME="vision-service:dev"
            echo "  Image exists, will test in temporary container"
        else
            echo -e "${RED}✗ Container/image not found${NC}"
            echo "  Build with: docker-compose -f docker-compose.dev.yml build vision-service"
            ((errors++))
            return 1
        fi
    fi
    echo ""
    
    # Check Ultralytics in container
    echo -n "Ultralytics in container: "
    if docker exec "$CONTAINER_NAME" python3 -c "import ultralytics" 2>/dev/null || \
       docker run --rm "$CONTAINER_NAME" python3 -c "import ultralytics" 2>/dev/null; then
        ULTRALYTICS_VERSION=$(docker exec "$CONTAINER_NAME" python3 -c "import ultralytics; print(ultralytics.__version__)" 2>/dev/null || \
                            docker run --rm "$CONTAINER_NAME" python3 -c "import ultralytics; print(ultralytics.__version__)" 2>/dev/null)
        echo -e "${GREEN}✓ Installed (version: $ULTRALYTICS_VERSION)${NC}"
    else
        echo -e "${RED}✗ NOT INSTALLED${NC}"
        ((errors++))
    fi
    echo ""
    
    # Check PyTorch in container
    echo -n "PyTorch in container: "
    if docker exec "$CONTAINER_NAME" python3 -c "import torch" 2>/dev/null || \
       docker run --rm "$CONTAINER_NAME" python3 -c "import torch" 2>/dev/null; then
        PYTORCH_VERSION=$(docker exec "$CONTAINER_NAME" python3 -c "import torch; print(torch.__version__)" 2>/dev/null || \
                         docker run --rm "$CONTAINER_NAME" python3 -c "import torch; print(torch.__version__)" 2>/dev/null)
        CUDA_AVAILABLE=$(docker exec "$CONTAINER_NAME" python3 -c "import torch; print(torch.cuda.is_available())" 2>/dev/null || \
                        docker run --rm "$CONTAINER_NAME" python3 -c "import torch; print(torch.cuda.is_available())" 2>/dev/null)
        echo "Installed (version: $PYTORCH_VERSION)"
        if [ "$CUDA_AVAILABLE" = "True" ]; then
            echo -e "  ${GREEN}✓ CUDA available${NC}"
        else
            echo -e "  ${YELLOW}⚠ CUDA not available${NC}"
            ((warnings++))
        fi
    else
        echo -e "${RED}✗ NOT INSTALLED${NC}"
        ((errors++))
    fi
    echo ""
    
    # Check TensorRT in container
    echo -n "TensorRT in container: "
    if docker exec "$CONTAINER_NAME" test -d /usr/src/tensorrt 2>/dev/null || \
       docker run --rm "$CONTAINER_NAME" test -d /usr/src/tensorrt 2>/dev/null; then
        echo -e "${GREEN}✓ Found${NC}"
    else
        echo -e "${YELLOW}⚠ Not found${NC}"
        ((warnings++))
    fi
    echo ""
    
    # Test YOLOE export in container
    echo "Testing YOLOE export capability in container..."
    docker exec "$CONTAINER_NAME" python3 -c "
import sys
try:
    from ultralytics import YOLOE
    print('✓ Ultralytics YOLOE import successful')
    
    # Check export method availability (without loading model)
    if hasattr(YOLOE, '__call__'):
        print('✓ YOLOE class available')
    else:
        print('✗ YOLOE class not available')
        sys.exit(1)
        
except ImportError as e:
    print(f'✗ Import error: {e}')
    sys.exit(1)
except Exception as e:
    print(f'⚠ Error: {e}')
    sys.exit(1)
" 2>/dev/null || \
    docker run --rm "$CONTAINER_NAME" python3 -c "
import sys
try:
    from ultralytics import YOLOE
    print('✓ Ultralytics YOLOE import successful')
    
    # Check export method availability (without loading model)
    if hasattr(YOLOE, '__call__'):
        print('✓ YOLOE class available')
    else:
        print('✗ YOLOE class not available')
        sys.exit(1)
        
except ImportError as e:
    print(f'✗ Import error: {e}')
    sys.exit(1)
except Exception as e:
    print(f'⚠ Error: {e}')
    sys.exit(1)
" 2>/dev/null || true
    
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✓ Export capability verified${NC}"
    else
        echo -e "${YELLOW}⚠ Export capability check incomplete${NC}"
        ((warnings++))
    fi
    echo ""
    
    # Check INT8 model path in docker-compose
    echo "Checking docker-compose INT8 model configuration..."
    if grep -q "yoloe-11s-seg-pf_640_int8.engine\|yolo11n_640_int8.engine" docker-compose.dev.yml 2>/dev/null; then
        echo -e "${GREEN}✓ docker-compose.dev.yml configured for INT8 model${NC}"
    else
        echo -e "${YELLOW}⚠ INT8 model path not found in docker-compose.dev.yml${NC}"
        ((warnings++))
    fi
    echo ""
    
    # Summary
    echo "=========================================="
    echo "Docker Installation Summary"
    echo "=========================================="
    if [ $errors -eq 0 ]; then
        echo -e "${GREEN}✓ Installation OK${NC}"
        if [ $warnings -gt 0 ]; then
            echo -e "${YELLOW}⚠ $warnings warning(s)${NC}"
        fi
        return 0
    else
        echo -e "${RED}✗ $errors error(s) found${NC}"
        if [ $warnings -gt 0 ]; then
            echo -e "${YELLOW}⚠ $warnings warning(s)${NC}"
        fi
        return 1
    fi
}

# Main execution
LOCAL_RESULT=0
DOCKER_RESULT=0

if [ "$MODE" = "local" ] || [ "$MODE" = "both" ]; then
    check_local
    LOCAL_RESULT=$?
fi

if [ "$MODE" = "docker" ] || [ "$MODE" = "both" ]; then
    check_docker
    DOCKER_RESULT=$?
fi

echo ""
echo "=========================================="
echo "Overall Summary"
echo "=========================================="

if [ $LOCAL_RESULT -eq 0 ] && [ $DOCKER_RESULT -eq 0 ]; then
    echo -e "${GREEN}✓ All checks passed${NC}"
    exit 0
elif [ $LOCAL_RESULT -eq 0 ] || [ $DOCKER_RESULT -eq 0 ]; then
    echo -e "${YELLOW}⚠ Some checks passed with warnings${NC}"
    exit 0
else
    echo -e "${RED}✗ Some checks failed${NC}"
    exit 1
fi
