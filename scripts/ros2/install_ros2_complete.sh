#!/bin/bash
# Complete ROS 2 Humble Installation Script (for Ubuntu 22.04 / Jetson)
# Note: Jazzy requires Ubuntu 24.04, so we use Humble (LTS) for Ubuntu 22.04
# Run with: sudo ./scripts/ros2/install_ros2_complete.sh
# Or: ./scripts/ros2/install_ros2_complete.sh (will prompt for password)

set -e

echo "=========================================="
echo "ROS 2 Humble Complete Installation"
echo "=========================================="

# Step 1: Fix GPG Key (modern method, no deprecated apt-key)
echo ""
echo "Step 1: Setting up GPG key and repository..."
sudo rm -f /etc/apt/sources.list.d/ros2-latest.list
echo "  ✓ Removed old repository file"

# Download GPG key and convert to binary format (modern method)
curl -sSL https://raw.githubusercontent.com/ros/rosdistro/master/ros.asc | sudo gpg --batch --yes --dearmor -o /etc/apt/trusted.gpg.d/ros-archive-keyring.gpg
echo "  ✓ GPG key downloaded and converted to binary format"

# Verify key file exists
if [ -f /etc/apt/trusted.gpg.d/ros-archive-keyring.gpg ]; then
    echo "  ✓ GPG key verified"
else
    echo "  ✗ GPG key verification failed"
    exit 1
fi

# Add repository with signed-by reference
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/trusted.gpg.d/ros-archive-keyring.gpg] http://packages.ros.org/ros2/ubuntu $(lsb_release -cs) main" | sudo tee /etc/apt/sources.list.d/ros2-latest.list > /dev/null
echo "  ✓ Repository added"

# Step 2: Update package lists
echo ""
echo "Step 2: Updating package lists..."
sudo apt update
echo "  ✓ Package lists updated"

# Step 3: Install ROS 2 Humble (LTS for Ubuntu 22.04)
echo ""
echo "Step 3: Installing ROS 2 Humble (this may take 10-20 minutes)..."
sudo apt install -y ros-humble-desktop python3-colcon-common-extensions python3-rosdep python3-vcstool
echo "  ✓ ROS 2 Humble installed"

# Step 4: Initialize rosdep
echo ""
echo "Step 4: Initializing rosdep..."
if [ ! -f /etc/ros/rosdep/sources.list.d/20-default.list ]; then
    sudo rosdep init
    echo "  ✓ rosdep initialized"
else
    echo "  ✓ rosdep already initialized"
fi

rosdep update
echo "  ✓ rosdep updated"

# Step 5: Install additional packages
echo ""
echo "Step 5: Installing additional ROS 2 packages..."
sudo apt install -y \
    ros-humble-cv-bridge \
    ros-humble-image-transport \
    ros-humble-image-transport-plugins \
    ros-humble-vision-msgs \
    ros-humble-v4l2-camera \
    ros-humble-camera-info-manager \
    ros-humble-rosbridge-suite \
    ros-humble-rosapi \
    ros-humble-rosbridge-server \
    ros-humble-rosbridge-library \
    python3-pip
echo "  ✓ Additional packages installed"

# Step 6: Install Python dependencies
echo ""
echo "Step 6: Installing Python dependencies..."
pip3 install --user pyserial numpy opencv-python-headless
echo "  ✓ Python dependencies installed"

echo ""
echo "=========================================="
echo "ROS 2 Humble installation complete!"
echo "=========================================="
echo ""
echo "Next steps:"
echo "  1. Exit if you ran as root: exit"
echo "  2. Run: cd /home/zip/Zip/zip && ./scripts/ros2/continue_setup.sh"
echo ""
