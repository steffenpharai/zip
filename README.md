# ZIP Robot

ZIP is an AI-powered robot built on the ELEGOO Smart Robot Car V4.0 platform, featuring voice control, computer vision, and autonomous capabilities through a Jarvis-style HUD interface. The system runs on NVIDIA Jetson Orin Nano with direct USB connection to the Arduino-based robot.

## Overview

ZIP is a comprehensive AI-powered robot system that combines cutting-edge hardware, intelligent software, and advanced AI capabilities into a unified platform. Built on the ELEGOO Smart Robot Car V4.0 with NVIDIA Jetson Orin Nano, ZIP delivers a production-grade Jarvis-style assistant experience with real-time voice control, computer vision, and autonomous capabilities.

### Core Platform

**Hardware Stack:**
- **NVIDIA Jetson Orin Nano 8GB** - Main computing platform with GPU acceleration
- **ELEGOO Smart Robot Car V4.0** - Robot base with Arduino UNO R3 and SmartCar Shield
- **Direct USB Connection** - USB-A to USB-B cable for reliable serial communication
- **USB Camera** - Connected directly to Jetson for vision processing

**Software Architecture:**
- **Next.js 16 HUD** - Modern web interface with React 19 and real-time updates
- **ROS 2 Humble** - Native robotics framework for vision and control
- **WebSocket Bridge** - Real-time bidirectional communication layer
- **Custom Arduino Firmware** - Optimized motion control and sensor management

### Key Capabilities

**🎤 Voice-First Interaction**
- OpenAI Realtime WebRTC for low-latency voice control with barge-in support
- Natural language understanding for robot commands and general queries
- Multi-modal interaction supporting voice, text chat, and vision analysis

**🤖 Intelligent AI Orchestration**
- LangGraph-based brain system with intelligent request routing
- Research sub-graph for complex queries requiring web search and synthesis
- Workflow sub-graph for multi-step task execution
- 39 tools with permission-based access control (READ/WRITE/ACT/ADMIN)

**👁️ Advanced Computer Vision**
- YOLOE object detection (YOLOE-v8L or YOLOE-11 Prompt-Free models)
- TensorRT FP16 acceleration achieving 35-70 FPS inference
- Real-time object detection with bounding boxes and confidence scores
- HTTP diagnostics bridge for vision status and visualization

**🤖 Robot Control & Telemetry**
- Real-time motion control with velocity/turn rate commands
- Live sensor telemetry (ultrasonic, line sensors, IMU, battery)
- Safety layer with battery-aware operation and emergency stop
- Motion streaming with rate limiting and TTL enforcement

**🧠 Memory & Context Management**
- User-controlled pinned memory with natural language commands
- SQLite-based persistent storage for notes, documents, and memories
- Automatic context inclusion in AI conversations
- Full CRUD operations for notes and server-side timer reminders

**📚 Document Intelligence**
- PDF ingestion with vector search capabilities
- Semantic search across document collections
- Q&A with citations and source references
- Document management and organization

**🌐 Web Research & Information**
- Automated research pipeline with source validation
- Web search with citation tracking
- URL content extraction and summarization
- Multi-source synthesis with credibility assessment

**🖨️ 3D Printer Integration**
- Moonraker/Klipper printer control (11 tools)
- Print job management and monitoring
- Temperature and motion control
- File management and print queue

**🌤️ Weather & Location Services**
- Real-time weather data with forecasts
- Air quality monitoring
- W3C Geolocation API integration
- Standards-compliant production-ready implementation

**🔒 Security & Observability**
- Permission-based tool access with user confirmation for ACT-tier operations
- Comprehensive input validation using Zod schemas
- Audit logging for all tool executions
- Request-scoped tracing for debugging
- Rate limiting on all API endpoints

**⚡ Performance & Reliability**
- Event-driven architecture with typed event bus
- Native installation on Jetson (no Docker overhead)
- Direct GPU access for optimal vision performance
- Systemd service management for production deployment
- Health monitoring and automatic recovery

### Technical Highlights

- **Type-Safe**: Full TypeScript with strict mode and Zod validation
- **Production-Ready**: Comprehensive error handling, logging, and observability
- **Extensible**: Plugin-based tool system with easy addition of new capabilities
- **AI-Optimized**: Designed for AI agent collaboration with clear patterns and documentation
- **Open Source**: MIT licensed with comprehensive contribution guidelines

