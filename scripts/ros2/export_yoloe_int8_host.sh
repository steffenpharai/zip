#!/bin/bash
# Export YOLOE INT8 model on host (without Docker)
# Two-step process: ONNX export → TensorRT INT8 engine via trtexec
# Usage: ./scripts/ros2/export_yoloe_int8_host.sh [model_name] [input_size] [precision]

set -e

MODEL_NAME=${1:-yoloe-11s-seg-pf}
INPUT_SIZE=${2:-640}
PRECISION=${3:-int8}
# Use host workspace path
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"
OUTPUT_DIR="${PROJECT_ROOT}/ros2_packages/zip_vision/models/yoloe"

echo "=========================================="
echo "YOLOE INT8 TensorRT Export (Host)"
echo "Two-step: ONNX → TensorRT via trtexec"
echo "=========================================="
echo "Model: ${MODEL_NAME}"
echo "Input Size: ${INPUT_SIZE}x${INPUT_SIZE}"
echo "Precision: ${PRECISION}"
echo "Output: ${OUTPUT_DIR}"
echo ""

# Create output directory
mkdir -p "${OUTPUT_DIR}"

# Check if running in Docker (should not be)
if [ -f /.dockerenv ]; then
    echo "⚠️  Warning: This script is designed to run on host, not in Docker"
    echo "   Use export_yoloe_int8_docker.sh for Docker containers"
fi

# Verify Ultralytics is installed
if ! python3 -c "import ultralytics" 2>/dev/null; then
    echo "Error: Ultralytics is not installed"
    echo "Install with: pip3 install ultralytics"
    echo "Or use the Docker container which has it pre-installed"
    exit 1
fi

ULTRALYTICS_VERSION=$(python3 -c "import ultralytics; print(ultralytics.__version__)" 2>/dev/null || echo "unknown")
echo "✓ Ultralytics installed (version: ${ULTRALYTICS_VERSION})"

# Verify CUDA/GPU is available
if ! python3 -c "import torch; print(torch.cuda.is_available())" 2>/dev/null | grep -q "True"; then
    echo "Warning: CUDA not available. TensorRT export may fail or be slow."
fi

# Step 1: Export to ONNX
ONNX_FILE="${OUTPUT_DIR}/${MODEL_NAME}_${INPUT_SIZE}.onnx"
echo ""
echo "=========================================="
echo "Step 1: Exporting to ONNX"
echo "=========================================="

python3 << EOF
from ultralytics import YOLOE
import os
import sys
import shutil

try:
    # Load YOLOE model
    print(f"Loading model: ${MODEL_NAME}...")
    model = YOLOE('${MODEL_NAME}')
    print("✓ Model loaded successfully")
    
    # Set device - use CPU for ONNX export to avoid GPU memory issues
    # ONNX export is a one-time operation and doesn't need GPU acceleration
    import torch
    import os
    
    # Check available GPU memory
    if torch.cuda.is_available():
        try:
            free_mem = torch.cuda.get_device_properties(0).total_memory - torch.cuda.memory_allocated(0)
            free_mem_gb = free_mem / (1024**3)
            print(f"Available GPU memory: {free_mem_gb:.2f} GB")
            
            # Only use GPU if we have > 2GB free (needed for large models)
            if free_mem_gb > 2.0:
                device = 0
                print("✓ Using GPU for ONNX export (sufficient memory)")
            else:
                device = 'cpu'
                print(f"⚠ Using CPU for ONNX export (low GPU memory: {free_mem_gb:.2f} GB)")
        except Exception as e:
            print(f"⚠ Could not check GPU memory: {e}")
            device = 'cpu'
            print("⚠ Using CPU for ONNX export (fallback)")
    else:
        device = 'cpu'
        print("⚠ Using CPU for ONNX export (CUDA not available)")
    
    # Set environment variable to limit PyTorch GPU memory usage
    if device != 'cpu':
        os.environ['PYTORCH_CUDA_ALLOC_CONF'] = 'max_split_size_mb:512'
        print("✓ Set PYTORCH_CUDA_ALLOC_CONF to limit memory fragmentation")
    
    print(f"\nExporting to ONNX...")
    print("This may take a few minutes...")
    
    # Export to ONNX
    export_result = model.export(
        format='onnx',
        imgsz=${INPUT_SIZE},
        device=device,
        simplify=True,
        opset=12,
        verbose=True
    )
    
    # Find the exported ONNX file
    exported_file = None
    possible_paths = [
        '${MODEL_NAME}.onnx',
        os.path.join(os.path.expanduser('~/.ultralytics'), 'weights', '${MODEL_NAME}.onnx'),
        os.path.join(os.path.dirname(model.ckpt_path) if hasattr(model, 'ckpt_path') else '.', '${MODEL_NAME}.onnx')
    ]
    
    for path in possible_paths:
        if os.path.exists(path):
            exported_file = path
            break
    
    if exported_file:
        # Move to output directory
        target_path = '${ONNX_FILE}'
        shutil.move(exported_file, target_path)
        print(f"\n✓ ONNX exported to: {target_path}")
        
        # Get file size
        size_mb = os.path.getsize(target_path) / (1024 * 1024)
        print(f"✓ ONNX size: {size_mb:.2f} MB")
    else:
        # Try to find any .onnx file in current directory
        import glob
        onnx_files = glob.glob('*.onnx')
        if onnx_files:
            shutil.move(onnx_files[0], '${ONNX_FILE}')
            print(f"✓ ONNX exported to: ${ONNX_FILE}")
            size_mb = os.path.getsize('${ONNX_FILE}') / (1024 * 1024)
            print(f"✓ ONNX size: {size_mb:.2f} MB")
        else:
            print(f"✗ Error: Could not locate exported ONNX file")
            print(f"Export result: {export_result}")
            sys.exit(1)
            
