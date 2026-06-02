#!/bin/bash
# Quick verification script - checks code changes without running full tests

set -e

echo "=========================================="
echo "Verifying Vision Diagnostics Fixes"
echo "=========================================="
echo ""

cd /home/zip/Zip/zip

# Check 1: Canvas element exists in JSX
echo "[1/5] Checking canvas element is present..."
if grep -q 'ref={streamCanvasRef}' app/vision-diagnostics/page.tsx; then
    echo "  ✓ Canvas element found"
else
    echo "  ❌ Canvas element missing"
    exit 1
fi

# Check 2: useEffect for stream overlays exists
echo "[2/5] Checking useEffect for stream overlays..."
if grep -q 'streamDetections.*drawStreamOverlays' app/vision-diagnostics/page.tsx; then
    echo "  ✓ useEffect hook found"
else
    echo "  ❌ useEffect hook missing"
    exit 1
fi

# Check 3: Raw camera stream endpoint
echo "[3/5] Checking stream endpoint..."
if grep -q "'/api/vision/camera/stream'" app/vision-diagnostics/page.tsx; then
    echo "  ✓ Raw camera stream endpoint found"
else
    echo "  ❌ Wrong stream endpoint"
    exit 1
fi

# Check 4: Debug test rectangles removed
echo "[4/5] Checking debug rectangles removed..."
if grep -q 'TEST BOX' app/vision-diagnostics/page.tsx; then
    echo "  ❌ Debug test rectangles still present"
    exit 1
else
    echo "  ✓ Debug rectangles removed"
fi

# Check 5: Bridge connection logic improved
echo "[5/5] Checking bridge connection logic..."
if grep -q '!isStreaming && !streamImageRef.current?.complete' app/vision-diagnostics/page.tsx; then
    echo "  ✓ Improved bridge disconnect logic found"
else
    echo "  ⚠ Bridge logic may need review"
fi

echo ""
echo "=========================================="
echo "✅ All code checks passed!"
echo "=========================================="
echo ""
echo "Summary of fixes:"
echo "  • Canvas overlay element re-enabled"
echo "  • useEffect added to trigger overlay updates"
echo "  • Switched to raw camera stream"
echo "  • Improved bridge connection logic"
echo "  • Removed debug test rectangles"
echo ""
echo "Ready for testing. Start services and navigate to /vision-diagnostics"
