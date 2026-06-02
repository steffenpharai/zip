# ZIP Robot Bridge

A reliable bridge service that translates WebSocket messages to ELEGOO-style JSON serial protocol for the ZIP Robot Firmware.

## Features

- **Line-oriented serial I/O** with proper boot marker detection
- **Handshake state machine** for reliable startup
- **Deterministic request/response correlation** using FIFO matching
- **Setpoint streaming** with rate limiting and TTL enforcement
- **Priority queue** with backpressure protection
- **WebSocket API** with Zod validation
- **LOOPBACK_MODE** for testing without hardware

## Quick Start

```bash
# Install dependencies
npm install

# Run with real hardware (auto-detects port)
npm run dev

# Run in loopback mode (no hardware)
npm run dev:local

# Run integration tests (requires bridge running)
npm run test:integration

# Run integration tests with loopback (starts bridge automatically)
npm run test:loopback

# Health check
npm run test:health

# Smoke tests (requires bridge running)
npm run test:smoke      # Drive/motion smoke test
npm run test:sensor     # Sensor polling smoke test
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     WebSocket Clients                        │
│                    ws://localhost:8765/robot                 │
└─────────────────────────┬───────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────────┐
│                    RobotWsServer                             │
│  - Zod message validation                                    │
│  - Command routing                                           │
│  - Stream management                                         │
└─────────────────────────┬───────────────────────────────────┘
                          │
          ┌───────────────┼───────────────┐
          ▼               ▼               ▼
┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│ ReplyMatcher │ │ SetpointStr- │ │ HealthServer │
│              │ │ eamer        │ │ :8766        │
│ FIFO queue   │ │ Single timer │ │              │
│ Token/diag   │ │ Coalescing   │ │ /health      │
│ matching     │ │ TTL clamp    │ │ /api/robot/  │
└──────────────┘ └──────────────┘ │ stop         │
          │               │       └──────────────┘
          └───────────────┼───────────────┘
                          │
┌─────────────────────────▼───────────────────────────────────┐
│                   SerialTransport                            │
│  - Line-oriented RX (ReadlineParser)                         │
│  - Boot marker detection ("R\n")                             │
│  - Hello handshake (N=0 → {<tag>_ok})                        │
│  - Priority queue with rate limiting                         │
│  - Setpoint coalescing                                       │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
              ┌───────────────────────┐
              │  ZIP Robot Firmware   │
              │  115200 baud          │
              │  ELEGOO JSON Protocol │
              └───────────────────────┘
```

## Firmware Protocol

The firmware uses ELEGOO-style JSON commands:

```json
{"N":<command>,"H":"<tag>","D1":<val>,"D2":<val>,"T":<ttl>}
```

### Commands

| N | Command | Parameters | Response | Description |
|---|---------|------------|----------|-------------|
| 0 | Hello | H=tag | `{<tag>_ok}` | Handshake/ping |
| 120 | Diagnostics | H=tag | Multi-line | Debug state dump |
| 200 | Setpoint | D1=v, D2=w, T=ttl | (none) | Streaming motion |
| 201 | Stop | H=tag | `{<tag>_ok}` | Immediate stop |
| 210 | Macro Start | D1=id, H=tag | `{<tag>_ok}` | Start macro |
| 211 | Macro Cancel | H=tag | `{<tag>_ok}` | Cancel macro |
| 999 | Direct Motor | D1=L, D2=R, H=tag | `{<tag>_ok}` | Raw PWM control |

### Response Format

The firmware responds with `{<tag>_<result>}` where:
- `<tag>` is the H value from the command (truncated to ~8 chars)
- `<result>` is one of: `ok`, `false`, `true`, `value`

Examples:
- Command: `{"N":0,"H":"hello"}` → Response: `{hello_ok}`
- Command: `{"N":999,"H":"test_motor","D1":100,"D2":100}` → Response: `{test_mo_ok}`
- Command: `{"N":201,"H":"stop"}` → Response: `{stop_ok}`

### Diagnostics Response (N=120)

Returns multiple lines (collected over `DIAGNOSTICS_COLLECT_MS` timeout, default 80ms):
```
{<owner><L>,<R>,<stby>,<state>,<resets>}
{stats:rx=<rx>,jd=<jd>,pe=<pe>,bc=<bc>,tx=<tx>,ms=<ms>}
```

| Field | Values | Description |
|-------|--------|-------------|
| owner | `I`=Idle, `D`=Direct, `X`=Stopped | Motion owner |
| L, R | -255 to 255 | Current PWM values |
| stby | 0/1 | Motor driver standby |
| state | 0-4 | Motion controller state |
| resets | 0+ | Reset counter |

**Note**: The bridge collects all diagnostic lines sent by the firmware within the `DIAGNOSTICS_COLLECT_MS` window and returns them as a single `diagnostics` array in the `robot.reply` message.

### Boot Marker

On power-up or reset, the firmware sends `R\n` to indicate it's ready.

## WebSocket API

### Endpoint

```
ws://localhost:8765/robot
```