```
┌─────────────────────────────────────────────────────────────────┐
│                    Jetson Orin Nano                              │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                    ZIP HUD                               │   │
│  │         (Next.js + OpenAI Realtime Voice)               │   │
│  │              http://localhost:3000                       │   │
│  └───────────────────────┬─────────────────────────────────┘   │
│                          │ WebSocket                            │
│  ┌───────────────────────▼─────────────────────────────────┐   │
│  │                  Robot Bridge                             │   │
│  │              ws://localhost:8765/robot                    │   │
│  │         (WebSocket ↔ Serial Translation)                 │   │
│  └───────────────────────┬─────────────────────────────────┘   │
│                          │ USB Serial (115200 baud)             │
└──────────────────────────┼───────────────────────────────────────┘
                           │ USB-A to USB-B Cable
┌──────────────────────────▼───────────────────────────────────────┐
│              ELEGOO Smart Robot Car V4.0                         │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │              Arduino UNO R3 + SmartCar Shield             │   │
│  │         Motors • Sensors • Servos • IMU                   │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

## Features

### Robot Hardware
- **ELEGOO Smart Robot Car V4.0** base platform
- **Arduino UNO R3** with SmartCar-Shield-v1.1
- **TB6612FNG** dual H-bridge motor driver
- **MPU6050** IMU for orientation sensing
- **Ultrasonic sensor** for distance measurement
- **Line tracking sensors** for navigation
- **Servo-mounted sensor head** for scanning
- **USB-A to USB-B cable** connecting Arduino to Jetson Orin Nano

### HUD Interface
- **🎤 Realtime Voice Interface**: Low-latency voice control via OpenAI Realtime WebRTC with barge-in support
- **🤖 AI Orchestration**: Intelligent request routing with research and workflow sub-graphs
- **💬 Multi-Modal Interaction**: Voice, text chat, and vision (webcam analysis) support
- **🧠 Memory System**: User-controlled pinned memory with natural language commands
- **📊 Real-time Telemetry**: Motor states, sensor readings, battery voltage
- **🎮 Motion Control**: Velocity/turn rate joystick and presets
- **📡 Sensor Display**: Live ultrasonic, line sensor, and IMU data
- **🔌 Serial Console**: Direct firmware communication

### Vision System (Jetson Orin Nano)
- **🔍 YOLOE Object Detection**: YOLOE-v8L or YOLOE-11 Prompt-Free models with TensorRT FP16 acceleration
- **🐍 Python ROS 2 Nodes**: Simplified Python implementation using Ultralytics API (replaced C++ implementation)
- **⚡ High Performance**: ~35-70 FPS inference (depending on model and input size)
- **📹 Camera Integration**: USB camera connected directly to Jetson Orin Nano via v4l2_camera_node
- **🌐 HTTP Diagnostics Bridge**: REST API for vision status, detections, and visualization
- **🔧 Native Installation**: Runs natively on Jetson Orin Nano (Docker removed for better performance)
- **🔌 Direct Hardware Access**: USB camera and Arduino connected directly to Jetson (no ESP32 or wireless modules)

### Additional Capabilities
- **📚 Document Intelligence**: PDF ingestion, vector search, and Q&A with citations
- **🌐 Web Research**: Automated research pipeline with source validation and citations
- **🌤️ Weather Service**: Real-time weather data with forecasts and air quality using W3C Geolocation API, Open-Meteo, and Nominatim (production-ready, standards-compliant)
- **📝 Notes & Timers**: Full CRUD operations for notes and server-side timer reminders
- **🖨️ 3D Printer Control**: Moonraker/Klipper printer integration (11 tools)
- **🔒 Security**: Permission-based tool access, input validation, and audit logging
- **📊 Observability**: Comprehensive tracing, audit logs, and request tracking

## Documentation

### Quick Links

- **[Documentation Index](docs/README.md)** - Complete documentation index
- **[Agent Guide](AGENT_GUIDE.md)** - Quick reference for AI agents
- **[Contributing](CONTRIBUTING.md)** - Contribution guidelines
- **[Changelog](CHANGELOG.md)** - Version history
- **[Security Policy](.github/SECURITY.md)** - Security reporting and best practices

### Getting Started

| Document | Description |
|----------|-------------|
| [Native Installation Guide](docs/ros2/NATIVE_INSTALLATION_GUIDE.md) | Complete native installation on Jetson Orin Nano |
| [Native Quick Start](docs/ros2/NATIVE_QUICKSTART.md) | Quick reference for native setup |
| [Local Startup Guide](LOCAL_STARTUP_GUIDE.md) | Local development setup |
| [Troubleshooting Localhost](TROUBLESHOOTING_LOCALHOST.md) | Common local development issues |

### Robot Hardware

| Document | Description |
|----------|-------------|
| [Robot Firmware](robot/firmware/zip_robot_uno/README.md) | Arduino firmware documentation |
| [Robot Bridge](robot/bridge/zip-robot-bridge/README.md) | WebSocket bridge server |
| [Motion Control](robot/ELEGOO_MOTION_CONTROL.md) | Motion system details |
| [Shield Switch Configuration](docs/ros2/SHIELD_SWITCH_CONFIGURATION.md) | ELEGOO shield USB serial configuration |

### For AI Agents

| Document | Description |
|----------|-------------|
| [Agent Onboarding](docs/agents/README.md) | Getting started for agents |
| [Architecture Guide](docs/agents/architecture.md) | System architecture details |
| [Development Workflow](docs/agents/development-workflow.md) | How to work on tasks |

### Verification & Testing

| Document | Description |
|----------|-------------|
| [Weather & Location Verification](WEATHER_LOCATION_VERIFICATION.md) | Weather service verification and testing guide |

For complete documentation, see the [Documentation Index](docs/README.md).

## Recent Major Updates

### ✅ Docker Removal & Native Migration (January 2025)
- **Docker completely removed**: All Docker configuration files deleted
- **Native installation only**: Services now run as native systemd services on Jetson Orin Nano
- **Better performance**: Direct GPU access, no container overhead
- **Simplified deployment**: No Docker daemon required, easier debugging
- **Service management**: Use `make` commands or systemctl for service control

### ✅ YOLOE Vision System Migration
- **YOLOE-v8L support**: 51.5M parameter model with 37-feature output format
- **YOLOE-11 Prompt-Free**: Lighter models (~26-32M params) with 84-feature output
- **Python implementation**: Replaced C++ with Python ROS nodes using Ultralytics API
- **Simplified architecture**: Native Ultralytics postprocessing, no custom parsing needed
- **TensorRT acceleration**: FP16 engines for optimal performance on Jetson
- **Performance**: ~35-70 FPS inference depending on model and input size

### ✅ ROS 2 Integration
- **ROS 2 Humble**: Native installation on Jetson Orin Nano
- **Python ROS nodes**: `yoloe_ros_node.py` for object detection
- **Vision diagnostics bridge**: HTTP API for frontend integration
- **Systemd services**: All services managed via systemd

For detailed migration information, see:
- [Native Migration Summary](docs/ros2/NATIVE_MIGRATION_SUMMARY.md)
- [YOLOE Migration Complete](docs/archive/YOLOE_MIGRATION_COMPLETE.md) (archived)
- Historical migration reports are available in [docs/archive/](docs/archive/)

## Quick Start

### Prerequisites

- **Jetson Orin Nano 8GB** with ROS 2 Humble installed
- **ELEGOO Smart Robot Car V4.0** with Arduino UNO
- **USB-A to USB-B cable** connecting Jetson to Arduino
- **USB camera** connected to Jetson for vision
- **ELEGOO shield switch** set to **UPLOAD/COM position**

### 1. Flash the Robot Firmware

```bash
cd robot/firmware/zip_robot_uno
pio run -t upload
```

**Important**: Ensure the ELEGOO shield switch is in **UPLOAD/COM position** before uploading firmware.

### 2. Start the Bridge Server

```bash
cd robot/bridge/zip-robot-bridge
npm install
npm run dev
```

The bridge will auto-detect the Arduino on `/dev/ttyUSB0` (or `COMx` on Windows).

### 3. Start the HUD

```bash
npm install
cp .env.example .env
# Add your OPENAI_API_KEY to .env
npm run dev
```

### 4. Open the HUD

Navigate to [http://localhost:3000](http://localhost:3000)

### 5. Start Vision System (Jetson Orin Nano)

```bash
# Start vision service
sudo systemctl start zip-vision.service

