# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ZIP is a production-grade AI-powered robot system with a Jarvis-style HUD interface. The project combines custom Arduino firmware for an ELEGOO Smart Robot Car V4.0, a WebSocket bridge server for robot communication, and a Next.js HUD application featuring voice control (OpenAI Realtime WebRTC), AI orchestration, and a comprehensive tool ecosystem.

**Key Technologies:**
- **Robot**: Arduino UNO firmware (PlatformIO), WebSocket bridge (Node.js + TypeScript)
- **HUD**: Next.js 16, React 19, TypeScript, Tailwind CSS, Three.js
- **AI**: OpenAI Realtime (voice), Responses API (chat/tools), custom LangGraph-based orchestration
- **Storage**: SQLite (better-sqlite3) for memory, notes, documents

## Build & Development Commands

### HUD Development (Root Directory)

```bash
# Development
npm run dev              # Start HUD dev server (port 3000, Turbo mode)
npm run dev:bridge       # Start robot bridge in dev mode

# Build
npm run build            # Production build
npm run typecheck        # TypeScript type checking
npm run lint             # Run ESLint (Note: CLI bug in Next.js 16.1.1, runs in build)

# Testing
npm run test:e2e         # Playwright E2E tests
npm run test:health      # Health check both services
npm run test:integration # Integration tests between services
```

### Robot Bridge (`robot/bridge/zip-robot-bridge/`)

```bash
cd robot/bridge/zip-robot-bridge

# Development
npm run dev              # Development with real hardware
npm run dev:local        # Development in loopback mode (no hardware)

# Build
npm run build:local      # Production build
npm start                # Run production build

# Testing
npm run test:health      # Health check endpoint
npm run test:integration # Integration tests
npm run test:smoke       # Drive/motion smoke test
npm run test:sensor      # Sensor polling smoke test
```

### Robot Firmware (`robot/firmware/zip_robot_uno/`)

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
node serial_motor_bringup.js COM5 --motion-only  # Motion tests (desktop safe)
node hardware_smoke.js COM5                 # Hardware validation
```

## Architecture Overview

### System Architecture

```
┌─────────────────────────────────────────────────────────┐
│                      ZIP HUD (Next.js)                  │
│         http://localhost:3000 (port 3000)               │
│   - Realtime Voice (OpenAI WebRTC)                      │
│   - AI Brain Orchestration                              │
│   - Tool Executor (39 tools)                            │
│   - Event Bus (typed events)                            │
└─────────────────────┬───────────────────────────────────┘
                      │ WebSocket
┌─────────────────────▼───────────────────────────────────┐
│                Robot Bridge (Node.js)                    │
│         ws://localhost:8765/robot (WS)                   │
│         http://localhost:8766 (HTTP)                     │
│   - WebSocket ↔ Serial Translation                      │
│   - FIFO Reply Matching                                 │
│   - Setpoint Streaming (rate limiting)                  │
└─────────────────────┬───────────────────────────────────┘
                      │ Serial (115200 baud)
┌─────────────────────▼───────────────────────────────────┐
│              ZIP Robot Firmware (Arduino)                │
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

The orchestration system uses a LangGraph-inspired node-based approach with intelligent routing:
- **Direct Tool Calling**: For simple tool requests
- **Research Sub-graph**: web_search → fetch_url → summarize_sources (for current information)
- **Workflow Sub-graph**: planner → executor → narrator (for complex multi-step tasks)
- **Context Filtering**: Semantic similarity to reduce token usage

### Tool Registry Pattern

All tools MUST be registered in `lib/tools/registry.ts` with:
- `name`: Tool identifier (snake_case)
- `description`: Clear description for AI
- `inputSchema`: Zod schema for validation
- `outputSchema`: Zod schema for type safety
- `permissionTier`: READ | WRITE | ACT | ADMIN
- `execute`: Implementation function

Tool implementations live in `lib/tools/implementations/`. ACT-tier tools require user confirmation.

## Critical Architecture Patterns

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

### 4. Permission Tiers
- **READ**: Safe read-only operations (no confirmation needed)
- **WRITE**: Data modification (no confirmation needed)
- **ACT**: Actions requiring user confirmation (robot motion, timers, camera, URLs)
- **ADMIN**: Administrative operations (reserved)

## Key File Locations

### HUD Application
- `lib/orchestrators/brain.ts` - Main AI orchestration graph
- `lib/events/bus.ts` - Event bus system
- `lib/tools/registry.ts` - Tool registry (39 tools)
- `lib/tools/executor.ts` - Tool executor with permissions, audit, tracing
- `lib/state/hudStore.ts` - HUD state reducer
- `lib/robot/` - Robot WebSocket client
- `lib/memory/` - SQLite-based pinned memory
- `lib/observability/` - Tracing and audit logging
- `hooks/useRealtime.ts` - Realtime WebRTC hook
- `components/hud/` - HUD components (TopBar, LeftRail, RightChat, CenterCore)

