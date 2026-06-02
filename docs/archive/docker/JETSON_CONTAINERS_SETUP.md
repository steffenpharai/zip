# NVIDIA jetson-containers Setup Guide

This guide explains how to use NVIDIA jetson-containers for the ZIP Robot Docker setup, providing optimized ROS 2 and AI/ML containers for Jetson Orin Nano.

## Overview

The ZIP Robot uses NVIDIA jetson-containers to provide:
- **ROS 2 Humble Desktop** container with CUDA and TensorRT support
- **Optimized for Jetson Orin Nano** with GPU acceleration
- **YOLO11 TensorRT** integration for real-time object detection
- **Hot reload support** for rapid development

## Prerequisites

- Jetson Orin Nano 8GB (or compatible Jetson device)
- JetPack 6.x (includes CUDA, TensorRT)
- Docker installed and configured
- NVIDIA Container Runtime configured

## Quick Start

### 1. Install jetson-containers

```bash
make setup:jetson-containers
```

Or manually:
```bash
git clone https://github.com/dusty-nv/jetson-containers.git
cd jetson-containers
bash install.sh
```

### 2. Verify Installation

```bash
jetson-containers --version
autotag ros:humble-desktop
```

### 3. Build and Start Services

```bash
# Build all containers
make dev:build

# Start all services
make dev

# Or start individually
make dev:app      # Next.js frontend
make dev:robot    # Robot bridge
make dev:vision   # Vision service (ROS 2 + YOLO11)
```

## Service Architecture

```
┌─────────────────┐         ┌──────────────────┐         ┌─────────────┐
│   ZIP App       │  HTTP   │  Robot Bridge     │ Serial  │   Robot     │
│  (Next.js)      │◄───────►│  (Node.js)       │◄───────►│  (Arduino)  │
│  Port: 3000     │  WS     │  WS: 8765        │         │  USB Serial │
│                 │         │  HTTP: 8766      │         │             │
└─────────────────┘         └──────────────────┘         └─────────────┘
         │
         │ HTTP
         ▼
┌─────────────────┐
│ Vision Service   │
│ (ROS 2 + YOLO11) │
│ HTTP: 8767       │
│ Camera: /dev/video0│
└─────────────────┘
```

## Services

### 1. zip-app (Next.js Frontend)

- **Image**: `zip-app:dev`
- **Port**: 3000
- **Hot Reload**: Yes (via volume mounts)
- **Base**: Node.js 20-slim (ARM64)

**Start individually:**
```bash
make dev:app
```

### 2. robot-bridge (Robot Communication)

- **Image**: `robot-bridge:dev`
- **Ports**: 8765 (WebSocket), 8766 (HTTP)
- **Hot Reload**: Yes (via volume mounts)
- **Base**: Node.js 20-slim (ARM64)

**Start individually:**
```bash
make dev:robot
```

### 3. vision-service (ROS 2 + YOLO11)

- **Image**: `vision-service:dev`
- **Base**: `dustynv/ros:humble-desktop-l4t-r36.2.0` (jetson-containers)
- **Port**: 8767 (HTTP diagnostics bridge)
- **GPU**: Required (TensorRT acceleration)
- **Camera**: `/dev/video0` (mounted from host)

**Start individually:**
```bash
make dev:vision
```

**Service Modes:**
- `vision-pipeline`: Camera + YOLO11 detection
- `diagnostics-bridge`: HTTP API bridge only
- `both`: Both services (default)

Set via environment variable:
```bash
VISION_SERVICE_MODE=vision-pipeline make dev:vision
```

## Configuration

### Environment Variables

Create `.env` file (copy from `example-env`):
```bash
cp example-env .env
```

Key variables:
- `OPENAI_API_KEY`: Required for AI features
- `SERIAL_PORT`: Robot serial port (default: `/dev/ttyUSB0`)
- `SERIAL_DEVICE`: Docker device mapping (default: `/dev/ttyUSB0`)
- `ROS_DOMAIN_ID`: ROS 2 domain (default: 0)
- `VISION_SERVICE_MODE`: Vision service mode (default: `both`)
- `YOLO11_MODEL_PATH`: Path to TensorRT engine file

