#!/bin/bash
#
# Export YOLOE-11 Prompt-Free Model to TensorRT Engine
#
# This script downloads and exports the YOLOE-11 model to TensorRT format
# optimized for Jetson Orin Nano 8GB.
#
# Usage:
#   ./export_yoloe_tensorrt.sh [model_variant] [imgsz]
#
# Examples:
#   ./export_yoloe_tensorrt.sh l 416    # YOLOE-11L, 416x416 (fastest)
#   ./export_yoloe_tensorrt.sh m 480    # YOLOE-11M, 480x480 (balanced)
#   ./export_yoloe_tensorrt.sh s 640    # YOLOE-11S, 640x640 (smallest)
#

set -e

# Default values
MODEL_VARIANT="${1:-l}"  # l, m, or s
IMGSZ="${2:-416}"        # 416, 480, or 640
MODEL_NAME="yoloe-11${MODEL_VARIANT}-seg-pf"
MODELS_DIR="${HOME}/ros2_ws/src/zip_vision/models"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}YOLOE-11 TensorRT Export Script${NC}"
echo "=================================="
echo "Model variant: ${MODEL_VARIANT} (${MODEL_NAME})"
echo "Image size: ${IMGSZ}x${IMGSZ}"
echo "Output directory: ${MODELS_DIR}"
echo ""

# Check if virtual environment is activated or if packages are available system-wide
if [[ -z "${VIRTUAL_ENV}" ]]; then
    # Check if Ultralytics is available system-wide
    if python3 -c "import ultralytics" 2>/dev/null; then
        echo -e "${GREEN}Using system-wide Ultralytics installation${NC}"
    else
        echo -e "${YELLOW}Warning: Virtual environment not activated.${NC}"
        echo "Activating default: ~/zip_vision_env"
        if [[ -f ~/zip_vision_env/bin/activate ]]; then
            source ~/zip_vision_env/bin/activate
        else
            echo -e "${RED}Error: Virtual environment not found and Ultralytics not available system-wide${NC}"
            echo "Please either:"
            echo "  1. Create venv: python3 -m venv ~/zip_vision_env && source ~/zip_vision_env/bin/activate && pip install ultralytics"
            echo "  2. Install system-wide: pip3 install --user ultralytics"
            exit 1
        fi
    fi
fi

# Check if Ultralytics is installed
if ! python3 -c "import ultralytics" 2>/dev/null; then
    echo -e "${RED}Error: Ultralytics not installed${NC}"
    echo "Install it: pip install ultralytics"
    exit 1
fi

# Check if CUDA is available (warn but continue - TensorRT export may still work)
if ! python3 -c "import torch; assert torch.cuda.is_available()" 2>/dev/null; then
    echo -e "${YELLOW}Warning: PyTorch CUDA not available${NC}"
    echo "TensorRT export may still work. Continuing..."
    echo "For best performance, install Jetson-optimized PyTorch from NVIDIA"
fi

# Create models directory
mkdir -p "${MODELS_DIR}"
cd "${MODELS_DIR}"

# Download model if not exists
PT_FILE="${MODEL_NAME}.pt"
if [[ ! -f "${PT_FILE}" ]]; then
    echo -e "${YELLOW}Downloading ${MODEL_NAME}.pt from HuggingFace...${NC}"
    
    # Try using huggingface_hub
    if python3 -c "import huggingface_hub" 2>/dev/null; then
        python3 << EOF
from huggingface_hub import hf_hub_download
import os

repo_id = "jameslahm/yoloe"
filename = "${PT_FILE}"
local_dir = "${MODELS_DIR}"

print(f"Downloading {filename} from {repo_id}...")
hf_hub_download(
    repo_id=repo_id,
    filename=filename,
    local_dir=local_dir,
    local_dir_use_symlinks=False
)
print(f"Downloaded to: {os.path.join(local_dir, filename)}")
EOF
    else
        echo -e "${YELLOW}Installing huggingface_hub...${NC}"
        pip install huggingface_hub
        python3 << EOF
