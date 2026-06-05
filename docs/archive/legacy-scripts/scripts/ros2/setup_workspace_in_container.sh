#!/bin/bash
#
# Setup ROS 2 workspace inside container
# Builds all ROS 2 packages from ros2_packages directory
#

set -e

echo "Setting up ROS 2 workspace in container..."

# Source ROS 2 environment (jetson-containers uses /opt/ros/humble/install/setup.bash)
if [ -f "/opt/ros/humble/install/setup.bash" ]; then
    source /opt/ros/humble/install/setup.bash
    echo "Using ROS 2 Humble from /opt/ros/humble/install/setup.bash"
elif [ -f "/opt/ros/humble/setup.bash" ]; then
    source /opt/ros/humble/setup.bash
    echo "Using ROS 2 Humble from /opt/ros/humble/setup.bash"
elif [ -f "/opt/ros/jazzy/install/setup.bash" ]; then
    source /opt/ros/jazzy/install/setup.bash
    echo "Using ROS 2 Jazzy"
elif [ -d "/opt/ros" ]; then
    # Find any ROS 2 installation
    for distro in $(ls -1 /opt/ros); do
        if [ -f "/opt/ros/$distro/install/setup.bash" ]; then
            source /opt/ros/$distro/install/setup.bash
            echo "Using ROS 2 $distro from /opt/ros/$distro/install/setup.bash"
            break
        elif [ -f "/opt/ros/$distro/setup.bash" ]; then
            source /opt/ros/$distro/setup.bash
            echo "Using ROS 2 $distro from /opt/ros/$distro/setup.bash"
            break
        fi
    done
else
    echo "WARNING: ROS 2 not found in /opt/ros, skipping workspace build"
    exit 0
fi

# Create workspace structure
mkdir -p /workspace/src
mkdir -p /workspace/build
mkdir -p /workspace/install
mkdir -p /workspace/log

# Clean src directory first - remove workspace directories and any existing packages
echo "Preparing workspace src directory..."
rm -rf /workspace/src/build /workspace/src/install /workspace/src/log /workspace/src/ros2_packages 2>/dev/null || true

