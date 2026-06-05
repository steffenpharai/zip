#!/bin/bash
# Fix GPG Key Issue for ROS 2 Repository
# Run this to fix the GPG key problem

set -e

echo "=========================================="
echo "Fixing ROS 2 GPG Key"
echo "=========================================="

# Remove old key files
echo "Removing old GPG key files..."
sudo rm -f /etc/apt/trusted.gpg.d/ros-archive-keyring.gpg
sudo rm -f /usr/share/keyrings/ros-archive-keyring.gpg

# Download the key and convert to binary format
echo "Downloading and converting GPG key..."
curl -sSL https://raw.githubusercontent.com/ros/rosdistro/master/ros.asc | sudo gpg --batch --yes --dearmor -o /etc/apt/trusted.gpg.d/ros-archive-keyring.gpg

# Verify the key file
if [ -f /etc/apt/trusted.gpg.d/ros-archive-keyring.gpg ]; then
    echo "  ✓ GPG key file created"
    ls -lh /etc/apt/trusted.gpg.d/ros-archive-keyring.gpg
else
    echo "  ✗ Failed to create GPG key file"
    exit 1
fi

# Update the repository file to use the correct path
echo ""
echo "Updating repository configuration..."
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/trusted.gpg.d/ros-archive-keyring.gpg] http://packages.ros.org/ros2/ubuntu $(lsb_release -cs) main" | sudo tee /etc/apt/sources.list.d/ros2-latest.list > /dev/null
echo "  ✓ Repository file updated"

# Update package lists
echo ""
echo "Updating package lists..."
sudo apt update

echo ""
echo "=========================================="
echo "GPG key fixed! Try installing ROS 2 again."
echo "=========================================="
