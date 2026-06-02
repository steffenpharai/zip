#!/bin/bash
# Setup script for native TensorRT-LLM installation (Phase 3)
# Installs TensorRT-LLM natively on Jetson Orin Nano for VLM integration
# Also installs Ultralytics YOLO11 dependencies per NVIDIA/Ultralytics guide
# No Docker required - runs directly on host

set -e

echo "=========================================="
echo "ZIP Robot Phase 3: Native Vision Setup"
echo "Following Ultralytics YOLO11 Jetson Guide"
echo "=========================================="
echo ""

# Check if running on Jetson
if [ ! -f /etc/nv_tegra_release ]; then
    echo "Warning: This script is designed for Jetson hardware."
    echo "Continuing anyway..."
fi

# Detect JetPack version
if [ -f /etc/nv_tegra_release ]; then
    JETPACK_VERSION=$(cat /etc/nv_tegra_release | head -c 3)
    echo "Detected JetPack version: ${JETPACK_VERSION}"
else
    JETPACK_VERSION="6.1"  # Default assumption
    echo "Assuming JetPack 6.1 (default)"
fi

# Check if ROS 2 Humble is installed
if [ ! -f /opt/ros/humble/setup.bash ]; then
    echo "Error: ROS 2 Humble is not installed."
    echo "Please install it first:"
    echo "  ./scripts/ros2/install_ros2_humble_native.sh"
    exit 1
fi

echo "✓ ROS 2 Humble is installed"

# Source ROS 2 Humble
source /opt/ros/humble/setup.bash

# Check if vision_msgs is installed
if ! ros2 pkg list | grep -q "^vision_msgs$"; then
    echo ""
    echo "Installing vision_msgs package..."
    sudo apt install -y ros-humble-vision-msgs
    echo "  ✓ vision_msgs installed"
else
    echo "  ✓ vision_msgs already installed"
fi

# Install Ultralytics YOLO11 dependencies (per Ultralytics guide)
echo ""
echo "=========================================="
echo "Installing Ultralytics YOLO11 Dependencies"
echo "=========================================="

# Step 1: Install Ultralytics Package
echo ""
echo "Step 1: Installing Ultralytics package..."
if python3 -c "import ultralytics" 2>/dev/null; then
    ULTRALYTICS_VERSION=$(python3 -c "import ultralytics; print(ultralytics.__version__)" 2>/dev/null || echo "unknown")
    echo "  ✓ Ultralytics already installed (version: ${ULTRALYTICS_VERSION})"
else
    echo "  Installing Ultralytics..."
    pip3 install --user ultralytics || {
        echo "  ⚠ Failed to install Ultralytics via pip"
        echo "  Trying with sudo..."
        sudo pip3 install ultralytics
    }
    echo "  ✓ Ultralytics installed"
fi

# Step 2: Install PyTorch and Torchvision (Jetson-specific)
echo ""
echo "Step 2: Installing PyTorch and Torchvision for Jetson..."
echo "  Following Ultralytics guide: https://docs.ultralytics.com/guides/nvidia-jetson/"
echo "  Note: PyTorch for Jetson requires ARM64-compatible wheels"

# Check if PyTorch is already installed
if python3 -c "import torch; print('PyTorch:', torch.__version__)" 2>/dev/null; then
    PYTORCH_VERSION=$(python3 -c "import torch; print(torch.__version__)" 2>/dev/null)
    echo "  ✓ PyTorch already installed (version: ${PYTORCH_VERSION})"
    
    # Check if CUDA is available
    if python3 -c "import torch; print('CUDA available:', torch.cuda.is_available())" 2>/dev/null | grep -q "True"; then
        echo "  ✓ CUDA support available"
    else
        echo "  ⚠ CUDA support not available (may need Jetson-specific PyTorch)"
    fi
