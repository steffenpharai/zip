# Native Migration Summary

Complete migration from Docker-based to native installation on Jetson Orin Nano 8GB.

## What Was Created

### Documentation
1. **NATIVE_INSTALLATION_GUIDE.md** - Comprehensive step-by-step installation guide
2. **NATIVE_QUICKSTART.md** - Quick reference for common tasks
3. **NATIVE_ENV_CONFIG.md** - Environment variable configuration reference
4. **NATIVE_MIGRATION_SUMMARY.md** - This file

### ROS 2 Package Files
1. **launch/vision_native.launch.py** - Native launch file for vision pipeline
2. **src/yoloe_ros_node.py** - Already exists, works natively (no changes needed)
3. **src/vision_diagnostics_bridge.py** - Already exists, works natively (no changes needed)
4. **config/yoloe_params.yaml** - Already exists, configured for native use

### Scripts
1. **scripts/native/export_yoloe_tensorrt.sh** - Downloads and exports YOLOE model to TensorRT
2. **scripts/native/install_systemd_services.sh** - Installs systemd service files
3. **scripts/native/verify_native_setup.sh** - Verifies complete setup

### Systemd Services
1. **scripts/native/systemd/zip-vision.service** - ROS 2 vision service
2. **scripts/native/systemd/zip-robot-bridge.service** - Robot bridge service
3. **scripts/native/systemd/zip-web.service** - Next.js web service

## Architecture Changes

### Before (Docker)
```
┌─────────────────┐
│  Docker Network │
│  ┌───────────┐  │
│  │vision-svc │  │ Port 8767
│  └───────────┘  │
│  ┌───────────┐  │
│  │robot-bridge│ │ Ports 8765/8766
│  └───────────┘  │
│  ┌───────────┐  │
│  │  zip-app  │  │ Port 3000
│  └───────────┘  │
└─────────────────┘
```

### After (Native)
```
┌─────────────────────────────────┐
│     Jetson Orin Nano 8GB        │
│  ┌───────────────────────────┐  │
│  │  systemd: zip-vision      │  │ Port 8767
│  │  (ROS 2 + YOLOE-11)      │  │
│  └───────────────────────────┘  │
│  ┌───────────────────────────┐  │
│  │  systemd: zip-robot-bridge│  │ Ports 8765/8766
│  └───────────────────────────┘  │
│  ┌───────────────────────────┐  │
│  │  systemd: zip-web         │  │ Port 3000
│  └───────────────────────────┘  │
└─────────────────────────────────┘
```

## Key Differences

| Aspect | Docker | Native |
|--------|--------|--------|
| **Base Image** | ultralytics/ultralytics:latest-jetson-jetpack6 | JetPack 6.x (host OS) |
| **ROS 2** | Containerized | Native installation |
| **Python** | Container environment | Virtual environment |
| **Process Management** | Docker Compose | systemd |
| **Network** | Docker bridge network | localhost |
| **Performance** | Container overhead | Direct execution |
| **Debugging** | Container logs | systemd journal |
| **Resource Usage** | Container limits | Direct system resources |

## Migration Checklist

### Prerequisites
- [ ] JetPack 6.x installed
- [ ] ROS 2 Humble installed natively
- [ ] Python 3.10+ virtual environment created
- [ ] Ultralytics installed with GPU support
- [ ] Camera accessible at `/dev/video0`
- [ ] Node.js 20.x installed

### Installation Steps
- [ ] Follow NATIVE_INSTALLATION_GUIDE.md
- [ ] Download and export YOLOE model
- [ ] Build ROS 2 workspace
- [ ] Install systemd services
- [ ] Update environment variables
- [ ] Build Next.js and robot bridge
- [ ] Start services

### Verification
- [ ] Run verification script
- [ ] Check ROS 2 topics
- [ ] Test API endpoints
- [ ] Verify frontend access
- [ ] Monitor performance

## File Locations

### ROS 2 Workspace
```
~/ros2_ws/
├── src/
│   └── zip_vision/
│       ├── models/
│       │   └── yoloe-11l-seg-pf.engine
│       ├── launch/
│       │   └── vision_native.launch.py
│       ├── src/
│       │   ├── yoloe_ros_node.py
│       │   └── vision_diagnostics_bridge.py
│       └── config/
│           └── yoloe_params.yaml
└── install/
    └── setup.bash
```