# Or use Makefile
make start
```

For complete setup instructions, see [Native Installation Guide](docs/ros2/NATIVE_INSTALLATION_GUIDE.md).

## Local Development

ZIP can be run as multiple independent services locally. This setup is useful for development and debugging.

### Prerequisites

- Node.js 18+
- PlatformIO (for firmware)
- npm or yarn
- `.env` file configured (see [Environment Variables](#environment-variables))
- Serial port available or `LOOPBACK_MODE=true` for testing

### Service Architecture

1. **zip-app** (Next.js HUD application)
   - Port: 3000
   - Health: `GET /api/health`
   - Hot reloading in development

2. **robot-bridge** (Robot communication bridge)
   - WebSocket: 8765
   - HTTP: 8766
   - Health: `GET /health`
   - Serial port access for robot communication

3. **zip-robot-firmware** (Arduino firmware)
   - Serial: 115200 baud
   - Protocol: ELEGOO-style JSON

### Running Services

**Recommended: Use the startup script (handles all prerequisites and common issues):**
```bash
# Start all services
./scripts/start-local.sh all --fix-permissions

# Or start individually
./scripts/start-local.sh frontend --fix-permissions
./scripts/start-local.sh bridge

# Check status
./scripts/start-local.sh status

# Stop all services
./scripts/start-local.sh stop
```

**Manual startup (if you prefer):**

**Terminal 1 - ZIP HUD:**
```bash
npm run dev:local
```

**Terminal 2 - Robot Bridge:**
```bash
npm run dev:bridge
```

**Firmware - Upload once:**
```bash
cd robot/firmware/zip_robot_uno
pio run -t upload
```

### Available Scripts

#### Startup Script

| Command | Description |
|--------|-------------|
| `./scripts/start-local.sh all` | Start both frontend and bridge services |
| `./scripts/start-local.sh frontend` | Start only the Next.js frontend |
| `./scripts/start-local.sh bridge` | Start only the robot bridge |
| `./scripts/start-local.sh status` | Show status of all services |
| `./scripts/start-local.sh stop` | Stop all services |
| `./scripts/start-local.sh all --fix-permissions` | Start services and fix .next directory permissions |

#### ZIP HUD (Root Directory)

| Script | Description |
|--------|-------------|
| `npm run dev:local` | Start ZIP HUD in development mode |
| `npm run dev:bridge` | Start robot bridge in development mode |
| `npm run build:local` | Build ZIP HUD for production |
| `npm run build:bridge` | Build robot bridge for production |
| `npm run test:local` | Run full test suite |
| `npm run test:health` | Health check both services |
| `npm run test:integration` | Integration tests between services |
| `npm run typecheck` | TypeScript type checking |
| `npm run lint` | Run ESLint |
| `npm run test:e2e` | Run Playwright E2E tests |

#### Robot Bridge (`robot/bridge/zip-robot-bridge/`)

| Script | Description |
|--------|-------------|
| `npm run dev:local` | Development mode with hot reload |
| `npm run build:local` | Production build |
| `npm start` | Run production build |
| `npm run test:health` | Health check endpoint test |
| `npm run test:integration` | Integration tests |

## Native Installation (Jetson Orin Nano)

ZIP runs natively on Jetson Orin Nano 8GB with ROS 2 Humble and YOLOE vision system. All services run as native processes managed by systemd. **Docker has been completely removed** - the project now uses native installation only for better performance and simpler deployment.

### Quick Start

**First-time setup:**
```bash
# Follow the comprehensive installation guide
cat docs/ros2/NATIVE_INSTALLATION_GUIDE.md