### Client → Bridge Messages

#### robot.command

Send a firmware command and wait for response.

```json
{
  "type": "robot.command",
  "id": "unique-uuid",
  "payload": {
    "N": 201,
    "H": "stop",
    "D1": 0,
    "D2": 0,
    "T": 0
  },
  "expectReply": true,
  "timeoutMs": 250
}
```

#### robot.stream.start

Start setpoint streaming.

```json
{
  "type": "robot.stream.start",
  "id": "unique-uuid",
  "rateHz": 10,
  "ttlMs": 200,
  "v": 80,
  "w": 0
}
```

#### robot.stream.update

Update setpoint during streaming.

```json
{
  "type": "robot.stream.update",
  "id": "unique-uuid",
  "v": 80,
  "w": 30,
  "ttlMs": 200
}
```

#### robot.stream.stop

Stop streaming.

```json
{
  "type": "robot.stream.stop",
  "id": "unique-uuid",
  "hardStop": true
}
```

### Bridge → Client Messages

#### robot.reply

Response to a command or stream message.

```json
{
  "type": "robot.reply",
  "id": "unique-uuid",
  "ok": true,
  "replyKind": "token",
  "token": "{hello_ok}",
  "diagnostics": null,
  "timingMs": 12
}
```

| replyKind | Description |
|-----------|-------------|
| `token` | Single token response like `{hello_ok}` |
| `diagnostics` | Array of diagnostic lines |
| `none` | Fire-and-forget (N=200, stream messages) |

#### robot.serial.rx

Raw serial line received (for debugging).

```json
{
  "type": "robot.serial.rx",
  "line": "{hello_ok}",
  "ts": 1700000000
}
```

#### robot.status

Bridge health snapshot.

```json
{
  "type": "robot.status",
  "ready": true,
  "port": "COM5",
  "baud": 115200,
  "streaming": true,
  "streamRateHz": 10,
  "rxBytes": 12345,
  "txBytes": 6789,
  "pending": 1,
  "lastReadyMsAgo": 1200
}
```

## HTTP API

### GET /health

Health check endpoint.

```json
{
  "status": "ok",
  "serialOpen": true,
  "ready": true,
  "port": "COM5",
  "baud": 115200,
  "streaming": false,
  "pendingQueueDepth": 0,
  "lastRxAt": 1700000000,
  "lastTxAt": 1700000000,
  "lastBootMarkerAt": 1700000000,
  "resetsSeen": 1,
  "rxBytes": 1234,
  "txBytes": 567,
  "uptime": 60000,
  "timestamp": 1700000000
}
```

### POST /api/robot/stop

Emergency stop endpoint. Immediately stops streaming and sends N=201.

```json
{
  "ok": true,
  "message": "Emergency stop sent",
  "timestamp": 1700000000
}
```

## Handshake Behavior

1. **Open port** with DTR settle delay (700ms default)
2. **Wait for boot marker** (`R\n`) or timeout (1500ms)
3. **Send N=0 hello** up to 3 times
4. **Wait for `{<tag>_ok}`** response
5. **Mark ready** and begin normal operation

If the firmware resets at any time, the bridge detects the boot marker and broadcasts a status update.

## Streaming Semantics

- **Rate limit**: Max 20Hz, default 10Hz (configurable via `STREAM_MAX_RATE_HZ`)
- **TTL**: Clamped to 150-300ms (configurable via `STREAM_MIN_TTL_MS`/`STREAM_MAX_TTL_MS`), default 200ms
- **Coalescing**: Only latest setpoint sent if queue builds up
- **Stop priority**: N=201 always preempts queue
- **Fire-and-forget**: N=200 never expects response
- **Global rate limit**: 50 commands/second (configurable via `MAX_COMMANDS_PER_SEC`)

## Priority Queue

| Priority | Commands | Behavior |
|----------|----------|----------|
| 0 (highest) | N=201 Stop | Never dropped, preempts queue |
| 1 | N=120 Diagnostics | Normal queue, collects multi-line response (timeout: `DIAGNOSTICS_COLLECT_MS`) |
| 2 | N=999 Direct Motor | Normal queue |
| 3 | Other commands | Normal queue |
| 4 (lowest) | N=200 Setpoints | Coalesced (keep latest only) |

**Global rate limit**: 50 commands/second (configurable via `MAX_COMMANDS_PER_SEC`)

The rate limiter uses a token bucket algorithm that refills tokens at the configured rate. Commands that would exceed the rate limit are queued until tokens are available.

## Environment Variables

