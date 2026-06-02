# Docker Setup Changelog

## 2025-01-XX - NVIDIA jetson-containers Integration

### Added

- **NVIDIA jetson-containers integration** for ROS 2 and vision services
  - Vision service now uses `dustynv/ros:humble-desktop` base image
  - Optimized for Jetson Orin Nano with GPU acceleration
  - Includes CUDA, TensorRT, and ROS 2 Humble pre-configured

- **Individual service management**
  - `make dev:app` - Start only Next.js frontend
  - `make dev:robot` - Start only robot bridge
  - `make dev:vision` - Start only vision service
  - All services can be started/stopped independently

- **New Dockerfiles**
  - `Dockerfile.vision` - Vision service with jetson-containers base
  - `Dockerfile.app.dev` - Next.js app development container
  - `robot/bridge/zip-robot-bridge/Dockerfile.dev` - Robot bridge container

- **New docker-compose configuration**
  - `docker-compose.dev.yml` - Development setup with hot reload
  - Individual service control
  - GPU support for vision service
  - Camera device mounting

- **Setup scripts**
  - `scripts/docker/setup-jetson-containers.sh` - Automated jetson-containers installation
  - `scripts/docker/vision-entrypoint.sh` - Flexible vision service entrypoint
  - `scripts/ros2/setup_workspace_in_container.sh` - ROS 2 workspace setup in container

- **Documentation**
  - `docs/docker/JETSON_CONTAINERS_SETUP.md` - Complete setup guide
  - `docs/docker/QUICKSTART.md` - Quick start guide

### Changed

- **Makefile** updated with new service management commands
  - `make setup:jetson-containers` - Install jetson-containers tools
  - Individual service start/stop commands
  - Enhanced health checks for all services

- **Development workflow**
  - Hot reload now works for all services
  - Volume mounts for source code (no rebuild needed for most changes)
  - Better separation of concerns between services

### Benefits

1. **Performance**: GPU-accelerated vision processing with TensorRT
2. **Flexibility**: Start/stop services individually for faster development
3. **Optimization**: jetson-containers provides pre-optimized ROS 2 images
4. **Hot Reload**: All services support hot reload for rapid iteration
5. **Best Practices**: Follows NVIDIA recommended patterns for Jetson development

### Migration Notes

If you were using the old `docker-compose.yml`:
- Use `docker-compose.dev.yml` for development
- Run `make setup:jetson-containers` first
- Update `.env` with any new variables
- Camera device may need adjustment in `docker-compose.dev.yml`