# Or use the quick start guide
cat docs/ros2/NATIVE_QUICKSTART.md
```

**Installation steps:**
1. Install ROS 2 Humble natively
2. Setup Python virtual environment with Ultralytics
3. Download and export YOLOE model to TensorRT (YOLOE-v8L or YOLOE-11 Prompt-Free)
4. Build ROS 2 workspace
5. Install systemd services
6. Configure environment variables

**Note**: The project has migrated from Docker to native installation. All Docker configuration files have been removed. Services are managed via systemd and the Makefile.

### Services

The native setup includes:

1. **zip-web** (Next.js application)
   - Port: 3000
   - Health: `GET /api/health`
   - Managed by: `systemd` (zip-web.service)
   - Runs natively on host

2. **zip-robot-bridge** (Robot communication bridge)
   - WebSocket: 8765
   - HTTP: 8766
   - Health: `GET /health`
   - Serial port access for robot communication
   - Managed by: `systemd` (zip-robot-bridge.service)
   - Runs natively on host

3. **zip-vision** (ROS 2 + YOLOE TensorRT)
   - HTTP: 8767 (diagnostics bridge)
   - Camera: `/dev/video0`
   - GPU: Required (TensorRT acceleration)
   - Model: YOLOE-v8L or YOLOE-11 Prompt-Free (Python + Ultralytics API)
   - Managed by: `systemd` (zip-vision.service)
   - Runs natively with ROS 2 Humble

### Service Management

**Using Makefile (recommended):**
```bash
# Start all services
make start

# Stop all services
make stop

# Restart all services
make restart

# Check status of all services
make status

# View logs (all services)
make logs

# View logs for specific service
make logs SERVICE=zip-vision

# Check health of all services
make health

# Install systemd services (first time setup)
make install:services
```

**Using systemctl directly:**
```bash
# Start services
sudo systemctl start zip-vision.service
sudo systemctl start zip-robot-bridge.service
sudo systemctl start zip-web.service

# Check status
sudo systemctl status zip-vision.service
sudo systemctl status zip-robot-bridge.service
sudo systemctl status zip-web.service

# View logs
journalctl -u zip-vision.service -f
journalctl -u zip-robot-bridge.service -f
journalctl -u zip-web.service -f

# Enable auto-start on boot
sudo systemctl enable zip-vision.service
sudo systemctl enable zip-robot-bridge.service
sudo systemctl enable zip-web.service
```

### Serial Port Configuration

The Arduino UNO connects to Jetson Orin Nano via USB-A to USB-B cable. The ELEGOO shield switch must be set to **UPLOAD/COM position** for USB serial communication.

**Linux (Jetson Orin Nano):**
```bash
# Add user to dialout group for serial port access
sudo usermod -a -G dialout $USER
# Log out and back in for changes to take effect

# Verify USB serial device is detected
ls -la /dev/ttyUSB0

# Check shield switch is in UPLOAD/COM position (not CAM position)
```

**Testing without hardware:**
Set `LOOPBACK_MODE=true` in `.env` to enable loopback mode (no physical robot required).

For detailed native installation documentation, see:
- [Native Installation Guide](docs/ros2/NATIVE_INSTALLATION_GUIDE.md)
- [Native Quick Start](docs/ros2/NATIVE_QUICKSTART.md)
- [Environment Configuration](docs/ros2/NATIVE_ENV_CONFIG.md)

## Architecture Overview

### Event-Driven Architecture

ZIP uses a typed event bus system where all UI state changes flow through events:

```
User Input → Event Bus → State Reducer → UI Updates
                ↓
         Tool Executor → OpenAI API → Tool Results → Panel Updates
                ↓
         Robot Bridge → Serial → Firmware → Motors/Sensors
