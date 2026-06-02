# Docker Setup Summary - NVIDIA jetson-containers

## Overview

The ZIP Robot Docker setup has been refactored to use **NVIDIA jetson-containers** for optimal performance on Jetson Orin Nano. All services can now be started and stopped individually with hot reload support for rapid development.

## What Was Created

### Dockerfiles

1. **`Dockerfile.vision`** - Vision service using jetson-containers ROS 2 base
   - Base: `dustynv/ros:humble-desktop-l4t-r36.2.0`
   - Includes: ROS 2 Humble, CUDA, TensorRT, OpenCV
   - Supports: YOLO11 TensorRT, camera, diagnostics bridge

2. **`Dockerfile.app.dev`** - Next.js frontend development container
   - Base: Node.js 20-slim (ARM64)
   - Hot reload enabled
   - Development tools included

3. **`robot/bridge/zip-robot-bridge/Dockerfile.dev`** - Robot bridge container
   - Base: Node.js 20-slim (ARM64)
   - Hot reload enabled
   - Serial port support

### Docker Compose

**`docker-compose.dev.yml`** - Development configuration
- Three services: `zip-app`, `robot-bridge`, `vision-service`
- Individual service control
- Hot reload via volume mounts
- GPU support for vision service
- Camera device mounting

### Scripts

1. **`scripts/docker/vision-entrypoint.sh`** - Vision service entrypoint
   - Supports multiple service modes
   - Automatic workspace building
   - Flexible service management

2. **`scripts/ros2/setup_workspace_in_container.sh`** - ROS 2 workspace setup
   - Builds ROS 2 packages in container
   - Handles dependencies
   - Creates workspace structure

3. **`scripts/docker/setup-jetson-containers.sh`** - Setup automation
   - Installs jetson-containers tools
   - Verifies installation
   - Checks container availability

### Documentation

1. **`docs/docker/JETSON_CONTAINERS_SETUP.md`** - Complete setup guide
2. **`docs/docker/QUICKSTART.md`** - Quick start guide
3. **`docs/docker/CHANGELOG.md`** - Changes and migration notes

### Updated Files

- **`Makefile`** - New service management commands
- **`README.md`** - Updated Docker section

## Quick Start

```bash
# 1. Install jetson-containers
make setup:jetson-containers

# 2. Build all containers
make dev:build

# 3. Start all services
make dev

# Or start individually
make dev:app      # Frontend only
make dev:robot    # Robot bridge only
make dev:vision   # Vision service only
```

## Service Architecture

```
┌─────────────────┐         ┌──────────────────┐         ┌─────────────┐
│   ZIP App       │  HTTP   │  Robot Bridge     │ Serial  │   Robot     │
│  (Next.js)      │◄───────►│  (Node.js)       │◄───────►│  (Arduino)  │
│  Port: 3000     │  WS     │  WS: 8765        │         │  USB Serial │
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

## Key Features

### Individual Service Management

Each service can be started/stopped independently:
- Faster development cycles
- Test services in isolation
- Resource optimization

### Hot Reload

All services support hot reload:
- **Next.js**: Automatic rebuild on code changes
- **Robot Bridge**: TypeScript watch mode
- **Vision Service**: Python changes reload automatically (C++ requires rebuild)

### GPU Acceleration

Vision service uses GPU via NVIDIA Container Runtime:
- TensorRT acceleration for YOLO11
- CUDA support for image processing
- Optimized for Jetson Orin Nano

### jetson-containers Integration

- Pre-optimized ROS 2 images
- CUDA and TensorRT included
- Follows NVIDIA best practices
- Automatic image compatibility checking

## Configuration

### Environment Variables

Key variables in `.env`:
- `OPENAI_API_KEY` - Required for AI features
- `SERIAL_PORT` - Robot serial port
- `SERIAL_DEVICE` - Docker device mapping
- `VISION_SERVICE_MODE` - Vision service mode (vision-pipeline, diagnostics-bridge, both)
- `YOLO11_MODEL_PATH` - Path to TensorRT engine file

### Camera Configuration

Update camera device in `docker-compose.dev.yml`:
```yaml
volumes:
  - /dev/video0:/dev/video0  # Change to your camera
```

### Serial Port Configuration

Update serial device in `docker-compose.dev.yml`:
```yaml
devices:
  - /dev/ttyUSB0:/dev/ttyUSB0  # Change to your port
```

## Next Steps

1. **Read the Quick Start**: [QUICKSTART.md](QUICKSTART.md)
2. **Detailed Setup**: [JETSON_CONTAINERS_SETUP.md](JETSON_CONTAINERS_SETUP.md)
3. **Start Developing**: `make dev:app` or `make dev:vision`

## Troubleshooting

See [JETSON_CONTAINERS_SETUP.md](JETSON_CONTAINERS_SETUP.md#troubleshooting) for common issues and solutions.
