#!/bin/bash
# Complete YOLOE-v8L export: Install dependencies, export ONNX, build TensorRT
# This script handles the THU-MIG YOLOE repository setup

set -e

MODEL_DIR="/home/steffen/Projects/Zip/ros2_packages/zip_vision/models/yoloe"
MODEL_FILE="${MODEL_DIR}/yoloe-v8l-seg-pf.pt"
MOBILECLIP_FILE="${MODEL_DIR}/mobileclip_blt.pt"
ONNX_FILE="${MODEL_DIR}/yoloe-v8l-seg-pf_640.onnx"
ENGINE_FILE="${MODEL_DIR}/yoloe-v8l-seg-pf_640_int8.engine"
YOLOE_REPO="/tmp/yoloe"

echo "=========================================="
echo "YOLOE-v8L Complete Export Process"
echo "=========================================="

# Check prerequisites
if [ ! -f "$MODEL_FILE" ]; then
    echo "Error: Model file not found: $MODEL_FILE"
    echo "Download it first:"
    echo "  wget -O $MODEL_FILE https://huggingface.co/jameslahm/yoloe/resolve/main/yoloe-v8l-seg-pf.pt"
    exit 1
fi

if [ ! -f "$MOBILECLIP_FILE" ]; then
    echo "Error: MobileCLIP file not found: $MOBILECLIP_FILE"
    echo "Download it first:"
    echo "  wget -O $MOBILECLIP_FILE https://docs-assets.developer.apple.com/ml-research/datasets/mobileclip/mobileclip_blt.pt"
    exit 1
fi

echo "✓ Model files found"
echo "  Model: $(du -h $MODEL_FILE | cut -f1)"
echo "  MobileCLIP: $(du -h $MOBILECLIP_FILE | cut -f1)"

# Use Docker container which has all dependencies
echo ""
echo "Step 1: Exporting to ONNX in Docker container..."

docker exec vision-service-dev bash << DOCKER_SCRIPT
set -e

# Install YOLOE dependencies if not already installed
cd /tmp
if [ ! -d "yoloe" ]; then
    git clone --depth 1 https://github.com/THU-MIG/yoloe.git
fi

cd yoloe

# Install dependencies
echo "Installing YOLOE dependencies..."
pip3 install -q -e third_party/lvis-api 2>/dev/null || true
pip3 install -q -e third_party/ml-mobileclip 2>/dev/null || true  
pip3 install -q -e third_party/CLIP 2>/dev/null || true
pip3 install -q -e . 2>/dev/null || true

# Export to ONNX
echo "Exporting model to ONNX..."
python3 << PYTHON_SCRIPT
import sys
import os
sys.path.insert(0, '/tmp/yoloe')

try:
    from yoloe import YOLOE
    
    model_path = "/workspace/ros2_packages/zip_vision/models/yoloe/yoloe-v8l-seg-pf.pt"
    mobileclip_path = "/workspace/ros2_packages/zip_vision/models/yoloe/mobileclip_blt.pt"
    onnx_path = "/workspace/ros2_packages/zip_vision/models/yoloe/yoloe-v8l-seg-pf_640.onnx"
    
    print("Loading YOLOE-v8L model...")
    model = YOLOE(model_path, mobileclip_path=mobileclip_path)
    print("✓ Model loaded")
    
    print("Exporting to ONNX...")
    result = model.export(format='onnx', imgsz=640, simplify=True, opset=12, device='cpu')
    
    # Find and move ONNX file
    import glob
    import shutil
    
    if os.path.exists(onnx_path):
        print(f"✓ ONNX at: {onnx_path}")
    else:
        # Search for exported file
        search_paths = [
            result if isinstance(result, str) else None,
            "yoloe-v8l-seg-pf_640.onnx",
            "yoloe-v8l-seg-pf.onnx",
        ]
        search_paths.extend(glob.glob("*.onnx"))
        search_paths.extend(glob.glob("/root/.ultralytics/weights/*.onnx"))
        
        for p in search_paths:
            if p and os.path.exists(p):
                shutil.move(p, onnx_path)
                print(f"✓ ONNX moved to: {onnx_path}")
                break
        else:
            print(f"⚠ Could not locate ONNX file")
            print(f"  Export result: {result}")
            print(f"  Current dir: {os.getcwd()}")
            
except Exception as e:
    print(f"✗ Error: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)
PYTHON_SCRIPT

DOCKER_SCRIPT

# Verify ONNX file
if [ -f "$ONNX_FILE" ]; then
    echo "✓ ONNX file created: $(du -h $ONNX_FILE | cut -f1)"
else
    echo "✗ ONNX export failed"
    exit 1
fi

# Build TensorRT engine on host
echo ""
echo "Step 2: Building TensorRT INT8 engine..."
TRTEXEC="/usr/src/tensorrt/samples/trtexec"

if [ ! -f "$TRTEXEC" ]; then
    TRTEXEC=$(find /usr -name trtexec 2>/dev/null | head -1)
fi

if [ -z "$TRTEXEC" ] || [ ! -f "$TRTEXEC" ]; then
    echo "Error: trtexec not found"
    exit 1
fi

echo "Using trtexec: $TRTEXEC"
echo "This may take 15-30 minutes..."

$TRTEXEC --onnx="$ONNX_FILE" --saveEngine="$ENGINE_FILE" \
    --int8 --memPoolSize=workspace:3072 \
    --minShapes=images:1x3x640x640 \
    --optShapes=images:1x3x640x640 \
    --maxShapes=images:1x3x640x640 \
    --verbose 2>&1 | tee /tmp/yoloe_v8l_trt_build.log

if [ -f "$ENGINE_FILE" ]; then
    echo ""
    echo "=========================================="
    echo "✓ Export Complete!"
    echo "=========================================="
    echo "ONNX: $ONNX_FILE ($(du -h $ONNX_FILE | cut -f1))"
    echo "Engine: $ENGINE_FILE ($(du -h $ENGINE_FILE | cut -f1))"
    echo ""
    echo "Update docker-compose.dev.yml:"
    echo "  YOLOE_MODEL_PATH=$ENGINE_FILE"
else
    echo "✗ TensorRT engine build failed"
    echo "Check logs: /tmp/yoloe_v8l_trt_build.log"
    exit 1
fi