from huggingface_hub import hf_hub_download
import os

repo_id = "jameslahm/yoloe"
filename = "${PT_FILE}"
local_dir = "${MODELS_DIR}"

print(f"Downloading {filename} from {repo_id}...")
hf_hub_download(
    repo_id=repo_id,
    filename=filename,
    local_dir=local_dir,
    local_dir_use_symlinks=False
)
print(f"Downloaded to: {os.path.join(local_dir, filename)}")
EOF
    fi
    
    if [[ ! -f "${PT_FILE}" ]]; then
        echo -e "${RED}Error: Failed to download model${NC}"
        echo "Please download manually from: https://huggingface.co/jameslahm/yoloe"
        exit 1
    fi
else
    echo -e "${GREEN}Model file already exists: ${PT_FILE}${NC}"
fi

# Export to TensorRT
ENGINE_FILE="${MODEL_NAME}_${IMGSZ}_fp16.engine"
echo ""
echo -e "${GREEN}Exporting to TensorRT engine...${NC}"
echo "Input: ${PT_FILE}"
echo "Output: ${ENGINE_FILE}"
echo "Image size: ${IMGSZ}x${IMGSZ}"
echo "Precision: FP16"
echo ""

# Determine device (use CPU if CUDA not available, TensorRT will use GPU at runtime)
DEVICE="0"
if ! python3 -c "import torch; assert torch.cuda.is_available()" 2>/dev/null; then
    echo -e "${YELLOW}Using CPU for export (TensorRT will use GPU at runtime)${NC}"
    DEVICE="cpu"
fi

# Run export
# CRITICAL: Do NOT set single_cls=True - we want full vocabulary for prompt-free models
# YOLOE-v8L-seg-pf should have ~4,585 classes (RAM++ tag set)
echo "Exporting with FULL vocabulary (not single_cls)..."
yolo export \
    model="${PT_FILE}" \
    format=engine \
    imgsz=${IMGSZ} \
    half=True \
    device=${DEVICE} \
    workspace=4 \
    verbose=True
    # NOTE: We explicitly do NOT set single_cls=True
    # For prompt-free models, we want the full vocabulary preserved

# Rename exported engine file
EXPORTED_ENGINE="${MODEL_NAME}.engine"
if [[ -f "${EXPORTED_ENGINE}" ]]; then
    if [[ -f "${ENGINE_FILE}" ]]; then
        rm -f "${ENGINE_FILE}"
    fi
    mv "${EXPORTED_ENGINE}" "${ENGINE_FILE}"
    echo -e "${GREEN}✓ Engine exported: ${ENGINE_FILE}${NC}"
else
    echo -e "${RED}Error: Engine file not found after export${NC}"
    exit 1
fi

# Display file sizes
echo ""
echo "File sizes:"
ls -lh "${PT_FILE}" "${ENGINE_FILE}" 2>/dev/null | awk '{print $5, $9}'

# Test loading
echo ""
echo -e "${GREEN}Testing engine loading...${NC}"
python3 << EOF
from ultralytics import YOLO
import torch

engine_path = "${ENGINE_FILE}"
print(f"Loading engine: {engine_path}")

try:
    model = YOLO(engine_path)
    print(f"✓ Engine loaded successfully")
    print(f"  Device: {torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'CPU'}")
    print(f"  CUDA available: {torch.cuda.is_available()}")
except Exception as e:
    print(f"✗ Error loading engine: {e}")
    exit(1)
EOF

echo ""
echo -e "${GREEN}Export complete!${NC}"
echo "Engine file: ${MODELS_DIR}/${ENGINE_FILE}"
echo ""
echo "To use this engine, set in launch file or config:"
echo "  yoloe_model_path: ${MODELS_DIR}/${ENGINE_FILE}"
