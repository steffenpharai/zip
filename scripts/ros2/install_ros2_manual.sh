#!/bin/bash
# Manual ROS 2 Humble Installation Instructions
# Run this script with sudo, or copy commands to run manually

set -e

echo "=========================================="
echo "ROS 2 Humble Manual Installation"
echo "=========================================="
echo ""
echo "This script requires sudo privileges."
echo "If you're running this interactively, you'll be prompted for your password."
echo ""

# Set locale
export LANG=C.UTF-8
export LC_ALL=C.UTF-8
sudo locale-gen C.UTF-8 || true

# Add ROS 2 apt repository
echo "Adding ROS 2 repository..."
sudo apt update && sudo apt install -y \
    software-properties-common \
    curl \
    gnupg \
    lsb-release

# Add ROS 2 GPG key and repository
if [ ! -f /etc/apt/sources.list.d/ros2-latest.list ]; then
    sudo curl -sSL https://raw.githubusercontent.com/ros/rosdistro/master/ros.asc -o /usr/share/keyrings/ros-archive-keyring.gpg
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/ros-archive-keyring.gpg] http://packages.ros.org/ros2/ubuntu $(lsb_release -cs) main" | sudo tee /etc/apt/sources.list.d/ros2-latest.list > /dev/null
    echo "  ✓ ROS 2 repository added"
else
    echo "  ✓ ROS 2 repository already exists"
fi

# Install ROS 2 Humble
echo ""
echo "Installing ROS 2 Humble (this may take several minutes)..."
sudo apt update
sudo apt install -y \
    ros-humble-desktop \
    python3-colcon-common-extensions \
    python3-rosdep \
    python3-vcstool

# Initialize rosdep
echo ""
echo "Initializing rosdep..."
if [ ! -f /etc/ros/rosdep/sources.list.d/20-default.list ]; then
    sudo rosdep init
    echo "  ✓ rosdep initialized"
else
    echo "  ✓ rosdep already initialized"
fi

rosdep update

# Install additional ROS 2 packages
echo ""
echo "Installing additional ROS 2 packages..."
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

# Install Python dependencies
echo ""
echo "Installing Python dependencies..."
pip3 install --user \
    pyserial \
    numpy \
    opencv-python-headless

echo ""
echo "=========================================="
echo "ROS 2 Humble installation complete!"
echo "=========================================="
echo ""
echo "Next steps:"
echo "  1. Source ROS 2: source /opt/ros/humble/setup.bash"
echo "  2. Set up workspace: ./scripts/ros2/setup_workspace.sh"
echo "  3. Deploy packages: ./scripts/ros2/deploy_packages.sh"
echo "  4. Install dependencies: cd ~/zip_ros2_ws && rosdep install --from-paths src --ignore-src -r -y"
echo "  5. Build workspace: colcon build"
echo ""