```

### Core Systems

| System | Location | Description |
|--------|----------|-------------|
| Event Bus | `lib/events/` | Typed event system for all UI state changes |
| State Machine | `lib/state/hudStore.ts` | HUD reducer managing Zip states |
| Tool Registry | `lib/tools/registry.ts` | Whitelisted tools with Zod schemas |
| Tool Executor | `lib/tools/executor.ts` | Executor with permissions, audit, tracing |
| AI Orchestration | `lib/orchestrators/brain.ts` | LangGraph-based orchestration system |
| Robot Client | `lib/robot/` | WebSocket client for robot communication |
| Memory | `lib/memory/` | SQLite-based pinned memory |
| Observability | `lib/observability/` | Tracing and audit logging |

### OpenAI Integration

ZIP uses a two-model approach:

1. **Realtime Model** (`OPENAI_REALTIME_MODEL`): Low-latency voice interactions via WebRTC
2. **Responses Model** (`OPENAI_RESPONSES_MODEL`): Stronger reasoning for planning and tool calling

#### Realtime WebRTC

- **Endpoint**: `/api/realtime/token` - Returns ephemeral token for WebRTC connection
- **Bridge Endpoint**: `/api/realtime/bridge` - Bridges voice to AI orchestration
- **Client Hook**: `hooks/useRealtime.ts` - Manages WebRTC connection
- **State Mapping**: Realtime states → Zip states (LISTENING/THINKING/SPEAKING/TOOL_RUNNING)
- **Barge-in**: User can interrupt Zip while speaking
- **Fallback**: STT/TTS pipeline if Realtime unavailable

#### Responses API

- **Endpoint**: `/api/agent` - Main chat endpoint with tool calling
- **AI Brain Orchestration**: All requests route through `lib/orchestrators/brain.ts`
- **Intelligent Routing**: Automatically routes to research, workflow, or direct tool calling
- **Multi-Step Loops**: Supports up to 10 iterations of tool calling
- **Memory Integration**: Pinned memory automatically included in system prompt

## Tool Registry

### Permission Tiers

| Tier | Description | Confirmation |
|------|-------------|--------------|
| READ | Safe read-only operations | None |
| WRITE | Data modification | None |
| ACT | Physical actions or external effects | Required |
| ADMIN | Administrative operations | Reserved |

### Robot Tools (7 tools)

| Tool | Tier | Description |
|------|------|-------------|
| `get_robot_status` | READ | Connection status and bridge state |
| `get_robot_diagnostics` | READ | Motor states, reset count, serial stats |
| `get_robot_sensors` | READ | Ultrasonic, line sensors, battery voltage |
| `robot_move` | ACT | Move with velocity and turn rate |
| `robot_stop` | ACT | Emergency stop |
| `robot_stream_start` | ACT | Start continuous motion streaming |
| `robot_stream_stop` | ACT | Stop motion streaming |

### 3D Printer Tools (11 tools)

| Tool | Tier | Description |
|------|------|-------------|
| `get_printer_status` | READ | Comprehensive printer status |
| `get_printer_temperature` | READ | Hotend and bed temperatures |
| `get_print_progress` | READ | Current print job progress |
| `list_printer_files` | READ | G-code files on printer |
| `start_print` | ACT | Start printing a G-code file |
| `pause_print` | ACT | Pause current print |
| `resume_print` | ACT | Resume paused print |
| `cancel_print` | ACT | Cancel current print |
| `set_temperature` | ACT | Set hotend or bed temperature |
| `home_axes` | ACT | Home specified axes |
| `move_axis` | ACT | Move a specific axis |

### System & Info Tools

| Tool | Tier | Description |
|------|------|-------------|
| `get_system_stats` | READ | CPU, RAM, Disk usage |
| `get_weather` | READ | Weather with forecast and air quality (requires browser geolocation) |
| `get_uptime` | READ | System uptime and session stats |

### Web & Research Tools

| Tool | Tier | Description |
|------|------|-------------|
| `web_search` | READ | Search the web for current information |
| `fetch_url` | READ | Fetch and extract content from URLs |
| `summarize_sources` | READ | Summarize multiple sources with citations |

### Document Tools

| Tool | Tier | Description |
|------|------|-------------|
| `ingest_document` | WRITE | Ingest PDFs and text documents |
| `doc_search` | READ | Vector search across documents |
| `doc_answer` | READ | Answer questions from documents |

### Notes & Timers

| Tool | Tier | Description |
|------|------|-------------|
| `create_note` | WRITE | Create a new note |
| `list_notes` | READ | List all notes |
| `search_notes` | READ | Search notes by content |
| `delete_note` | WRITE | Delete a note |
| `create_timer` | ACT | Create a timer with reminder |
| `cancel_timer` | ACT | Cancel a timer |

### Vision & Camera

| Tool | Tier | Description |
|------|------|-------------|
| `analyze_image` | READ | Analyze images using vision AI |
| `set_camera_enabled` | ACT | Toggle camera state |
| `open_url` | ACT | Open URL in browser (requires confirmation) |

**Note**: On Jetson Orin Nano, the vision system runs as a separate ROS 2 service with YOLOE object detection. Access the vision diagnostics interface at `http://localhost:3000/vision-diagnostics`.