# Remove any existing package directories to ensure clean state
if [ -d "/workspace/src" ]; then
    for item in /workspace/src/*; do
        if [ -d "$item" ] && [ -f "$item/package.xml" ]; then
            pkg_name=$(basename "$item")
            echo "Removing existing package: $pkg_name"
            rm -rf "$item"
        fi
    done
fi

# Copy packages from ros2_packages to src (only package directories with package.xml)
if [ -d "/workspace/ros2_packages" ] && [ "$(ls -A /workspace/ros2_packages)" ]; then
    echo "Copying ROS 2 packages to workspace src..."
    for pkg in /workspace/ros2_packages/*; do
        if [ -d "$pkg" ] && [ -f "$pkg/package.xml" ]; then
            pkg_name=$(basename "$pkg")
            echo "  Copying $pkg_name..."
            cp -r "$pkg" /workspace/src/
        fi
    done
    echo "Packages copied to src"
else
    echo "No packages found in ros2_packages"
fi

# Final cleanup: ensure no workspace directories in src
rm -rf /workspace/src/build /workspace/src/install /workspace/src/log /workspace/src/ros2_packages 2>/dev/null || true

# Install dependencies
if [ -d "/workspace/src" ] && [ "$(ls -A /workspace/src)" ]; then
    echo "Installing ROS 2 dependencies..."
    cd /workspace
    rosdep update
    # Install dependencies, but skip missing ones (they may be installed via pip or already available)
    rosdep install --from-paths src --ignore-src -r -y --skip-keys="python3-serial python3-opencv" || true
    # Install Python dependencies via pip if needed
    pip3 install pyserial opencv-python-headless 2>/dev/null || true
fi

# Build workspace (ONLY from src directory, explicitly exclude ros2_packages)
if [ -d "/workspace/src" ] && [ "$(ls -A /workspace/src)" ]; then
    echo "Building ROS 2 workspace..."
    cd /workspace
    
    # Verify .colcon_ignore exists in ros2_packages to prevent colcon from scanning it
    if [ -d "/workspace/ros2_packages" ] && [ ! -f "/workspace/ros2_packages/.colcon_ignore" ]; then
        echo "Creating .colcon_ignore in ros2_packages..."
        echo "# Ignore this directory - packages are in src" > /workspace/ros2_packages/.colcon_ignore 2>/dev/null || \
        echo "WARNING: Could not create .colcon_ignore (ros2_packages may be read-only)"
    fi
    
    # Verify packages exist in src
    PKG_COUNT=0
    for item in /workspace/src/*; do
        if [ -d "$item" ] && [ -f "$item/package.xml" ]; then
            PKG_COUNT=$((PKG_COUNT + 1))
        fi
    done
    
    if [ $PKG_COUNT -gt 0 ]; then
        echo "Found $PKG_COUNT packages in src, building..."
        
        # Create .colcon_ignore in workspace root to exclude ros2_packages
        # This is the most reliable method since ros2_packages is read-only
        if [ -d "/workspace/ros2_packages" ]; then
            echo "ros2_packages" > /workspace/.colcon_ignore 2>/dev/null || \
            echo "WARNING: Could not create .colcon_ignore in workspace root"
            echo "Created .colcon_ignore in workspace root to exclude ros2_packages"
        fi
        
        # Also try to create .colcon_ignore in ros2_packages directory (may fail if read-only)
        if [ -d "/workspace/ros2_packages" ]; then
            echo "# Ignore this directory - packages are built from src" > /workspace/ros2_packages/.colcon_ignore 2>/dev/null || \
            echo "WARNING: Could not create .colcon_ignore in ros2_packages (read-only mount - this is OK)"
        fi
        
        # Temporarily rename CUDA compat directory to prevent linker from finding incomplete libraries
        CUDA_COMPAT_BACKUP=""
        if [ -d "/usr/local/cuda/compat" ]; then
            CUDA_COMPAT_BACKUP="/tmp/cuda_compat_backup_$$"
            echo "Temporarily renaming /usr/local/cuda/compat to prevent linker issues..."
            mv /usr/local/cuda/compat "$CUDA_COMPAT_BACKUP" 2>/dev/null || {
                echo "WARNING: Could not rename compat directory (may need sudo or read-only)"
                CUDA_COMPAT_BACKUP=""
            }
        fi
        
        # Build from workspace root - use --base-paths to only scan src directory
        echo "Building workspace (attempting with all components)..."
        echo "Build started at: $(date)" | tee /tmp/colcon_build.log
        
        # Use nohup to run build in background and prevent session timeouts
        # Use --base-paths src to tell colcon to only look in src directory (avoids duplicate error)
        # Also use parallel builds (2 workers) to speed up the process
        nohup bash -c "cd /workspace && colcon build --symlink-install --cmake-args -DCMAKE_BUILD_TYPE=Release --parallel-workers 2 --base-paths src >> /tmp/colcon_build.log 2>&1; echo 'BUILD_EXIT_CODE='\$? >> /tmp/colcon_build_status.txt" &
        BUILD_PID=$!
        echo "Build process started (PID: $BUILD_PID), logging to /tmp/colcon_build.log"
        echo "Monitor progress with: tail -f /tmp/colcon_build.log"
        
        # Wait for build with periodic progress updates (every 60 seconds)
        MAX_WAIT=7200  # 2 hours max
        ELAPSED=0
        while kill -0 $BUILD_PID 2>/dev/null && [ $ELAPSED -lt $MAX_WAIT ]; do
            sleep 60
            ELAPSED=$((ELAPSED + 60))
            echo "[$ELAPSED/$MAX_WAIT] Build still running... ($(date))" | tee -a /tmp/colcon_build_progress.log
            # Show last 3 lines of build log
            tail -3 /tmp/colcon_build.log 2>/dev/null | while read line; do
                echo "  > $line" | tee -a /tmp/colcon_build_progress.log
            done
        done
        
        # Check if build is still running
        if kill -0 $BUILD_PID 2>/dev/null; then
            echo "WARNING: Build still running after $MAX_WAIT seconds, but continuing to wait..."
            wait $BUILD_PID
        else
            wait $BUILD_PID
        fi
        
        # Get exit code from status file or wait result
        if [ -f /tmp/colcon_build_status.txt ]; then
            BUILD_EXIT_CODE=$(grep BUILD_EXIT_CODE /tmp/colcon_build_status.txt | cut -d= -f2)
        else
            BUILD_EXIT_CODE=$?
        fi
        
        echo "Build completed at: $(date), exit code: $BUILD_EXIT_CODE" | tee -a /tmp/colcon_build.log
        
        # Restore compat directory if we renamed it
        if [ -n "$CUDA_COMPAT_BACKUP" ] && [ -d "$CUDA_COMPAT_BACKUP" ]; then
            echo "Restoring /usr/local/cuda/compat directory..."
            mv "$CUDA_COMPAT_BACKUP" /usr/local/cuda/compat 2>/dev/null || true
        fi
        
        # If build failed due to zip_vision, try building without YOLO11 node
        if [ $BUILD_EXIT_CODE -ne 0 ]; then
            if grep -q "zip_vision.*Failed\|yolo11_node.*Error" /tmp/colcon_build.log 2>/dev/null; then
                echo "Build failed on zip_vision, retrying without YOLO11 node..."
                rm -rf /workspace/build/zip_vision /workspace/install/zip_vision /workspace/log/latest_build 2>/dev/null || true
                colcon build --symlink-install --cmake-args -DCMAKE_BUILD_TYPE=Release -DBUILD_YOLO11_NODE=OFF 2>&1 | tee /tmp/colcon_build_retry.log
                BUILD_EXIT_CODE=${PIPESTATUS[0]}
                if [ $BUILD_EXIT_CODE -eq 0 ]; then
                    echo "✅ Workspace built successfully (without YOLO11 node due to CUDA compat issues)"
                fi
            fi
        fi
        
        # Restore ros2_packages if we renamed it
        if [ -n "$ROS2_PKGS_BACKUP" ] && [ -d "$ROS2_PKGS_BACKUP" ]; then
            mv "$ROS2_PKGS_BACKUP" /workspace/ros2_packages 2>/dev/null || true
        fi
        
        if [ $BUILD_EXIT_CODE -eq 0 ] && [ -f install/setup.bash ]; then
            source install/setup.bash
            echo "✅ Workspace built successfully!"
        else
            echo "❌ Build failed or setup.bash not found (exit code: $BUILD_EXIT_CODE)"
            echo "Build log tail:"
            tail -30 /tmp/colcon_build*.log 2>/dev/null | tail -20 || echo "No build log available"
            exit 1
        fi
    else
        echo "❌ No valid packages found in src"
        exit 1
    fi
else
    echo "❌ No packages found in /workspace/src, skipping build"
    exit 1
fi
