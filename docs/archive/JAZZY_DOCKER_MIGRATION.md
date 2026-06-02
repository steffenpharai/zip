# Migration from Humble Native to Jazzy Docker

This document describes the migration from native ROS 2 Humble installation to ROS 2 Jazzy in Docker.

## Why Docker?

- **ROS 2 Jazzy requires Ubuntu 24.04**, but Jetson runs Ubuntu 22.04
- **Docker provides isolation** without affecting host system
- **Near-native performance** with NVIDIA Container Toolkit (<5% overhead)
- **GPU acceleration** fully supported
- **Easy cleanup** - just remove container

## Migration Steps

### 1. Stop Native ROS 2 (if running)

```bash
# No need to uninstall, just stop using it
# Remove from ~/.bashrc if added:
# source /opt/ros/humble/setup.bash
```

### 2. Install NVIDIA Container Toolkit

```bash
sudo apt-get update
sudo apt-get install -y nvidia-container-toolkit
sudo systemctl restart docker
```

### 3. Start ROS 2 Jazzy Container

```bash
cd /home/zip/Zip/zip
docker-compose -f docker-compose.ros2.jazzy.yml up -d
```

### 4. Migrate Workspace

The workspace at `~/zip_ros2_ws` is shared between native and Docker, so packages are already there. Just rebuild in container:

```bash
./scripts/ros2/setup_jazzy_docker.sh
```

### 5. Update Scripts/Workflows

All scripts now use Docker:
- `docker_jazzy_jetson.sh` - Start container
- `setup_jazzy_docker.sh` - Complete setup
- `continue_setup.sh` - Works with Docker

## Key Differences

### Native (Humble)
```bash
source /opt/ros/humble/setup.bash
cd ~/zip_ros2_ws
colcon build
```

### Docker (Jazzy)
```bash
docker exec -it ros2-jazzy bash
source /opt/ros/jazzy/setup.bash
cd /ros2_ws
colcon build
```

## Performance Comparison

| Metric | Native Humble | Docker Jazzy |
|--------|---------------|--------------|
| CPU Overhead | 0% | 1-5% |
| GPU Overhead | 0% | 0-3% |
| ROS 2 Latency | Baseline | +1-2ms |
| Memory | Baseline | +100-500MB |
| Setup Time | ~20 min | ~5 min (pull image) |

## Benefits of Docker Approach

1. **Latest ROS 2**: Jazzy instead of Humble
2. **Isolation**: Doesn't affect host system
3. **Reproducibility**: Same environment everywhere
4. **Easy Updates**: Just pull new image
5. **Multiple Versions**: Can run different ROS 2 versions

## Troubleshooting

### Container won't start
- Check Docker: `sudo systemctl status docker`
- Check NVIDIA runtime: `docker info | grep nvidia`
- Check image: `docker images | grep jazzy`

### GPU not accessible
- Verify NVIDIA Container Toolkit: `nvidia-container-runtime --version`
- Test GPU: `docker exec ros2-jazzy nvidia-smi`

### Workspace issues
- Workspace is shared: `~/zip_ros2_ws` on host = `/ros2_ws` in container
- Rebuild in container: `docker exec ros2-jazzy bash -c "cd /ros2_ws && colcon build"`

## Next Steps

Continue with Phase 2+ using Docker container. All subsequent phases will work the same way, just inside the container.
