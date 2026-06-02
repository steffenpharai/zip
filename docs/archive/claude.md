# ZIP Robot Project - Baseline Documentation

**Generated**: 2026-01-11
**Purpose**: Comprehensive baseline reference for AI assistants and developers working with the ZIP robot project.

---

## Table of Contents

1. [Project Overview](#project-overview)
2. [Repository Structure](#repository-structure)
3. [Quick Start Commands](#quick-start-commands)
4. [Architecture](#architecture)
5. [Development Patterns](#development-patterns)
6. [Tool System](#tool-system)
7. [Robot System](#robot-system)
8. [Key Technologies](#key-technologies)
9. [File Index](#file-index)
10. [Security & Best Practices](#security--best-practices)

---

## Project Overview

**ZIP** is a production-grade AI-powered robot system featuring a Jarvis-style HUD interface. It combines hardware control, voice AI, and intelligent orchestration into a cohesive platform.

### Core Components

1. **HUD Application** (Next.js 16 + React 19)
   - Voice-controlled AI assistant (OpenAI Realtime WebRTC)
   - Intelligent orchestration via LangGraph
   - 39+ tools spanning robot control, web research, document intelligence, system utilities
   - Real-time 3D visualization with Three.js
   - Type-safe event-driven architecture

2. **Robot Bridge** (Node.js + TypeScript)
   - WebSocket-to-Serial translation layer
   - FIFO reply matching for command/response correlation
   - Setpoint streaming with rate limiting
   - Health monitoring and loopback testing mode

3. **Robot Firmware** (Arduino UNO + PlatformIO)
   - Custom firmware for ELEGOO Smart Robot Car V4.0
   - TB6612FNG motor driver with safety layer
   - MPU6050 IMU (10Hz polling)
   - Ultrasonic, line sensors, battery monitoring
   - Memory-optimized (59% RAM usage, 1208/2048 bytes)

### Project Goals

- **Production-Ready**: Type-safe, secure, observable, testable
- **Voice-First**: Natural language control via OpenAI Realtime API
- **Intelligent**: Context-aware AI orchestration with multi-step reasoning
- **Extensible**: Plugin-based tool system with permission tiers
- **Hardware Integration**: Seamless robot control through voice commands

---

## Repository Structure

```
/home/zip/Zip/zip/
├── app/                        # Next.js App Router
│   ├── api/                    # API endpoints (25+ routes)
│   │   ├── agent/              # Main AI orchestration
│   │   ├── realtime/           # WebRTC voice system
│   │   ├── voice/              # STT/TTS fallbacks
│   │   ├── memory/             # Pinned memory CRUD
│   │   ├── notes/              # Notes system
│   │   ├── timers/             # Timer reminders
│   │   └── tools/              # Individual tool endpoints
│   ├── (hud)/                  # Main HUD interface
│   └── robot/                  # Robot control page
│
├── components/                 # React components
│   ├── hud/                    # HUD interface components
│   │   ├── TopBar.tsx          # Top navigation bar
│   │   ├── LeftRail.tsx        # Left panel rail
│   │   ├── RightChat.tsx       # Chat interface
│   │   ├── CenterCore.tsx      # 3D visualization core
│   │   ├── panels/             # Dynamic panel components
│   │   └── chat/               # Chat UI components
│   └── robot/                  # Robot control components
│       ├── MotionControl.tsx   # Joystick control
│       ├── MotorGauges.tsx     # Motor telemetry
│       ├── SensorDisplay.tsx   # Sensor readings
│       └── SerialConsole.tsx   # Debug console
│
├── lib/                        # Core business logic
│   ├── orchestrators/          # AI orchestration
│   │   ├── brain.ts            # Main LangGraph orchestrator
│   │   ├── nodes/              # Graph nodes (research, workflow, tool-calling)
│   │   └── utils/              # Context filtering, activity tracking
│   ├── tools/                  # Tool system (39+ tools)
│   │   ├── registry.ts         # Central tool registry
│   │   ├── executor.ts         # Executor with permissions
│   │   └── implementations/    # Individual tool implementations
│   ├── events/                 # Typed event bus
│   ├── state/                  # HUD state management
│   ├── memory/                 # SQLite pinned memory
│   ├── robot/                  # Robot WebSocket client
│   ├── observability/          # Tracing and audit logging
│   ├── voice/                  # Voice system utilities
│   ├── openai/                 # OpenAI API wrappers
│   └── middleware/             # Rate limiting, validation
│
├── robot/                      # Robot subsystem
│   ├── firmware/
│   │   └── zip_robot_uno/      # Arduino firmware (PlatformIO)
│   │       ├── src/            # C++ source files
│   │       │   ├── main.cpp    # Entry point
│   │       │   ├── hal/        # Hardware abstraction layer
│   │       │   ├── motion/     # Motion control + safety
│   │       │   ├── serial/     # JSON protocol parser
│   │       │   └── behavior/   # Command handlers
│   │       ├── include/        # Headers
│   │       │   └── board/      # Pin definitions (single source of truth)
│   │       ├── tools/          # Test utilities (Node.js)
│   │       └── platformio.ini  # Build configuration
│   ├── bridge/
│   │   └── zip-robot-bridge/   # WebSocket bridge (Node.js)
│   │       ├── src/            # TypeScript source
│   │       │   ├── index.ts    # Entry point
│   │       │   ├── serial/     # Serial transport layer
│   │       │   ├── ws/         # WebSocket server
│   │       │   ├── protocol/   # Reply matching logic
│   │       │   └── streaming/  # Setpoint streaming
│   │       └── README.md       # Bridge documentation
│   └── tools/                  # Diagnostic utilities
│
├── hooks/                      # React hooks
│   ├── useRealtime.ts          # Realtime WebRTC hook
│   ├── useChat.ts              # Chat interface hook
│   ├── useRobot.ts             # Robot bridge hook
│   └── usePanelUpdates.ts      # Panel update subscription
│
├── scripts/                    # Utility scripts
│   ├── test-*.ts               # Integration tests
│   ├── eval-harness.ts         # AI evaluation harness
│   └── build-local.*           # Build scripts
│
├── tests/                      # Test suites
│   ├── e2e/                    # Playwright E2E tests
│   └── utils/                  # Test utilities
│
├── docs/                       # Documentation
│   ├── agents/                 # Agent onboarding guides
│   └── docker/                 # Docker deployment docs
│
├── data/                       # Runtime data (gitignored)
│   ├── audit.log               # Tool audit log (JSONL)
│   ├── traces/                 # Request traces (daily JSONL)
│   ├── memory.db               # Pinned memory (SQLite)
│   ├── notes.db                # Notes database (SQLite)
│   └── docs.db                 # Document embeddings (SQLite)
│
├── public/                     # Static assets
│   └── avatars/                # Avatar images
│
├── .github/                    # GitHub configuration
│   ├── workflows/              # CI/CD workflows
│   └── copilot-instructions.md # Copilot guide
│
├── package.json                # Node.js dependencies
├── next.config.js              # Next.js configuration
├── tsconfig.json               # TypeScript configuration
├── tailwind.config.ts          # Tailwind CSS configuration
├── Dockerfile                  # Production Docker image
├── docker-compose.yml          # Development compose
├── docker-compose.prod.yml     # Production compose
├── Makefile                    # Docker convenience commands
├── CLAUDE.md                   # Claude Code guidance
├── AGENT_GUIDE.md              # Quick agent reference
├── README.md                   # Project overview
└── claude.md                   # This file (baseline reference)
```

---

## Quick Start Commands

### HUD Development (Root Directory)

```bash
# Development
npm run dev              # Start HUD dev server (port 3000, Turbo mode)
npm run dev:bridge       # Start robot bridge in dev mode

# Build
npm run build            # Production build
npm run typecheck        # TypeScript type checking
npm run lint             # Run ESLint

# Testing
npm run test:e2e         # Playwright E2E tests
npm run test:health      # Health check both services
npm run test:integration # Integration tests
```

### Robot Bridge

```bash
cd robot/bridge/zip-robot-bridge

# Development
npm run dev              # Development with real hardware
npm run dev:local        # Development in loopback mode (no hardware)

# Build & Run
npm run build:local      # Production build
npm start                # Run production build

# Testing
npm run test:health      # Health check endpoint
npm run test:integration # Integration tests
npm run test:smoke       # Drive/motion smoke test
npm run test:sensor      # Sensor polling smoke test
```

### Robot Firmware

```bash
cd robot/firmware/zip_robot_uno

# Build and upload
pio run -t upload        # Build and upload to Arduino
pio run                  # Build only
pio run -t clean         # Clean build

# Monitor serial
pio device monitor -b 115200

# Testing (Node.js scripts in tools/)
cd tools
node serial_motor_bringup.js COM5           # Full motor test suite
node serial_motor_bringup.js COM5 --quick   # Quick motor test
node hardware_smoke.js COM5                 # Hardware validation
```

### Docker Commands

```bash
# Development
make dev              # Start all dev services
make dev:build        # Rebuild containers
make health           # Check service health

# Production
make prod:build       # Build production images
make prod:up          # Start production
```

---

## Architecture

### System Architecture

```
┌─────────────────────────────────────────────────────────┐
│                  ZIP HUD (Next.js)                      │
│         http://localhost:3000 (port 3000)               │
│   - Realtime Voice (OpenAI WebRTC)                      │
│   - AI Brain Orchestration (LangGraph)                  │
│   - Tool Executor (39 tools)                            │
│   - Event Bus (typed events)                            │
└─────────────────────┬───────────────────────────────────┘
                      │ WebSocket
┌─────────────────────▼───────────────────────────────────┐
│              Robot Bridge (Node.js)                      │
│         ws://localhost:8765/robot (WS)                   │
│         http://localhost:8766 (HTTP)                     │
│   - WebSocket ↔ Serial Translation                      │
│   - FIFO Reply Matching                                 │
│   - Setpoint Streaming (rate limiting)                  │
└─────────────────────┬───────────────────────────────────┘
                      │ Serial (115200 baud)
┌─────────────────────▼───────────────────────────────────┐
│          ZIP Robot Firmware (Arduino)                    │
│         ELEGOO UNO R3 + SmartCar-Shield v1.1            │
│   - TB6612FNG Motor Driver                              │
│   - MPU6050 IMU (10Hz polling)                          │
│   - Ultrasonic, Line Sensors, Battery Monitor           │
│   - Drive Safety Layer (battery-aware, ramping)         │
└─────────────────────────────────────────────────────────┘
```

### Event-Driven Architecture

**CRITICAL**: All UI state changes flow through the typed event bus.

```
User Input → Event Bus → State Reducer → UI Updates
                ↓
         Tool Executor → OpenAI API → Tool Results → Panel Updates
                ↓
         Robot Bridge → Serial → Firmware → Motors/Sensors
```

Events are defined in `lib/events/` and emitted via `eventBus.emit()`. Never mutate state directly.

### AI Brain Orchestration

**ALL conversation requests route through** `orchestrateConversation()` in `lib/orchestrators/brain.ts`.

The orchestration system uses LangGraph with intelligent routing:

- **Direct Tool Calling**: For simple tool requests
- **Research Sub-graph**: `web_search → fetch_url → summarize_sources` (for current information)
- **Workflow Sub-graph**: `planner → executor → narrator` (for complex multi-step tasks)
- **Context Filtering**: Semantic similarity to reduce token usage

### Three-Layer Robot Stack

1. **Arduino Firmware**: Motion control, sensors, safety layer
2. **WebSocket Bridge**: Serial ↔ WebSocket translation
3. **HUD Client**: Browser-based control interface

---

## Development Patterns

### 1. Type Safety First

- **No `any` types** without explicit justification
- **Zod schemas REQUIRED** for all tool inputs/outputs
- Use `z.infer<typeof schema>` for type inference
- All API endpoints MUST validate inputs with Zod

### 2. Event Bus for State Changes

```typescript
import { eventBus } from "@/lib/events/bus";

// ALWAYS emit events for state changes
eventBus.emit("zip.state", { state: "LISTENING" });
eventBus.emit("panel.update", { panel: "system_stats", data: stats });
```

### 3. Tool Development Pattern

1. Create schemas in `lib/tools/implementations/my-tool.ts`
2. Implement tool function with proper error handling
3. Register in `lib/tools/registry.ts`
4. Create API endpoint in `app/api/tools/my_tool/route.ts` (optional)
5. Add tracing with `observability.trace()`

Example:

```typescript
// lib/tools/implementations/my-tool.ts
import { z } from "zod";

export const myInputSchema = z.object({
  param1: z.string(),
  param2: z.number().optional(),
});

export const myOutputSchema = z.object({
  result: z.string(),
  status: z.enum(["success", "error"]),
});

export async function myToolImplementation(
  input: z.infer<typeof myInputSchema>
): Promise<z.infer<typeof myOutputSchema>> {
  // Implementation with error handling
  try {
    // ... logic
    return { result: "success", status: "success" };
  } catch (error) {
    return { result: error.message, status: "error" };
  }
}

// lib/tools/registry.ts
toolRegistry.set("my_tool", {
  name: "my_tool",
  description: "Clear description for AI",
  inputSchema: myInputSchema,
  outputSchema: myOutputSchema,
  permissionTier: "READ", // or WRITE, ACT, ADMIN
  execute: (input: unknown) =>
    myToolImplementation(input as z.infer<typeof myInputSchema>),
});
```

### 4. API Route Pattern

```typescript
import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@/lib/middleware/rate-limit";
import { z } from "zod";

const inputSchema = z.object({ /* ... */ });

export async function POST(req: NextRequest) {
  const rateLimitResult = await rateLimit(req);
  if (!rateLimitResult.success) {
    return NextResponse.json({ error: "Rate limited" }, { status: 429 });
  }

  const body = await req.json();
  const input = inputSchema.parse(body);

  try {
    const result = await implementation(input);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
```

---

## Tool System

### Tool Registry

All tools MUST be registered in `lib/tools/registry.ts` with:

- **name**: Tool identifier (snake_case)
- **description**: Clear description for AI
- **inputSchema**: Zod schema for validation
- **outputSchema**: Zod schema for type safety
- **permissionTier**: READ | WRITE | ACT | ADMIN
- **execute**: Implementation function

### Permission Tiers

- **READ**: Safe read-only operations (no confirmation needed)
- **WRITE**: Data modification (no confirmation needed)
- **ACT**: Actions requiring user confirmation (robot motion, timers, camera, URLs)
- **ADMIN**: Administrative operations (reserved)

### Tool Categories (39+ Tools)

1. **Robot Control** (7 tools)
   - `robot_drive`, `robot_stop`, `robot_turn`, `robot_set_speed`
   - `robot_get_sensors`, `robot_get_status`, `robot_pan_camera`

2. **Web Research** (5 tools)
   - `web_search`, `fetch_url`, `summarize_sources`
   - `scrape_structured_data`, `monitor_webpage`

3. **Document Intelligence** (4 tools)
   - `read_pdf`, `extract_text`, `search_documents`, `analyze_document`

4. **3D Printer** (3 tools)
   - `printer_status`, `printer_start_print`, `printer_cancel_print`

5. **Memory & Notes** (6 tools)
   - `remember`, `recall`, `forget`
   - `create_note`, `search_notes`, `get_note`

6. **Timers & Reminders** (3 tools)
   - `set_timer`, `list_timers`, `cancel_timer`

7. **System Utilities** (11+ tools)
   - `get_time`, `get_weather`, `calculate`, `convert_units`
   - `take_screenshot`, `open_url`, `send_notification`
   - `system_stats`, `network_info`

---

## Robot System

### Hardware: ELEGOO Smart Robot Car V4.0

- **MCU**: Arduino UNO R3 (ATmega328P, 2KB RAM, 32KB Flash)
- **Motor Driver**: TB6612FNG dual H-bridge (STBY pin must be HIGH on D3)
- **IMU**: MPU6050 @ I2C 0x68 (10Hz polling)
- **Sensors**:
  - HC-SR04 ultrasonic (D13 Trig, D12 Echo)
  - 3x ITR20001 line sensors (A2 Left, A1 Middle, A0 Right)
  - Battery voltage divider (A3)
- **Servo**: SG90 pan servo on D10

### Pin Mapping (Single Source of Truth)

Defined in `robot/firmware/zip_robot_uno/include/board/board_elegoo_uno_smartcar_shield_v11.h`:

- **Motors**: D5/D6 (PWM), D7/D8 (direction), D3 (STBY)
- **IMU**: A4 (SDA), A5 (SCL)
- **Servo**: D10
- **Ultrasonic**: D13 (Trig), D12 (Echo)
- **Line Sensors**: A2 (Left), A1 (Middle), A0 (Right)
- **Battery**: A3

### Firmware Protocol

**Baud Rate**: 115200

**Command Format**: ELEGOO-style JSON
```json
{"N":<command>,"H":"<tag>","D1":<val>,"D2":<val>,"T":<ttl>}
```

**Key Commands**:
- `N=0`: Hello/ping (handshake)
- `N=120`: Diagnostics (debug state dump)
- `N=200`: Setpoint streaming (v=velocity, w=turn rate, T=TTL ms)
- `N=201`: Emergency stop
- `N=999`: Direct motor control (D1=left PWM, D2=right PWM)
- `N=21`: Ultrasonic sensor
- `N=22`: Line sensors
- `N=23`: Battery voltage
- `N=5`: Servo control (D1=angle 0-180°)

**Response Format**: `{<tag>_<result>}` where result is `ok`, `false`, `true`, or a value.

**Important**: N=200 is fire-and-forget (no response). N=120 returns multiple lines collected over 80ms.

### RAM Constraints

- **Total RAM**: 2048 bytes
- **Safe Limit**: ~75% (1536 bytes) - servo operations need stack space
- **Current Usage**: 59.0% (1208 bytes) ✅
- **Never use `String`** - use `char[]` with fixed sizes
- **Minimize debug output** - Serial.print() uses stack

---

## Key Technologies

### Frontend Stack

- **Next.js 16.1.1**: App Router, React Server Components
- **React 19.0.0**: Latest React with concurrent features
- **TypeScript 5.3**: Strict mode enabled
- **Tailwind CSS 3.4**: Utility-first styling
- **Three.js 0.182**: 3D visualization
- **React Three Fiber 9.4**: React renderer for Three.js
- **Framer Motion 11.0**: Animation library
- **Zustand 5.0**: Client state management

### Backend Stack

- **Next.js API Routes**: Server-side endpoints
- **OpenAI SDK 4.80**: Realtime, Responses, Vision, TTS, STT, Embeddings APIs
- **LangChain 1.0**: AI framework
- **LangGraph 1.0**: Orchestration graphs
- **Better-SQLite3 11.0**: Embedded database
- **Zod 3.23**: Schema validation
- **WebSocket (ws 8.18)**: Real-time communication

### Robot Stack

- **PlatformIO**: Arduino build system
- **Arduino Framework**: AVR toolchain 3.70300.220127
- **Node.js + TypeScript**: Bridge server
- **SerialPort 13.0**: Serial communication library

### Development Tools

- **Playwright 1.41**: E2E testing
- **ESLint 9.39**: Linting (Next.js config)
- **tsx 4.7**: TypeScript execution
- **Docker**: Containerization (dev + prod)

---

## File Index

### Critical Files

| File | Purpose | Lines | Importance |
|------|---------|-------|------------|
| `lib/orchestrators/brain.ts` | Main AI orchestration graph | ~500 | ⭐⭐⭐⭐⭐ |
| `lib/tools/registry.ts` | Central tool registry (39 tools) | 500 | ⭐⭐⭐⭐⭐ |
| `lib/tools/executor.ts` | Tool execution with permissions | ~300 | ⭐⭐⭐⭐⭐ |
| `lib/events/bus.ts` | Typed event bus system | ~200 | ⭐⭐⭐⭐⭐ |
| `lib/state/hudStore.ts` | HUD state reducer | ~300 | ⭐⭐⭐⭐ |
| `app/api/agent/route.ts` | Main chat endpoint | ~200 | ⭐⭐⭐⭐⭐ |
| `robot/firmware/zip_robot_uno/src/main.cpp` | Arduino entry point | ~300 | ⭐⭐⭐⭐⭐ |
| `robot/bridge/zip-robot-bridge/src/index.ts` | Bridge server entry | ~250 | ⭐⭐⭐⭐⭐ |

### Configuration Files

| File | Purpose |
|------|---------|
| `package.json` | Main dependencies (39 packages) |
| `next.config.js` | Next.js config (Webpack customization) |
| `tsconfig.json` | TypeScript strict mode configuration |
| `tailwind.config.ts` | Design system tokens |
| `platformio.ini` | Arduino firmware build config |
| `.env.example` | Environment variable template |

### Documentation Files

| File | Lines | Purpose |
|------|-------|---------|
| `CLAUDE.md` | 475 | Claude Code guidance |
| `README.md` | 731 | Project overview |
| `AGENT_GUIDE.md` | 130 | Quick agent reference |
| `robot/firmware/zip_robot_uno/README.md` | ~700 | Firmware documentation |
| `robot/bridge/zip-robot-bridge/README.md` | ~400 | Bridge documentation |
| `.github/copilot-instructions.md` | ~300 | GitHub Copilot guide |

---

## Security & Best Practices

### Input Validation

- **ALL inputs MUST be validated** with Zod schemas
- URL sanitization: Reject `file://`, `javascript:`, `data:` protocols
- File size limits: Documents max 1MB, content truncated at 10KB
- Timeout protection: External fetches max 10s default

### API Key Protection

- **NEVER expose API keys to client** - all OpenAI calls server-side
- Realtime token endpoint uses server-side WebSocket proxy pattern

### Audit & Tracing

- **ALL tool calls logged** to `./data/audit.log` (JSONL format)
- Request-scoped tracing in `./data/traces/` (daily JSONL files)
- Request IDs and step IDs for debugging

### Rate Limiting

- In-memory rate limiter for all tool endpoints
- Default: 100 requests/minute per IP

### Design Tokens

**Colors**:
- Background: `#0B1924`
- Panel surface: `#091016`
- Border: `rgba(60,180,220,0.20)`
- Accent cyan: `#27B4CD`
- Text primary: `#A7C6D3`
- Online green: `#2EE59D`

**Layout**:
- Left rail: `280px` fixed width
- Right rail: `344px` fixed width
- Top bar: `56px` height
- Card radius: `12px`

**Font**:
- Family: Inter (via `next/font`)
- Letter spacing: `0.22em` for uppercase labels

### Do NOT

- Mutate state directly (always use event bus)
- Use `any` types without justification
- Expose API keys to client
- Create files unless absolutely necessary (prefer editing existing files)
- Skip input validation
- Use emojis unless user explicitly requests them
- Use `String` in Arduino code (use `char[]`)

### DO

- Validate all inputs with Zod
- Use TypeScript strict mode
- Emit events for state changes
- Add tracing for observability
- Handle errors gracefully
- Follow existing patterns in similar files
- Run `npm run typecheck` before committing
- Test firmware changes with actual hardware
- Keep Arduino RAM usage under 75%

---

## Environment Variables

### Required

```bash
OPENAI_API_KEY=sk-...          # OpenAI API key
```

### Robot Configuration

```bash
NEXT_PUBLIC_ROBOT_BRIDGE_WS_URL=ws://localhost:8765/robot  # Bridge WebSocket URL
SERIAL_PORT=COM5               # Serial port (auto-detect if not set)
SERIAL_BAUD=115200             # Serial baud rate
LOOPBACK_MODE=false            # Test mode without hardware
```

### OpenAI Models

```bash
OPENAI_REALTIME_MODEL=gpt-4o-realtime-preview-2024-12-17
OPENAI_RESPONSES_MODEL=gpt-4o
OPENAI_VISION_MODEL=gpt-4o
OPENAI_TTS_MODEL=gpt-4o-mini-tts-2025-12-15
OPENAI_STT_MODEL=whisper-1
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
```

---

## Troubleshooting

### Motors Don't Move

1. Verify battery voltage (N=23 should show >7000mV)
2. Check TB6612FNG STBY pin is HIGH (firmware sets D3 HIGH automatically)
3. Run diagnostics: `{"N":120}` should show `{D<pwm>,...}`
4. Verify kit version has TB6612FNG (2023+, not older DRV8835)

### Bridge Shows "Handshaking"

1. Check robot is powered on and connected
2. Verify correct COM port
3. Check no other application is using serial port
4. Try resetting robot (bridge detects boot marker `R\n`)

### Voice Not Working

1. Check `OPENAI_API_KEY` is set
2. Verify Realtime API access (not all API keys have access)
3. Check browser console for WebRTC errors
4. Try voice fallback (STT/TTS) if Realtime unavailable

### High RAM Usage (Firmware)

1. Remove debug Serial.print() statements
2. Use `F()` macro sparingly
3. Avoid String class, use char[] buffers
4. Check RAM with `pio run -v | grep RAM`

---

## Testing

### Full Test Suite

```bash
# HUD tests
npm run typecheck            # TypeScript checking
npm run test:e2e             # Playwright E2E tests
npx tsx scripts/test-api-orchestration.ts     # Orchestration tests
npx tsx scripts/test-brain-integration.ts     # Brain integration tests
npx tsx scripts/eval-harness.ts               # 20-prompt eval harness

# Bridge tests
cd robot/bridge/zip-robot-bridge
npm run test:health          # Health check
npm run test:integration     # Integration tests
npm run test:loopback        # Loopback mode tests (no hardware)

# Firmware tests
cd robot/firmware/zip_robot_uno/tools
node serial_motor_bringup.js COM5             # Full test suite
node hardware_smoke.js COM5                   # Quick hardware validation
```

---

## Project Statistics

- **Total Size**: 330 MB
- **TypeScript Files**: 471 files
- **C++ Files (Firmware)**: 30 files
- **API Endpoints**: 25+ routes
- **Tool Count**: 39 tools across 7 categories
- **Services**: 3 (HUD, Bridge, Firmware)

---

## Additional Resources

For more details, see:

- **README.md**: Project overview, features, quick start
- **CLAUDE.md**: Comprehensive Claude Code guidance
- **AGENT_GUIDE.md**: Quick reference for AI agents
- **docs/agents/**: Agent onboarding and development workflow
- **robot/firmware/zip_robot_uno/README.md**: Firmware documentation
- **robot/bridge/zip-robot-bridge/README.md**: Bridge server documentation
- **.github/copilot-instructions.md**: GitHub Copilot guide

---

**Baseline Created**: 2026-01-11
**Repository**: /home/zip/Zip/zip
**Platform**: Linux 5.15.148-tegra

---