### Camera Configuration

Update `docker-compose.dev.yml` to match your camera device:
```yaml
volumes:
  - /dev/video0:/dev/video0  # Change to your camera device
```

### Serial Port Configuration

For Jetson Orin Nano, typically `/dev/ttyUSB0` or `/dev/ttyACM0`:
```yaml
devices:
  - /dev/ttyUSB0:/dev/ttyUSB0  # Adjust for your system
```

## Development Workflow

### Hot Reload

All services support hot reload via volume mounts:
- **Next.js**: Code changes trigger automatic rebuild
- **Robot Bridge**: TypeScript changes trigger automatic rebuild
- **Vision Service**: Python changes trigger automatic reload (C++ requires rebuild)

### Rebuilding Containers

```bash
# Rebuild all
make dev:build

# Rebuild specific service
docker-compose -f docker-compose.dev.yml build zip-app
docker-compose -f docker-compose.dev.yml build robot-bridge
docker-compose -f docker-compose.dev.yml build vision-service
```

### Viewing Logs

```bash
# All services
make dev:logs

# Specific service
make dev:logs SERVICE=vision-service
```

### Accessing Containers

```bash
# Shell into container
make dev:shell SERVICE=vision-service

# Or directly
docker-compose -f docker-compose.dev.yml exec vision-service bash
```

## jetson-containers Base Images

The vision service uses jetson-containers ROS 2 base image:
- **Image**: `dustynv/ros:humble-desktop-l4t-r36.2.0`
- **Includes**: ROS 2 Humble, CUDA, TensorRT, OpenCV
- **Optimized**: For Jetson Orin Nano with GPU acceleration

### Finding Compatible Images

```bash
# List available ROS 2 images
jetson-containers list | grep ros

# Find compatible image for your JetPack version
autotag ros:humble-desktop
```

### Custom Base Image

To use a different base image, set in `docker-compose.dev.yml`:
```yaml
build:
  args:
    BASE_IMAGE: dustynv/ros:humble-desktop-l4t-r36.2.0
```

Or via environment variable:
```bash
JETSON_CONTAINERS_ROS_IMAGE=dustynv/ros:humble-desktop-l4t-r36.4.0 make dev:build
```

## Troubleshooting

### Container Build Fails

1. **Check JetPack version compatibility:**
   ```bash
   cat /etc/nv_tegra_release
   ```

2. **Verify jetson-containers installation:**
   ```bash
   jetson-containers --version
   autotag ros:humble-desktop
   ```

3. **Check Docker GPU access:**
   ```bash
   docker run --rm --gpus all nvidia/cuda:12.0.0-base-ubuntu22.04 nvidia-smi
   ```

### Vision Service Not Starting

1. **Check GPU access:**
   ```bash
   docker-compose -f docker-compose.dev.yml exec vision-service nvidia-smi
   ```

2. **Verify camera device:**
   ```bash
   ls -l /dev/video*
   ```

3. **Check ROS 2 workspace:**
   ```bash
   docker-compose -f docker-compose.dev.yml exec vision-service bash
   source /opt/ros/humble/setup.bash
   ros2 pkg list | grep zip
   ```

### Serial Port Issues

1. **Check device permissions:**
   ```bash
   ls -l /dev/ttyUSB0
   sudo chmod 666 /dev/ttyUSB0
   ```

2. **Verify device mapping in docker-compose:**
   ```yaml
   devices:
     - /dev/ttyUSB0:/dev/ttyUSB0
   ```

## Production Deployment

For production, use `docker-compose.prod.yml`:
```bash
make prod:build
make prod:up
```

Production images:
- Optimized builds (no dev dependencies)
- No volume mounts (code baked into image)
- Resource limits configured
- Health checks enabled

## Resources

- [jetson-containers GitHub](https://github.com/dusty-nv/jetson-containers)
- [jetson-containers Documentation](https://github.com/dusty-nv/jetson-containers#readme)
- [ROS 2 Humble Documentation](https://docs.ros.org/en/humble/)
- [NVIDIA Jetson Documentation](https://developer.nvidia.com/embedded/jetson-linux)
