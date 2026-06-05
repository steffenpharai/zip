# ZIP Robot Documentation

Welcome to the ZIP Robot documentation! This index helps you navigate all available documentation.

## 📚 Documentation Index

### Getting Started

- **[README.md](../README.md)** - Project overview and quick start
- **[AGENT_GUIDE.md](../AGENT_GUIDE.md)** - Quick reference for AI agents
- **[CONTRIBUTING.md](../CONTRIBUTING.md)** - Contribution guidelines
- **[CHANGELOG.md](../CHANGELOG.md)** - Version history

### Agent Documentation

For AI agents working on this project:

- **[Agent Onboarding](agents/README.md)** - Getting started guide
- **[Architecture Guide](agents/architecture.md)** - System architecture details
- **[Development Workflow](agents/development-workflow.md)** - How to work on tasks

### Installation & Setup

#### Native Installation (Jetson Orin Nano)

- **[Native Installation Guide](ros2/NATIVE_INSTALLATION_GUIDE.md)** - Complete installation guide
- **[Native Quick Start](ros2/NATIVE_QUICKSTART.md)** - Quick reference for native setup
- **[Environment Configuration](ros2/NATIVE_ENV_CONFIG.md)** - Environment variable setup
- **[Native Migration Summary](ros2/NATIVE_MIGRATION_SUMMARY.md)** - Migration from Docker to native

#### Local Development

- **[Local Startup Guide](../LOCAL_STARTUP_GUIDE.md)** - Local development setup
- **[Troubleshooting Localhost](../TROUBLESHOOTING_LOCALHOST.md)** - Common local issues

### ROS 2 & Vision System

#### Core Documentation

- **[ROS 2 README](ros2/README.md)** - ROS 2 integration overview
- **[Vision Diagnostics Quick Start](ros2/VISION_DIAGNOSTICS_QUICKSTART.md)** - Quick start for vision system
- **[Vision Diagnostics Setup](ros2/VISION_DIAGNOSTICS_SETUP.md)** - Detailed setup guide
- **[Vision Diagnostics Integration](ros2/VISION_DIAGNOSTICS_INTEGRATION.md)** - Integration details

#### Installation & Configuration

- **[Installation Instructions](ros2/INSTALLATION_INSTRUCTIONS.md)** - ROS 2 installation
- **[Camera Driver Fix](ros2/CAMERA_DRIVER_FIX.md)** - Camera setup troubleshooting
- **[CH340 Driver Installation](ros2/CH340_DRIVER_INSTALLATION.md)** - Serial driver setup
- **[Shield Switch Configuration](ros2/SHIELD_SWITCH_CONFIGURATION.md)** - Hardware configuration

#### Phase Documentation

- **[Phase 1 Setup (Humble Native)](ros2/PHASE1_SETUP_HUMBLE_NATIVE.md)** - Phase 1 native setup
- **[Phase 1 Summary](ros2/PHASE1_SUMMARY.md)** - Phase 1 overview
- **[Phase 2 Complete](ros2/PHASE2_COMPLETE.md)** - Phase 2 completion
- **[Phase 2 Serial Bridge](ros2/PHASE2_SERIAL_BRIDGE.md)** - Serial bridge setup
- **[Phase 3 Complete](ros2/PHASE3_COMPLETE.md)** - Phase 3 completion
- **[Phase 3 Vision Native](ros2/PHASE3_VISION_NATIVE.md)** - Vision system native setup
- **[Phase 3 YOLOE TensorRT Integration](ros2/PHASE3_YOLO11_TENSORRT_INTEGRATION.md)** - TensorRT setup (Note: Document references YOLO11 but system uses YOLOE)

#### Technical Details

- **[YOLOE Full Vocabulary Implementation](ros2/YOLOE_FULL_VOCABULARY_IMPLEMENTATION.md)** - YOLOE model details
- **[Current Status](ros2/CURRENT_STATUS.md)** - Current system status
- **[Documentation Index](ros2/DOCUMENTATION_INDEX.md)** - ROS 2 docs index
- **[Documentation Update Summary](ros2/DOCUMENTATION_UPDATE_SUMMARY.md)** - Recent doc updates

### Docker (Historical - Archived)

**Note**: Docker has been completely removed in favor of native installation. Historical Docker documentation has been archived in `docs/archive/docker/` for reference only.

### Robot Hardware

- **[Robot Firmware](../robot/firmware/zip_robot_uno/README.md)** - Arduino firmware documentation
- **[Robot Bridge](../robot/bridge/zip-robot-bridge/README.md)** - WebSocket bridge server
- **[Motion Control](../robot/ELEGOO_MOTION_CONTROL.md)** - Motion system details
- **[ESP32-CAM](../robot/firmware/zip_esp32_cam/README.md)** - Camera module firmware

### Verification & Testing

- **[Weather & Location Verification](../WEATHER_LOCATION_VERIFICATION.md)** - Weather service testing
- **[Vision Stream Fix](VISION_STREAM_FIX.md)** - Vision stream troubleshooting

### Archive

Historical status reports and migration documents are archived in `docs/archive/`:

- Migration summaries
- Build status reports
- Test results
- Phase completion reports

## 🗂️ Documentation Structure

```
docs/
├── README.md (this file)
├── agents/          # AI agent documentation
├── ros2/            # ROS 2 and vision system docs
├── docker/          # Docker docs (historical)
└── archive/         # Historical status reports
```

## 📖 Quick Links

### For New Contributors
1. Start with [README.md](../README.md)
2. Read [CONTRIBUTING.md](../CONTRIBUTING.md)
3. Check [Agent Onboarding](agents/README.md) if you're an AI agent

### For Developers
1. [Architecture Guide](agents/architecture.md)
2. [Development Workflow](agents/development-workflow.md)
3. [ROS 2 README](ros2/README.md)

### For Setup
1. **Jetson Orin Nano**: [Native Installation Guide](ros2/NATIVE_INSTALLATION_GUIDE.md)
2. **Local Development**: [Local Startup Guide](../LOCAL_STARTUP_GUIDE.md)
3. **Vision System**: [Vision Diagnostics Quick Start](ros2/VISION_DIAGNOSTICS_QUICKSTART.md)

## 🔍 Finding Documentation

- **Installation issues?** → Check [ros2/](ros2/) for setup guides
- **Agent questions?** → See [agents/](agents/)
- **Architecture questions?** → Read [agents/architecture.md](agents/architecture.md)
- **Historical context?** → Check [archive/](archive/) for old reports

## 📝 Documentation Standards

- All documentation should be clear, concise, and up-to-date
- Include code examples where helpful
- Link to related documentation
- Keep installation guides current with latest versions
- Archive outdated status reports rather than deleting them

---

**Last Updated**: 2025-01-18