## Firmware Protocol

The firmware uses ELEGOO-style JSON protocol over serial (115200 baud):

```json
{"N":<command>,"H":"<tag>","D1":<val>,"D2":<val>,"T":<ttl>}
```

### Commands

| N | Command | Parameters | Response | Description |
|---|---------|------------|----------|-------------|
| 0 | Hello | H=tag | `{<tag>_ok}` | Handshake/ping |
| 21 | Read Ultrasonic | H=tag | `{<tag>_<cm>}` | Distance in cm |
| 22 | Read Line Sensors | H=tag | `{<tag>_L_M_R}` | Line sensor values |
| 23 | Read Battery | H=tag | `{<tag>_<mV>}` | Battery voltage |
| 120 | Diagnostics | H=tag | Multi-line | Debug state dump |
| 200 | Setpoint | D1=v, D2=w, T=ttl | (none) | Streaming motion |
| 201 | Stop | H=tag | `{<tag>_ok}` | Immediate stop |
| 210 | Macro Start | D1=id, H=tag | `{<tag>_ok}` | Start macro |
| 211 | Macro Cancel | H=tag | `{<tag>_ok}` | Cancel macro |
| 300 | Servo | D1=angle, H=tag | `{<tag>_ok}` | Set servo angle |
| 999 | Direct Motor | D1=L, D2=R, H=tag | `{<tag>_ok}` | Raw PWM control |

See [robot/firmware/zip_robot_uno/README.md](robot/firmware/zip_robot_uno/README.md) for full protocol documentation.

## API Endpoints

### Agent & Chat
- `POST /api/agent` - Main agent endpoint with tool calling

### Realtime Voice
- `GET /api/realtime/token` - Get ephemeral token for WebRTC
- `POST /api/realtime/bridge` - Bridge voice to orchestration

### Voice Fallback
- `POST /api/voice/transcribe` - STT using Whisper
- `POST /api/voice/speak` - TTS synthesis

### Memory
- `GET /api/memory/get` - Get memories
- `POST /api/memory/add` - Add memory
- `DELETE /api/memory/delete` - Delete memory

### Notes
- `POST /api/notes/create` - Create note
- `GET /api/notes/list` - List notes
- `POST /api/notes/search` - Search notes
- `DELETE /api/notes/delete` - Delete note

### Timers
- `POST /api/timers/create` - Create timer
- `DELETE /api/timers/cancel` - Cancel timer

### Tools
- `POST /api/tools/web_search` - Web search
- `POST /api/tools/fetch_url` - Fetch URL content
- `POST /api/tools/vision` - Analyze image
- `POST /api/tools/docs/ingest` - Ingest document
- `POST /api/tools/docs/search` - Search documents
- `POST /api/tools/docs/answer` - Answer from documents

### Vision (Jetson Orin Nano - Native)
- `GET /api/vision/detections` - Get latest object detections (proxies to vision bridge)
- `GET /api/vision/status` - Get vision service status and statistics
- `GET /api/vision/visualization` - Get visualization image with bounding boxes
- `GET /api/vision/camera` - Get raw camera image
- `GET /api/vision/diagnostics` - Combined diagnostics endpoint

**Note**: Vision endpoints proxy to the ROS 2 vision diagnostics bridge running on port 8767. The vision system must be running as a systemd service (`zip-vision.service`).

All endpoints support rate limiting and return JSON responses with proper error handling.

## Environment Variables

### Required

| Variable | Description |
|----------|-------------|
| `OPENAI_API_KEY` | OpenAI API key for voice and AI features |

### Robot Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `NEXT_PUBLIC_ROBOT_BRIDGE_WS_URL` | `ws://localhost:8765/robot` | Bridge WebSocket URL (native: localhost) |
| `SERIAL_PORT` | auto-detect | Serial port (COM5, /dev/ttyUSB0) - USB connection to Arduino |
| `SERIAL_BAUD` | `115200` | Serial baud rate |
| `LOOPBACK_MODE` | `false` | Test mode without hardware |

### Vision Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `NEXT_PUBLIC_VISION_BRIDGE_URL` | `http://localhost:8767` | Vision diagnostics bridge URL (native: localhost) |
| `VISION_BRIDGE_URL` | `http://localhost:8767` | Vision bridge URL for API routes (native: localhost) |

### OpenAI Models

| Variable | Default | Description |
|----------|---------|-------------|
| `OPENAI_REALTIME_MODEL` | `gpt-4o-realtime-preview-2024-12-17` | Realtime voice model |
| `OPENAI_RESPONSES_MODEL` | `gpt-4o` | Chat/reasoning model |
| `OPENAI_VISION_MODEL` | `gpt-4o` | Vision API model |
| `OPENAI_TTS_MODEL` | `gpt-4o-mini-tts-2025-12-15` | TTS model |
| `OPENAI_STT_MODEL` | `whisper-1` | STT model |
| `OPENAI_EMBEDDING_MODEL` | `text-embedding-3-small` | Embedding model |