| Variable | Default | Range | Description |
|----------|---------|-------|-------------|
| `SERIAL_PORT` | auto-detect | - | Serial port path (optional, auto-detects if not set) |
| `SERIAL_BAUD` | 115200 | positive int | Baud rate |
| `WS_PORT` | 8765 | 1-65535 | WebSocket server port |
| `HTTP_PORT` | 8766 | 1-65535 | HTTP server port |
| `LOOPBACK_MODE` | false | true/false | Enable loopback testing mode (no hardware) |
| `DEBUG` | false | true/false | Enable verbose logging |
| `STREAM_DEFAULT_RATE_HZ` | 10 | 1-20 | Default streaming rate |
| `STREAM_MAX_RATE_HZ` | 20 | 1-20 | Maximum streaming rate |
| `STREAM_DEFAULT_TTL_MS` | 200 | 100-500 | Default setpoint TTL |
| `STREAM_MIN_TTL_MS` | 150 | 100-300 | Minimum TTL (clamped) |
| `STREAM_MAX_TTL_MS` | 300 | 200-500 | Maximum TTL (clamped) |
| `MAX_COMMANDS_PER_SEC` | 50 | 1-100 | Global rate limit for command queue |
| `HANDSHAKE_TIMEOUT_MS` | 1500 | 500-5000 | Boot marker timeout |
| `COMMAND_TIMEOUT_MS` | 250 | 100-5000 | Command response timeout |
| `DIAGNOSTICS_COLLECT_MS` | 80 | 30-200 | Time to collect multi-line diagnostics (N=120) |
| `DTR_SETTLE_MS` | 700 | 300-2000 | DTR settle delay on serial port open |
| `LOG_PATH` | ./data/bridge.log | - | NDJSON log file path |

## Logging

Logs are written in NDJSON format to `./data/bridge.log`:

```json
{"timestamp":1700000000,"event":"serial_open","data":{"port":"COM5","baud":115200}}
{"timestamp":1700000001,"event":"handshake_step","data":{"step":"boot_marker"}}
{"timestamp":1700000002,"event":"handshake_step","data":{"step":"complete"}}
{"timestamp":1700000003,"event":"tx_cmd","data":{"N":200,"priority":4}}
```

Set `DEBUG=true` for verbose `rx_line` logging.

## Testing

### Loopback Mode

Run the bridge with `LOOPBACK_MODE=true` to test without hardware:

```bash
npm run dev:local
```

The loopback emulator:
- Emits `R\n` boot marker on connect
- Responds `{<tag>_ok}` to N=0, N=201, N=999, N=210, N=211
- Emits diagnostic lines for N=120
- Ignores N=200 (no response, like real firmware)

### Integration Tests

```bash
# Start bridge (real or loopback)
npm run dev      # or npm run dev:local

# Run tests in another terminal
npm run test:integration
```

Expected output:
```
════════════════════════════════════════════════════════════
TEST SUMMARY
════════════════════════════════════════════════════════════
Total: 10 | Passed: 10 | Failed: 0
Total time: 236ms

✓ All tests passed!
```

## Module Structure

```
src/
├── config/
│   └── env.ts              # Validated environment variables
├── logging/
│   └── logger.ts           # NDJSON file logger
├── protocol/
│   ├── FirmwareJson.ts     # Type guards, builders, clamps
│   └── ReplyMatcher.ts     # FIFO response correlation
├── serial/
│   ├── SerialTransport.ts  # Line-oriented serial I/O
│   └── LoopbackEmulator.ts # Testing emulator
├── streaming/
│   └── SetpointStreamer.ts # Single-timer streaming
├── ws/
│   └── RobotWsServer.ts    # WebSocket handling
├── http/
│   └── HealthServer.ts     # Health + emergency stop
└── index.ts                # Main entry point
```

## Troubleshooting

### Bridge shows "handshaking" but never becomes ready

**Cause**: The bridge is waiting for a response to the hello command.

**Solutions**:
1. Check that the robot is powered on and connected
2. Verify the correct COM port is being used
3. Check if another application is using the serial port
4. Try resetting the robot (the bridge will detect the boot marker)

### Commands timeout

**Cause**: The firmware isn't responding within the timeout period.

**Solutions**:
1. Check the health endpoint: `curl http://localhost:8766/health`
2. Verify the firmware is running (should see boot marker on reset)
3. Increase `COMMAND_TIMEOUT_MS` if needed

### Streaming doesn't work

**Cause**: N=200 setpoint commands are fire-and-forget (no response).

**Note**: This is expected behavior. The firmware processes setpoints silently. 
Use N=120 diagnostics to verify the robot is receiving commands.

### Robot resets during operation

**Cause**: Firmware watchdog timeout or RAM issues.

**Solutions**:
1. Check firmware RAM usage (<85%)
2. Reduce command rate if flooding the serial buffer
3. Check power supply stability

## Version History

### v2.0.0 (January 2026)

- Complete refactor for ELEGOO-style JSON protocol
- Added proper handshake state machine with boot marker detection
- Added FIFO reply matching for deterministic correlation
- Added setpoint streaming with coalescing and TTL enforcement
- Added priority queue with rate limiting (50 cmd/s)
- Added loopback testing mode
- Added Zod validation for WebSocket messages
- Added emergency stop HTTP endpoint
- Fixed token response pattern to match actual firmware format `{<tag>_ok}`

### v1.0.0 (Initial)

- Binary protocol with CRC16 (incorrect for this firmware)
