# ZIP Robot Bridge Test Scripts

## test-integration.ts

Comprehensive integration test suite that verifies all bridge functionality via WebSocket.

### Usage

```bash
# Ensure the bridge is running first
npm run dev           # Real hardware
npm run dev:local     # Loopback mode

# Run the test suite
npm run test:integration
```

### What It Tests

| Test | Description |
|------|-------------|
| Health endpoint | HTTP /health returns valid status |
| WebSocket connect | WS connection established |
| N=0 Hello | Basic command/response |
| N=999 Direct Motor | Motor control command |
| N=201 Stop | Stop command |
| N=120 Diagnostics | Multi-line diagnostics response |
| Stream start | Begin setpoint streaming |
| Stream update | Update setpoint mid-stream |
| Stream stop | Stop streaming with N=201 |
| Emergency stop | HTTP POST /api/robot/stop |

### Expected Output

```
════════════════════════════════════════════════════════════
ZIP Robot Bridge Integration Tests
════════════════════════════════════════════════════════════
WebSocket: ws://localhost:8765/robot
Health: http://localhost:8766/health
────────────────────────────────────────────────────────────
  ✓ Health endpoint responds
  ✓ WebSocket connects
[Test] Waiting for ready status...
[Test] Bridge is ready

Command Tests:
  ✓ N=0 Hello → {H_ok}
  ✓ N=999 Direct Motor → {H_ok}
  ✓ N=201 Stop → {H_ok}
  ✓ N=120 Diagnostics → array

Streaming Tests:
  ✓ Stream start → replyKind none
  ✓ Stream update
  ✓ Stream stop → {H_ok}

Emergency Tests:
  ✓ POST /api/robot/stop

════════════════════════════════════════════════════════════
TEST SUMMARY
════════════════════════════════════════════════════════════
Total: 10 | Passed: 10 | Failed: 0
Total time: 236ms

✓ All tests passed!
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `WS_URL` | `ws://localhost:8765/robot` | WebSocket endpoint |
| `HEALTH_URL` | `http://localhost:8766/health` | Health endpoint |

---

## test-all-commands.ts (Legacy)

> **Note**: This script uses the old binary protocol format and is no longer compatible with the current firmware. Use `test-integration.ts` instead.

---

## test_robot_serial.py (Legacy)

> **Note**: This Python script uses the old binary protocol. For direct serial testing, use the Node.js tools in `robot/firmware/zip_robot_uno/tools/`.

---

## Recommended Testing Workflow

### 1. Loopback Test (No Hardware)

```bash
# Terminal 1: Start bridge in loopback mode
npm run dev:local

# Terminal 2: Run tests
npm run test:integration
```

### 2. Hardware Test

```bash
# Terminal 1: Start bridge with real robot
npm run dev

# Terminal 2: Run tests
npm run test:integration
```

### 3. Manual Testing

```bash
# Health check
curl http://localhost:8766/health

# Emergency stop
curl -X POST http://localhost:8766/api/robot/stop
```

---

## Troubleshooting Tests

### Connection Refused
- Ensure bridge is running: `npm run dev`
- Check port 8765 is not blocked

### Tests Timeout
- Check bridge health: `curl http://localhost:8766/health`
- Verify `"ready": true` in health response
- Check serial connection to robot

### Wrong Response Format
- The firmware uses `{<tag>_ok}` format, not `{H_ok}`
- Tests check for `_ok}` suffix, which handles both formats