### Robot System
- `robot/firmware/zip_robot_uno/` - Arduino firmware (PlatformIO)
  - `include/board/board_elegoo_uno_smartcar_shield_v11.h` - Pin definitions (single source of truth)
  - `src/hal/motor_tb6612.cpp` - TB6612FNG motor driver
  - `src/hal/imu_mpu6050.cpp` - MPU6050 IMU driver
  - `src/motion/motion_controller.cpp` - Motion control
  - `src/serial/frame_parser.cpp` - JSON command parser
- `robot/bridge/zip-robot-bridge/` - WebSocket bridge
  - `src/serial/SerialTransport.ts` - Line-oriented serial I/O
  - `src/protocol/ReplyMatcher.ts` - FIFO response correlation
  - `src/ws/RobotWsServer.ts` - WebSocket server

## Robot Firmware Protocol

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

## Hardware Configuration

### ELEGOO Smart Robot Car V4.0
- **MCU**: Arduino UNO R3 (ATmega328P, 2KB RAM, 32KB Flash)
- **Motor Driver**: TB6612FNG dual H-bridge (requires STBY pin HIGH on D3)
- **IMU**: MPU6050 @ I2C 0x68 (10Hz polling)
- **Sensors**: HC-SR04 ultrasonic, 3x ITR20001 line sensors, battery voltage divider
- **Servo**: SG90 pan servo on D10

### Pin Mapping (Single Source of Truth)
Defined in `robot/firmware/zip_robot_uno/include/board/board_elegoo_uno_smartcar_shield_v11.h`:
- **Motors**: D5/D6 (PWM), D7/D8 (direction), D3 (STBY)
- **IMU**: A4 (SDA), A5 (SCL)
- **Servo**: D10
- **Ultrasonic**: D13 (Trig), D12 (Echo)
- **Line Sensors**: A2 (Left), A1 (Middle), A0 (Right)
- **Battery**: A3

### RAM Constraints
- **Total RAM**: 2048 bytes
- **Safe Limit**: ~75% (1536 bytes) - servo operations need stack space
- **Current Usage**: 59.0% (1208 bytes) ✅
- **Never use `String`** - use `char[]` with fixed sizes
- **Minimize debug output** - Serial.print() uses stack

## Common Development Tasks

### Adding a New Tool
1. Create `lib/tools/implementations/my-tool.ts`:
   ```typescript
   import { z } from "zod";

   export const myInputSchema = z.object({ /* ... */ });
   export const myOutputSchema = z.object({ /* ... */ });

   export async function myToolImplementation(
     input: z.infer<typeof myInputSchema>
   ): Promise<z.infer<typeof myOutputSchema>> {
     // Implementation with error handling
   }
   ```

2. Register in `lib/tools/registry.ts`:
   ```typescript
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

3. Create API endpoint in `app/api/tools/my_tool/route.ts` (optional)

### Creating an API Route
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

### Emitting Events
```typescript
import { eventBus } from "@/lib/events/bus";

// State change
eventBus.emit("zip.state", { state: "LISTENING" });

// Panel update
eventBus.emit("panel.update", { panel: "system_stats", data: stats });

// Tool result
eventBus.emit("tool.card", { tool: "get_weather", result: weatherData });
```

### Modifying Firmware
1. **Always read board header first** - `include/board/board_elegoo_uno_smartcar_shield_v11.h`
2. **Test RAM usage after changes** - `pio run -v | grep RAM`
3. **Keep RAM under 75%** - leave room for stack and servo operations
4. **Use fixed-size buffers** - no `String`, no dynamic allocation
5. **Test with hardware** - `node tools/serial_motor_bringup.js COM5`

## Security Requirements

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

## Design Tokens & Styling

### Colors
- Background: `#0B1924`
- Panel surface: `#091016`
- Border: `rgba(60,180,220,0.20)`
- Accent cyan: `#27B4CD`
- Text primary: `#A7C6D3`
- Online green: `#2EE59D`

### Layout
- Left rail: `280px` fixed width
- Right rail: `344px` fixed width
- Top bar: `56px` height
- Card radius: `12px`

### Font
- Family: Inter (via `next/font`)
- Letter spacing: `0.22em` for uppercase labels

## Important Constraints

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

## Additional Documentation

For more details, see:
- **README.md** - Project overview, features, quick start
- **.cursorrules** - Comprehensive code patterns and architecture principles
- **AGENT_GUIDE.md** - Quick reference for AI agents
- **docs/agents/** - Agent onboarding and development workflow
- **robot/firmware/zip_robot_uno/README.md** - Firmware documentation
- **robot/bridge/zip-robot-bridge/README.md** - Bridge server documentation