### Systemd Services
```
/etc/systemd/system/
├── zip-vision.service
├── zip-robot-bridge.service
└── zip-web.service
```

### Scripts
```
/home/steffen/Projects/Zip/scripts/native/
├── export_yoloe_tensorrt.sh
├── install_systemd_services.sh
├── verify_native_setup.sh
└── systemd/
    ├── zip-vision.service
    ├── zip-robot-bridge.service
    └── zip-web.service
```

### Documentation
```
/home/steffen/Projects/Zip/docs/ros2/
├── NATIVE_INSTALLATION_GUIDE.md
├── NATIVE_QUICKSTART.md
├── NATIVE_ENV_CONFIG.md
└── NATIVE_MIGRATION_SUMMARY.md
```

## Environment Variables

### Next.js (.env)
```bash
NEXT_PUBLIC_VISION_BRIDGE_URL=http://localhost:8767
VISION_BRIDGE_URL=http://localhost:8767
NEXT_PUBLIC_ROBOT_BRIDGE_WS_URL=ws://localhost:8765/robot
```

### ROS 2 (~/.bashrc)
```bash
export ROS_DOMAIN_ID=0
export ROS_DISTRO=humble
source /opt/ros/humble/setup.bash
source ~/zip_vision_env/bin/activate
source ~/ros2_ws/install/setup.bash
```

## Service Management

### Start Services
```bash
sudo systemctl start zip-vision.service
sudo systemctl start zip-robot-bridge.service
sudo systemctl start zip-web.service
```

### Stop Services
```bash
sudo systemctl stop zip-vision.service
sudo systemctl stop zip-robot-bridge.service
sudo systemctl stop zip-web.service
```

### Check Status
```bash
sudo systemctl status zip-vision.service
sudo systemctl status zip-robot-bridge.service
sudo systemctl status zip-web.service
```

### View Logs
```bash
journalctl -u zip-vision.service -f
journalctl -u zip-robot-bridge.service -f
journalctl -u zip-web.service -f
```

## Performance Expectations

### YOLOE-11L-seg-pf (416x416, FP16)
- **Inference Time**: ~14-20ms
- **FPS**: 50-70 FPS
- **GPU Memory**: ~500-700MB
- **Model Size**: ~26-32M parameters

### System Resources (Jetson Orin Nano 8GB)
- **Vision Service**: ~1.5-2.5GB RAM, 2-4 CPU cores
- **Robot Bridge**: ~128-512MB RAM, 0.25-1 CPU core
- **Web App**: ~512MB-2GB RAM, 0.5-2 CPU cores
- **Total**: ~2.5-5GB RAM, 3-7 CPU cores

## Troubleshooting

### Common Issues
1. **Services won't start**: Check logs with `journalctl -u <service> -n 50`
2. **No detections**: Lower confidence threshold, check camera feed
3. **Out of memory**: Use smaller model (M or S variant), reduce image size
4. **Port conflicts**: Check with `sudo netstat -tulpn | grep <port>`
5. **ROS 2 topics not visible**: Verify ROS_DOMAIN_ID matches

### Debug Commands
```bash
# Check ROS 2 topics
ros2 topic list
ros2 topic echo /detections --once

# Check GPU usage
sudo jetson_stats

# Check memory
free -h

# Check processes
ps aux | grep -E 'ros2|node|python'
```

## Next Steps

1. **Follow Installation Guide**: Start with NATIVE_INSTALLATION_GUIDE.md
2. **Verify Setup**: Run verification script
3. **Tune Performance**: Adjust model size, image size, confidence threshold
4. **Monitor Resources**: Use jtop or jetson_stats
5. **Enable Auto-start**: Services are already configured to start on boot

## Support

For detailed information:
- **Installation**: See NATIVE_INSTALLATION_GUIDE.md
- **Quick Reference**: See NATIVE_QUICKSTART.md
- **Configuration**: See NATIVE_ENV_CONFIG.md

## Benefits of Native Installation

1. **Performance**: No container overhead, direct GPU access
2. **Debugging**: Easier to debug with direct process access
3. **Resource Usage**: More efficient memory and CPU usage
4. **Simplicity**: No Docker daemon, simpler deployment
5. **Integration**: Better integration with system services

## Migration Complete

All files have been created and are ready for use. Follow the installation guide to complete the migration from Docker to native installation.
