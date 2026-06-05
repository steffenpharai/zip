#!/bin/bash
# Comprehensive YOLOE Migration Verification Script
# Verifies all migration steps from the plan are complete

set -e

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo "=========================================="
echo "YOLOE Migration Verification"
echo "=========================================="
echo ""

errors=0
warnings=0

# Check Python imports (exclude test/verification scripts and comments)
echo "1. Checking Python imports..."
if grep -r "from ultralytics import YOLO[^E]" --include="*.py" --include="*.sh" . 2>/dev/null | \
   grep -v ".git" | grep -v "node_modules" | grep -v "__pycache__" | \
   grep -v "verify_yoloe_migration.sh" | grep -v "test_yoloe" | grep -v "verify_" | \
   grep -v "#" | head -5; then
    echo -e "  ${RED}✗ Found YOLO imports (should be YOLOE)${NC}"
    errors=$((errors + 1))
else
    echo -e "  ${GREEN}✓ No incorrect YOLO imports found${NC}"
fi

# Check model names
echo ""
echo "2. Checking model names..."
if grep -r "yolo11n\.pt\|yolo11" --include="*.py" --include="*.sh" --include="*.yaml" --include="*.ts" --include="*.tsx" . 2>/dev/null | grep -v ".git" | grep -v "node_modules" | grep -v "yoloe" | grep -v "YOLOE" | head -5; then
    echo -e "  ${YELLOW}⚠ Found YOLO11 references (may be intentional for compatibility)${NC}"
    warnings=$((warnings + 1))
else
    echo -e "  ${GREEN}✓ Model names updated${NC}"
fi

# Check native installation
echo ""
echo "3. Checking native installation..."
if systemctl is-active --quiet zip-vision.service 2>/dev/null; then
    echo -e "  ${GREEN}✓ Vision service running (systemd)${NC}"
    if python3 -c "from ultralytics import YOLOE; print('OK')" 2>/dev/null | grep -q "OK"; then
        echo -e "  ${GREEN}✓ YOLOE importable${NC}"
    else
        echo -e "  ${RED}✗ YOLOE not importable${NC}"
        errors=$((errors + 1))
    fi
else
    echo -e "  ${YELLOW}⚠ Vision service not running (check with: systemctl status zip-vision)${NC}"
    warnings=$((warnings + 1))
fi

# Check frontend
echo ""
echo "4. Checking frontend integration..."
if curl -s http://localhost:3000/vision-diagnostics 2>/dev/null | grep -qi "yoloe"; then
    echo -e "  ${GREEN}✓ Frontend shows YOLOE${NC}"
else
    echo -e "  ${YELLOW}⚠ Frontend may not be updated${NC}"
    warnings=$((warnings + 1))
fi

# Check API endpoints
echo ""
echo "5. Checking API endpoints..."
if curl -s http://localhost:8767/api/vision/detections 2>/dev/null | python3 -c "import sys, json; d=json.load(sys.stdin); print('OK' if 'detections' in d else 'FAIL')" 2>/dev/null | grep -q "OK"; then
    echo -e "  ${GREEN}✓ Diagnostics bridge API working${NC}"
else
    echo -e "  ${RED}✗ Diagnostics bridge API not working${NC}"
    errors=$((errors + 1))
fi

# Check C++ comments
echo ""
echo "6. Checking C++ code comments..."
if grep -r "YOLO11" ros2_packages/zip_vision/src/*.cpp ros2_packages/zip_vision/include/*.hpp 2>/dev/null | grep -v "YOLOE" | grep -v "yolo11_engine\|yolo11_node" | head -3; then
    echo -e "  ${YELLOW}⚠ Found YOLO11 in C++ comments (class names kept for compatibility)${NC}"
    warnings=$((warnings + 1))
else
    echo -e "  ${GREEN}✓ C++ comments updated${NC}"
fi

# Summary
echo ""
echo "=========================================="
echo "Verification Summary"
echo "=========================================="
echo -e "Errors: ${errors}"
echo -e "Warnings: ${warnings}"
echo ""

if [ $errors -eq 0 ]; then
    echo -e "${GREEN}✓ Migration verification passed!${NC}"
    exit 0
else
    echo -e "${RED}✗ Migration verification failed with ${errors} error(s)${NC}"
    exit 1
fi