else
    echo "  PyTorch not found. Installing for Jetson..."
    echo ""
    echo "  IMPORTANT: PyTorch installation for Jetson requires specific steps:"
    echo "  1. Uninstall any existing pip-installed versions"
    echo "  2. Install Jetson-compatible wheels from NVIDIA"
    echo ""
    echo "  For JetPack ${JETPACK_VERSION}, follow these steps:"
    echo "  See: https://docs.ultralytics.com/guides/nvidia-jetson/#install-pytorch-and-torchvision"
    echo ""
    echo "  Quick install (if wheels available for your JetPack version):"
    read -p "  Attempt automatic PyTorch installation? (y/N) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        # Uninstall any existing pip-installed PyTorch/Torchvision
        echo "  Uninstalling any existing pip-installed versions..."
        pip3 uninstall -y torch torchvision 2>/dev/null || true
        pip3 uninstall -y torch torchvision --user 2>/dev/null || true
        
        # For JetPack 6.1, try installing from jetson-containers or NVIDIA PyPI
        echo "  Installing PyTorch for JetPack ${JETPACK_VERSION}..."
        
        # Try jetson-containers approach if available
        if command -v jetson-containers &> /dev/null; then
            echo "  Note: jetson-containers may provide pre-built PyTorch wheels"
            echo "  Consider using: jetson-containers build --name temp_pytorch pytorch"
        fi
        
        # Try standard pip install (may not work for Jetson ARM64)
        echo "  Attempting installation (may require manual steps)..."
        pip3 install --user torch torchvision || {
            echo ""
            echo "  ⚠ Automatic installation failed"
            echo "  Manual installation required:"
            echo "    1. Visit: https://forums.developer.nvidia.com/t/pytorch-for-jetson/72048"
            echo "    2. Download wheels for JetPack ${JETPACK_VERSION}"
            echo "    3. Install: pip3 install --user <wheel_file>.whl"
            echo "    4. Or use jetson-containers pre-built wheels"
        }
        
        # Verify installation
        if python3 -c "import torch; print('PyTorch:', torch.__version__)" 2>/dev/null; then
            PYTORCH_VERSION=$(python3 -c "import torch; print(torch.__version__)" 2>/dev/null)
            echo "  ✓ PyTorch installed successfully (version: ${PYTORCH_VERSION})"
        else
            echo "  ⚠ PyTorch installation incomplete - manual installation required"
        fi
    else
        echo "  ⏭ PyTorch installation skipped"
        echo "  Install manually following: https://docs.ultralytics.com/guides/nvidia-jetson/#install-pytorch-and-torchvision"
    fi
fi

# Step 3: Install onnxruntime-gpu
echo ""
echo "Step 3: Installing onnxruntime-gpu..."
if python3 -c "import onnxruntime" 2>/dev/null; then
    ONNXRUNTIME_VERSION=$(python3 -c "import onnxruntime; print(onnxruntime.__version__)" 2>/dev/null || echo "unknown")
    echo "  ✓ onnxruntime already installed (version: ${ONNXRUNTIME_VERSION})"
else
    echo "  Installing onnxruntime-gpu..."
    pip3 install --user onnxruntime-gpu || {
        echo "  ⚠ Failed to install onnxruntime-gpu"
        echo "  Trying standard onnxruntime..."
        pip3 install --user onnxruntime
    }
    echo "  ✓ onnxruntime installed"
fi

# Check if jetson-containers is available (for TensorRT-LLM wheels)
echo ""
echo "Checking for TensorRT-LLM installation options..."

# Option 1: Try jetson-containers wheels (if available)
if command -v jetson-containers &> /dev/null; then
    echo "  ✓ jetson-containers found"
    echo "  Note: jetson-containers can provide pre-built TensorRT-LLM wheels"
    echo "  However, we'll try direct pip installation first"
fi

# Option 2: Install TensorRT-LLM via pip (NVIDIA PyPI)
echo ""
echo "Installing TensorRT-LLM via pip (NVIDIA PyPI)..."
echo "This may take several minutes..."

# Check if pip has access to NVIDIA PyPI
if pip3 install --dry-run tensorrt-llm --extra-index-url https://pypi.nvidia.com > /dev/null 2>&1; then
    echo "  Installing TensorRT-LLM..."
    pip3 install --user tensorrt-llm --extra-index-url https://pypi.nvidia.com || {
        echo "  ⚠ Direct pip installation failed, trying alternative method..."
        
        # Alternative: Use jetson-containers wheels if available
        if [ -d "$HOME/jetson-containers" ]; then
            echo ""
            echo "Attempting to use jetson-containers wheels..."
            echo "Note: You may need to extract wheels from a jetson-containers container"
            echo "or build them separately. See documentation for details."
        fi
    }
else
    echo "  ⚠ Cannot access NVIDIA PyPI. Trying alternative installation..."
    echo ""
    echo "Alternative installation methods:"
    echo "  1. Use jetson-containers to extract pre-built wheels:"
    echo "     jetson-containers build --name temp_trtllm tensorrt_llm"
    echo "     # Then extract wheels from container"
    echo ""
    echo "  2. Build TensorRT-LLM from source (requires >32GB RAM/Swap):"
    echo "     # Not recommended for Jetson Orin Nano 8GB"
    echo ""
    echo "  3. Use pre-built wheels from NVIDIA (if available for your JetPack version)"
    echo ""
    read -p "Continue with manual TensorRT-LLM setup? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "TensorRT-LLM installation skipped. You can install it manually later."
        exit 0
    fi