except Exception as e:
    print(f"✗ Error during ONNX export: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)
EOF

if [ ! -f "${ONNX_FILE}" ]; then
    echo "Error: ONNX file not created"
    exit 1
fi

# Step 2: Convert ONNX to TensorRT INT8 engine using trtexec
ENGINE_FILE="${OUTPUT_DIR}/${MODEL_NAME}_${INPUT_SIZE}_${PRECISION}.engine"
echo ""
echo "=========================================="
echo "Step 2: Converting ONNX to TensorRT INT8"
echo "=========================================="

# Check if trtexec is available
TRTEXEC=""
if command -v trtexec &> /dev/null; then
    TRTEXEC="trtexec"
elif [ -f /usr/src/tensorrt/bin/trtexec ]; then
    TRTEXEC="/usr/src/tensorrt/bin/trtexec"
elif [ -f /usr/local/bin/trtexec ]; then
    TRTEXEC="/usr/local/bin/trtexec"
else
    echo "Error: trtexec not found. Make sure TensorRT is installed."
    echo "On Jetson, TensorRT is included in JetPack."
    echo "Searching for trtexec..."
    FOUND_TRTEXEC=$(find /usr -name trtexec 2>/dev/null | head -1)
    if [ -n "${FOUND_TRTEXEC}" ]; then
        TRTEXEC="${FOUND_TRTEXEC}"
        echo "Found trtexec at: ${TRTEXEC}"
    else
        exit 1
    fi
fi

echo "Using trtexec: ${TRTEXEC}"
echo "ONNX file: ${ONNX_FILE}"
echo "Output engine: ${ENGINE_FILE}"
echo ""
echo "Building TensorRT INT8 engine..."
echo "This may take 10-30 minutes on Jetson..."

# Check available GPU memory before building
echo "Checking GPU memory availability..."
GPU_MEM=$(nvidia-smi --query-gpu=memory.free --format=csv,noheader,nounits 2>/dev/null | head -1 || echo "0")
if [ -n "${GPU_MEM}" ] && [ "${GPU_MEM}" != "0" ] && [ "${GPU_MEM}" != "[N/A]" ]; then
    echo "Available GPU memory: ${GPU_MEM}MB"
    if [ ${GPU_MEM} -lt 2000 ]; then
        echo "⚠️  Warning: Low GPU memory (${GPU_MEM}MB). Engine build may fail."
        echo "   Recommendation: Close other GPU processes or use FP16 instead of INT8"
    fi
else
    echo "⚠️  Could not query GPU memory. Proceeding with caution."
fi

# Check ONNX file size to estimate model variant
ONNX_SIZE=$(du -m "${ONNX_FILE}" 2>/dev/null | cut -f1 || echo "0")
if [ -n "${ONNX_SIZE}" ] && [ "${ONNX_SIZE}" != "0" ]; then
    echo "ONNX file size: ${ONNX_SIZE}MB"
    # Adjust workspace based on model size
    # Small models (< 50MB): 2GB workspace
    # Medium models (50-100MB): 2.5GB workspace  
    # Large models (> 100MB): 3GB workspace
    if [ ${ONNX_SIZE} -gt 100 ]; then
        WORKSPACE_SIZE=3072
        echo "Large model detected. Using 3GB workspace."
    elif [ ${ONNX_SIZE} -gt 50 ]; then
        WORKSPACE_SIZE=2560
        echo "Medium model detected. Using 2.5GB workspace."
    else
        WORKSPACE_SIZE=2048
        echo "Small model detected. Using 2GB workspace."
    fi
else
    # Default workspace size (can be overridden via 4th parameter)
    WORKSPACE_SIZE=${4:-2048}
    echo "Using default workspace size: ${WORKSPACE_SIZE}MB"
fi

# Build trtexec command for INT8
TRTEXEC_CMD="${TRTEXEC} --onnx=\"${ONNX_FILE}\" --saveEngine=\"${ENGINE_FILE}\" --int8"

# Set workspace size (adaptive based on model size)
TRTEXEC_CMD="${TRTEXEC_CMD} --memPoolSize=workspace:${WORKSPACE_SIZE}"

# Detect input tensor name from ONNX file (Ultralytics uses "images", some models use "input")
echo "Detecting input tensor name from ONNX file..."
INPUT_TENSOR_NAME=$(python3 << PYEOF
import onnx
try:
    model = onnx.load('${ONNX_FILE}')
    input_names = [i.name for i in model.graph.input]
    # Prefer "images" (Ultralytics default), fallback to "input" or first input
    if 'images' in input_names:
        print('images')
    elif 'input' in input_names:
        print('input')
    elif len(input_names) > 0:
        print(input_names[0])
    else:
        print('input')  # Default fallback
except Exception as e:
    print('input')  # Default if detection fails
PYEOF
)

echo "Detected input tensor name: ${INPUT_TENSOR_NAME}"

# Set input shapes (fixed size for YOLOE) using detected tensor name
TRTEXEC_CMD="${TRTEXEC_CMD} --minShapes=${INPUT_TENSOR_NAME}:1x3x${INPUT_SIZE}x${INPUT_SIZE}"
TRTEXEC_CMD="${TRTEXEC_CMD} --optShapes=${INPUT_TENSOR_NAME}:1x3x${INPUT_SIZE}x${INPUT_SIZE}"
TRTEXEC_CMD="${TRTEXEC_CMD} --maxShapes=${INPUT_TENSOR_NAME}:1x3x${INPUT_SIZE}x${INPUT_SIZE}"

# Enable verbose output
TRTEXEC_CMD="${TRTEXEC_CMD} --verbose"

# For INT8, we can optionally specify calibration cache
# But trtexec will use default calibration if not provided
echo "Note: Using default INT8 calibration (no calibration cache provided)"
echo "For better accuracy, consider providing a calibration dataset"

# Execute trtexec with error handling
echo "Executing: ${TRTEXEC_CMD}"
echo ""

# Run trtexec and capture output
if eval ${TRTEXEC_CMD} 2>&1 | tee /tmp/trtexec_output.log; then
    TRTEXEC_STATUS=0
else
    TRTEXEC_STATUS=$?
    echo ""
    echo "⚠️  trtexec exited with status: ${TRTEXEC_STATUS}"
    echo "Checking for common issues..."
    
    # Check for memory errors
    if grep -i "out of memory\|OOM\|memory\|NvMapMemAlloc" /tmp/trtexec_output.log > /dev/null 2>&1; then
        echo "❌ Memory error detected in trtexec output"
        echo "   Recommendation:"
        echo "   1. Reduce workspace size: Use --memPoolSize=workspace:1536 (1.5GB)"
        echo "   2. Use FP16 instead of INT8: Change precision parameter to 'fp16'"
        echo "   3. Close other GPU processes"
        echo "   4. Add swap space if not available"
    fi
    
    # Check for tensor name errors
    if grep -i "tensor.*not found\|input.*not found\|images.*not found" /tmp/trtexec_output.log > /dev/null 2>&1; then
        echo "❌ Tensor name mismatch detected"
        echo "   The ONNX model may use a different input tensor name"
        echo "   Check ONNX file with: python3 -c \"import onnx; m=onnx.load('${ONNX_FILE}'); print([i.name for i in m.graph.input])\""
    fi
    
    # Check for calibration errors (INT8 specific)
    if [ "${PRECISION}" = "int8" ] && grep -i "calibration\|calib" /tmp/trtexec_output.log > /dev/null 2>&1; then
        echo "⚠️  INT8 calibration issue detected"
        echo "   Recommendation: Try FP16 instead (change precision to 'fp16')"
    fi
    
    echo ""
    echo "Full trtexec output saved to: /tmp/trtexec_output.log"
    exit ${TRTEXEC_STATUS}
fi

if [ -f "${ENGINE_FILE}" ]; then
    ENGINE_SIZE=$(du -h "${ENGINE_FILE}" | cut -f1)
    ENGINE_SIZE_MB=$(du -m "${ENGINE_FILE}" | cut -f1)
    echo ""
    echo "=========================================="
    echo "Export complete!"
    echo "=========================================="
    echo "ONNX file: ${ONNX_FILE}"
    echo "TensorRT INT8 engine: ${ENGINE_FILE}"
    echo "Engine size: ${ENGINE_SIZE} (${ENGINE_SIZE_MB} MB)"
    echo ""
    echo "The model is now available at:"
    echo "  ${ENGINE_FILE}"
    echo ""
    echo "To use the model, update docker-compose.dev.yml:"
    echo "  YOLOE_MODEL_PATH=${ENGINE_FILE}"
else
    echo "Error: TensorRT engine file not created"
    echo "Check trtexec output above for errors"
    exit 1
fi
