# Changelog

All notable changes to the ZIP Robot project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Comprehensive CONTRIBUTING.md guide
- CHANGELOG.md for version history tracking
- Documentation index in docs/README.md
- LICENSE file (MIT)

### Changed
- Improved repository organization and documentation structure

## [0.1.0] - 2025-01-18

### Added

#### Core Features
- **Realtime Voice Interface**: OpenAI Realtime WebRTC integration with barge-in support
- **AI Orchestration**: LangGraph-based intelligent request routing with research and workflow sub-graphs
- **Tool Ecosystem**: 39 tools with permission-based access control
- **Event-Driven Architecture**: Typed event bus for all UI state changes
- **Memory System**: User-controlled pinned memory with natural language commands
- **Observability**: Comprehensive tracing, audit logs, and request tracking

#### Robot Integration
- **Arduino Firmware**: Custom firmware for ELEGOO Smart Robot Car V4.0
  - TB6612FNG motor driver with safety layer
  - MPU6050 IMU integration (10Hz polling)
  - Ultrasonic, line sensors, battery monitoring
  - Memory-optimized (59% RAM usage)
- **WebSocket Bridge**: Node.js bridge server for robot communication
- **HUD Interface**: Real-time telemetry, motion control, sensor display

#### Vision System (Jetson Orin Nano)
- **YOLOE Object Detection**: YOLOE-v8L and YOLOE-11 Prompt-Free models
- **TensorRT Acceleration**: FP16 engines for optimal performance (~35-70 FPS)
- **Python ROS 2 Nodes**: Simplified implementation using Ultralytics API
- **Native Installation**: Direct GPU access, no Docker overhead
- **Vision Diagnostics Bridge**: HTTP API for status, detections, and visualization

#### Additional Capabilities
- **Document Intelligence**: PDF ingestion, vector search, and Q&A with citations
- **Web Research**: Automated research pipeline with source validation
- **Weather Service**: Real-time weather data with forecasts and air quality
- **Notes & Timers**: Full CRUD operations with server-side reminders
- **3D Printer Control**: Moonraker/Klipper integration (11 tools)
- **Security**: Permission-based tool access, input validation, audit logging

### Changed

#### Architecture
- **Docker Removal**: Migrated from Docker to native installation on Jetson Orin Nano
  - All Docker configuration files removed
  - Services now run as native systemd services
  - Better performance with direct GPU access
  - Simplified deployment and debugging

#### Vision System
- **YOLOE Migration**: Replaced YOLO11 references with YOLOE-specific paths
- **Python Implementation**: Replaced C++ with Python ROS nodes using Ultralytics API
- **Simplified Architecture**: Native Ultralytics postprocessing, no custom parsing

### Technical Details

#### Technology Stack
- **Frontend**: Next.js 16, React 19, TypeScript, Tailwind CSS, Three.js
- **Backend**: Next.js API Routes, OpenAI API, SQLite, Zod validation
- **AI**: LangGraph + LangChain, OpenAI Embeddings
- **Robot**: PlatformIO + Arduino, Node.js + TypeScript bridge
- **Vision**: ROS 2 Humble, YOLOE models, TensorRT, Ultralytics API

#### Service Management
- Systemd services for all components (zip-vision, zip-robot-bridge, zip-web)
- Makefile commands for service management
- Health check endpoints for all services

### Documentation
- Comprehensive README.md with architecture overview
- Agent guides for AI collaboration
- Installation guides for native setup
- API documentation
- Firmware protocol documentation

### Security
- Input validation with Zod schemas
- URL sanitization
- Rate limiting on API endpoints
- Audit logging for all tool executions
- Permission-based access control

---

## Version History

- **0.1.0** (2025-01-18): Initial release with core features

---

For detailed migration information, see:
- [Native Migration Summary](docs/ros2/NATIVE_MIGRATION_SUMMARY.md)
- [YOLOE Migration Complete](YOLOE_MIGRATION_COMPLETE.md)
- [Docker Removal Summary](docs/ros2/NATIVE_MIGRATION_SUMMARY.md)