fi

# Verify TensorRT-LLM installation
echo ""
echo "Verifying TensorRT-LLM installation..."
if python3 -c "import tensorrt_llm; print('TensorRT-LLM OK')" 2>/dev/null; then
    echo "  ✓ TensorRT-LLM is installed and importable"
    
    # Get version if possible
    TRTLLM_VERSION=$(python3 -c "import tensorrt_llm; print(tensorrt_llm.__version__)" 2>/dev/null || echo "unknown")
    echo "  Version: $TRTLLM_VERSION"
else
    echo "  ⚠ TensorRT-LLM is not importable"
    echo "  You may need to:"
    echo "    1. Install it manually via pip or jetson-containers"
    echo "    2. Add it to PYTHONPATH if installed in non-standard location"
    echo "    3. Check that all dependencies are installed"
fi

# Check for gdrcopy (may be needed for some TensorRT-LLM operations)
echo ""
echo "Checking for gdrcopy..."
if dpkg -l | grep -q "^ii.*gdrcopy"; then
    echo "  ✓ gdrcopy is installed"
else
    echo "  ⚠ gdrcopy not found (may be needed for some operations)"
    echo "  Install with: sudo apt install gdrcopy"
fi

# Check TensorRT installation (should be part of JetPack)
echo ""
echo "Checking TensorRT installation..."
if [ -d "/usr/src/tensorrt" ] || [ -d "/usr/local/tensorrt" ]; then
    echo "  ✓ TensorRT found"
else
    echo "  ⚠ TensorRT not found in standard locations"
    echo "  TensorRT should be included with JetPack 6.x"
fi

# Verify workspace setup
echo ""
echo "Verifying workspace setup..."
WORKSPACE_DIR="$HOME/zip_ros2_ws"
if [ -d "$WORKSPACE_DIR/src/zip_vision" ]; then
    echo "  ✓ zip_vision package found in workspace"
else
    echo "  ⚠ zip_vision package not found"
    echo "  Deploy packages with: ./scripts/ros2/deploy_packages.sh"
fi

echo ""
echo "=========================================="
echo "Native Vision Setup Complete!"
echo "=========================================="
echo ""
echo "Summary:"
echo "  ✓ ROS 2 Humble installed"
echo "  ✓ vision_msgs package installed"
if python3 -c "import ultralytics" 2>/dev/null; then
    echo "  ✓ Ultralytics YOLO11 installed"
else
    echo "  ⚠ Ultralytics needs manual installation"
fi
if python3 -c "import torch" 2>/dev/null; then
    echo "  ✓ PyTorch installed"
else
    echo "  ⚠ PyTorch needs manual installation"
fi
if python3 -c "import onnxruntime" 2>/dev/null; then
    echo "  ✓ onnxruntime installed"
else
    echo "  ⚠ onnxruntime needs manual installation"
fi
if python3 -c "import tensorrt_llm" 2>/dev/null; then
    echo "  ✓ TensorRT-LLM installed"
else
    echo "  ⚠ TensorRT-LLM needs manual installation"
fi
echo ""
echo "=========================================="
echo "Jetson Performance Optimization"
echo "=========================================="
echo ""
echo "⚠️  IMPORTANT: Before running YOLO11 inference, optimize Jetson performance"
echo "   following Ultralytics best practices:"
echo ""
echo "   Run optimization script:"
echo "     ./scripts/ros2/optimize_jetson_performance.sh"
echo ""
echo "   Or in non-interactive mode:"
echo "     ./scripts/ros2/optimize_jetson_performance.sh --auto"
echo ""
echo "   Verify optimizations are applied:"
echo "     ./scripts/ros2/verify_jetson_optimization.sh"
echo ""
read -p "Run optimization script now? (y/N) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    "${SCRIPT_DIR}/optimize_jetson_performance.sh"
fi

echo ""
echo "Next steps:"
echo "  2. If TensorRT-LLM is installed, verify:"
echo "     python3 -c \"import tensorrt_llm; print('OK')\""
echo ""
echo "  3. Build zip_vision package:"
echo "     cd ~/zip_ros2_ws"
echo "     source /opt/ros/humble/setup.bash"
echo "     colcon build --packages-select zip_vision"
echo ""
echo "  4. Set up YOLO11 TensorRT engine:"
echo "     ./scripts/ros2/export_yolo11_to_tensorrt.sh yolo11n 640"
echo ""
echo "  5. Set up VLM model (see Phase 3.3)"
echo ""