### HUD Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `ZIP_REALTIME_ENABLED` | `true` | Enable Realtime WebRTC |
| `ZIP_VOICE_FALLBACK_ENABLED` | `true` | Enable STT/TTS fallback |
| `ZIP_UPDATE_INTERVAL_MS` | `2000` | Panel update interval |
| `PRINTER_API_URL` | `http://169.254.178.90` | 3D printer API URL |

## Project Structure

```
zip/
├── robot/                      # Robot integration
│   ├── firmware/
│   │   ├── zip_robot_uno/      # Arduino UNO firmware
│   │   │   ├── src/            # Source files
│   │   │   ├── include/        # Headers
│   │   │   ├── tools/          # Test utilities
│   │   │   └── README.md       # Firmware documentation
│   │   └── zip_esp32_cam/      # ESP32-CAM firmware (legacy, not used - vision via Jetson USB camera)
│   ├── bridge/
│   │   └── zip-robot-bridge/   # WebSocket-to-Serial bridge
│   │       ├── src/            # Bridge source
│   │       └── README.md       # Bridge documentation
│   └── tools/                  # Testing and diagnostic utilities
├── app/                        # Next.js HUD application
│   ├── api/                    # API routes
│   │   ├── agent/              # Main agent endpoint
│   │   ├── realtime/           # Realtime endpoints
│   │   ├── voice/              # Voice fallback endpoints
│   │   ├── memory/             # Memory endpoints
│   │   ├── notes/              # Notes endpoints
│   │   ├── timers/             # Timer endpoints
│   │   └── tools/              # Tool endpoints
│   ├── (hud)/                  # Main HUD page
│   └── robot/                  # Robot control page
├── components/                 # React components
│   ├── hud/                    # HUD-specific components
│   │   ├── TopBar.tsx          # Top navigation bar
│   │   ├── LeftRail.tsx        # Left panel rail
│   │   ├── RightChat.tsx       # Chat interface
│   │   ├── CenterCore.tsx      # Center display
│   │   └── panels/             # Panel components
│   └── robot/                  # Robot control components
│       ├── ConnectionStatus.tsx
│       ├── MotionControl.tsx
│       ├── MotorGauges.tsx
│       ├── SensorDisplay.tsx
│       ├── SerialConsole.tsx
│       └── ServoControl.tsx
├── hooks/                      # React hooks
│   ├── useChat.ts              # Chat hook
│   ├── useRealtime.ts          # Realtime hook
│   ├── useRobot.ts             # Robot bridge hook
│   ├── usePanelUpdates.ts      # Panel update hook
│   └── useTTS.ts               # TTS fallback hook
├── lib/                        # Core libraries
│   ├── robot/                  # Robot client
│   │   ├── client.ts           # Browser WebSocket client
│   │   ├── server-client.ts    # Server-side HTTP client
│   │   ├── wifi-client.ts      # Direct WiFi client
│   │   └── types.ts            # Robot type definitions
│   ├── events/                 # Event bus system
│   ├── orchestrators/          # AI orchestration
│   │   ├── brain.ts            # Main orchestration graph
│   │   ├── nodes/              # Orchestration nodes
│   │   └── utils/              # Utilities
│   ├── tools/                  # Tool registry and executor
│   │   ├── registry.ts         # Tool registry
│   │   ├── executor.ts         # Tool executor
│   │   └── implementations/    # Tool implementations
│   ├── memory/                 # Memory management
│   ├── observability/          # Tracing and audit
│   ├── openai/                 # OpenAI integration
│   └── voice/                  # Voice system
├── scripts/                    # Utility scripts
├── docs/                       # Documentation
│   ├── agents/                 # Agent guides
│   └── ros2/                   # ROS 2 and native installation guides
└── data/                       # Runtime data (auto-created)
    ├── audit.log               # Audit logs
    ├── traces/                 # Trace files
    ├── memory.db               # Memory database
    ├── notes.db                # Notes database
    └── docs.db                 # Documents database
```

## Hardware Setup

### Components

**Robot Platform:**
- ELEGOO Smart Robot Car V4.0 kit
- Arduino UNO R3
- SmartCar-Shield-v1.1 (TB6612FNG motor driver)
- HC-SR04 ultrasonic sensor
- SG90 servo for sensor head
- MPU6050 IMU module

**Jetson Orin Nano Setup:**
- NVIDIA Jetson Orin Nano 8GB
- USB-A to USB-B cable (connects Jetson to Arduino)
- USB camera (connected directly to Jetson for vision)
- ELEGOO shield switch set to **UPLOAD/COM position** for USB serial communication

### Wiring

The firmware is configured for the standard ELEGOO shield pinout:

| Component | Pins |
|-----------|------|
| Left Motor | D5 (PWM), D8/D9 (DIR) |
| Right Motor | D6 (PWM), D10/D11 (DIR) |
| Motor Standby | D3 |
| Ultrasonic | D13 (Trig), D12 (Echo) |
| Servo | D10 |
| Line Sensors | A0, A1, A2 |
| Battery | A3 |
| I2C (IMU) | A4 (SDA), A5 (SCL) |

See [robot/firmware/zip_robot_uno/README.md](robot/firmware/zip_robot_uno/README.md) for detailed pin mapping.

