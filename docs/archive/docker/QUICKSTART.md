# Docker Quick Start Guide

Quick start guide for running ZIP Robot services in Docker using NVIDIA jetson-containers.

## Prerequisites

- Jetson Orin Nano 8GB with JetPack 6.x
- Docker and NVIDIA Container Runtime installed
- `.env` file configured (copy from `example-env`)

## One-Command Setup

```bash
# Install jetson-containers and build all services
make setup:jetson-containers && make dev:build
```

## Start Services

### Start All Services

```bash
make dev
```

This starts:
- **zip-app** (Next.js) on port 3000
- **robot-bridge** (WebSocket) on ports 8765/8766
- **vision-service** (ROS 2 + YOLO11) on port 8767

### Start Individual Services

```bash
# Frontend only
make dev:app

# Robot bridge only
make dev:robot

# Vision service only
make dev:vision
```

## Access Services

- **Frontend**: http://localhost:3000
- **Robot Bridge Health**: http://localhost:8766/health
- **Vision Diagnostics**: http://localhost:8767/api/vision/status

## Development Workflow

### Hot Reload

All services support hot reload:
- Edit code in your editor
- Changes automatically reflected in container
- No rebuild needed for most changes

### View Logs

```bash
# All services
make dev:logs

# Specific service
make dev:logs SERVICE=vision-service
```

### Rebuild After Dependency Changes

```bash
# Rebuild all
make dev:build

# Rebuild specific service
docker-compose -f docker-compose.dev.yml build zip-app
```

### Stop Services

```bash
# Stop all
docker-compose -f docker-compose.dev.yml down

# Stop specific service
docker-compose -f docker-compose.dev.yml stop zip-app
```

## Configuration

### Camera Device

If your camera is not `/dev/video0`, update `docker-compose.dev.yml`:

```yaml
vision-service:
  volumes:
    - /dev/video1:/dev/video0  # Change to your camera
```

### Serial Port

If your robot is on a different serial port, update `docker-compose.dev.yml`:

```yaml
robot-bridge:
  devices:
    - /dev/ttyACM0:/dev/ttyUSB0  # Change to your port
```

Or set environment variable:
```bash
SERIAL_DEVICE=/dev/ttyACM0 make dev:robot
```

## Troubleshooting

### Container Won't Start

```bash
# Check logs
make dev:logs

# Check health
make health
```

### Vision Service GPU Issues

```bash
# Verify GPU access
docker-compose -f docker-compose.dev.yml exec vision-service nvidia-smi
```

### Serial Port Permission Denied

```bash
# Fix permissions
sudo chmod 666 /dev/ttyUSB0
```

## Next Steps

- See [JETSON_CONTAINERS_SETUP.md](JETSON_CONTAINERS_SETUP.md) for detailed setup
- See [README.md](../docker/README.md) for architecture details