## Testing

### Firmware Tests

```bash
cd robot/firmware/zip_robot_uno/tools

# Motor bringup test
node serial_motor_bringup.js COM5

# Hardware smoke test
node hardware_smoke.js COM5

# Motion-only test (safe 0.5ft radius)
node serial_motor_bringup.js COM5 --motion-only
```

### Bridge Tests

```bash
cd robot/bridge/zip-robot-bridge

# Health check
npm run test:health

# Integration tests
npm run test:integration
```

### HUD Tests

```bash
# E2E tests
npm run test:e2e

# Type checking
npm run typecheck

# Orchestration tests
npx tsx scripts/test-api-orchestration.ts

# Brain integration tests
npx tsx scripts/test-brain-integration.ts

# Voice fallback tests
npx tsx scripts/test-voice-fallback.ts

# Eval harness (20 test prompts)
npx tsx scripts/eval-harness.ts
```

## Security

### API Key Protection
- All OpenAI API calls are server-side
- Realtime token endpoint uses server-side WebSocket proxy

### Tool Security
- Tool execution strictly whitelisted via registry
- Input/output validation using Zod schemas
- Permission-based access control (READ/WRITE/ACT/ADMIN)
- User confirmation required for ACT-tier tools
- URL and file path sanitization

### Rate Limiting
- In-memory rate limiter for all endpoints
- Default: 100 requests/minute per IP

### Audit & Tracing
- Every tool call logged to `./data/audit.log`
- Request-scoped tracing in `./data/traces/`
- Request IDs and step IDs for debugging

## Development Status

**Version**: 0.1.0

### Robot - Completed
- ✅ Arduino firmware with motion control
- ✅ WebSocket bridge server
- ✅ HUD with real-time telemetry
- ✅ Voice control integration
- ✅ AI tool orchestration for robot commands
- ✅ Sensor reading and display
- ✅ IMU integration (MPU6050)
- ✅ Servo control
- ✅ Drive safety layer (battery-aware, deadband, ramping)

### Robot - In Development
- 🔄 Autonomous navigation modes
- 🔄 Path planning and mapping
- 🔄 Advanced sensor fusion

### HUD - Completed
- ✅ Voice and text interaction
- ✅ 39 tools with permission-based access
- ✅ AI orchestration with intelligent routing (LangGraph)
- ✅ MCP integration for ROS 2 tool execution (Phase 4)
- ✅ 3D printer integration (Moonraker/Klipper)
- ✅ Document intelligence with vector search
- ✅ Web research with citations
- ✅ Memory system
- ✅ Audit logging and tracing
- ✅ Native installation on Jetson Orin Nano (Docker removed)
- ✅ ROS 2 Humble integration
- ✅ YOLOE vision system with TensorRT (YOLOE-v8L and YOLOE-11 Prompt-Free)
- ✅ Python-based vision nodes using Ultralytics API (simplified from C++)
- ✅ Systemd service management

## Technology Stack

**Robot:**
- PlatformIO + Arduino framework
- ELEGOO Smart Robot Car V4.0
- TB6612FNG motor driver
- MPU6050 IMU
- USB-A to USB-B serial connection to Jetson Orin Nano

**Bridge:**
- Node.js + TypeScript
- WebSocket (ws)
- SerialPort

**HUD Frontend:**
- Next.js 16, React 19, TypeScript
- Tailwind CSS
- Three.js + React Three Fiber
- Framer Motion

**HUD Backend:**
- Next.js API Routes
- OpenAI API (Realtime, Responses, Vision, TTS, STT, Embeddings)
- SQLite (better-sqlite3)
- Zod validation

**AI & Orchestration:**
- LangGraph + LangChain
- OpenAI Embeddings
- Semantic similarity search

**Vision System (Jetson Orin Nano):**
- ROS 2 Humble (native installation)
- YOLOE-v8L or YOLOE-11 Prompt-Free models
- Ultralytics YOLO11 API (Python)
- TensorRT FP16 acceleration
- Python ROS 2 nodes (yoloe_ros_node.py)
- Vision diagnostics bridge (HTTP API on port 8767)

**Orchestration (Phase 4):**
- Model Context Protocol (MCP) server
- FastMCP Python SDK (industry standard)
- HTTP/SSE transport for Next.js integration
- ROS 2 tool execution via MCP
- Systemd service (zip-mcp.service on port 8769)

## Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for detailed guidelines.

### Quick Start for Contributors

1. Read [CONTRIBUTING.md](CONTRIBUTING.md)
2. Fork the repository and create a feature branch
3. Follow patterns in `.cursorrules`
4. Run `npm run typecheck` and `npm run lint`
5. Submit a pull request

### For AI Agents

This project is optimized for AI agent collaboration:

- **[Agent Guide](AGENT_GUIDE.md)** - Quick reference
- **[Agent Onboarding](docs/agents/README.md)** - Getting started
- **[GitHub Copilot Instructions](.github/copilot-instructions.md)** - Copilot guide
- **Issue Templates** - `.github/ISSUE_TEMPLATE/`

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
