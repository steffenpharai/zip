# ZIP Robot Bridge Troubleshooting Guide

## Quick Diagnostics

### Check Bridge Health

```bash
curl http://localhost:8766/health
```

Expected response when working:
```json
{
  "status": "ok",
  "serialOpen": true,
  "ready": true,
  "port": "COM5",
  "baud": 115200,
  ...
}
```

### Check Bridge Logs

```bash
# View recent logs
tail -f ./data/bridge.log

# Or on Windows PowerShell
Get-Content ./data/bridge.log -Tail 20 -Wait
```

---

## Common Issues

### 1. Bridge Not Starting

**Symptom**: `npm run dev` fails or exits immediately

**Solutions**:
1. Check if port 8765 or 8766 is already in use:
   ```bash
   # Windows
   netstat -ano | findstr :8765
   
   # Linux/Mac
   lsof -i :8765
   ```
2. Kill any existing node processes:
   ```bash
   # Windows PowerShell
   Get-Process node | Stop-Process -Force
   
   # Linux/Mac
   pkill node
   ```
3. Check for missing dependencies: `npm install`

---

### 2. Handshake Fails (Never Becomes Ready)

**Symptom**: Health shows `"ready": false` and `"status": "degraded"`

**Possible Causes**:

#### A. Robot Not Powered/Connected
- Check USB cable connection
- Verify robot has power (LEDs should be on)
- Check Device Manager for COM port

#### B. Wrong COM Port
- Set the correct port: `SERIAL_PORT=COM3 npm run dev`
- Or check auto-detection in logs

#### C. Serial Port In Use
- Close Arduino IDE Serial Monitor
- Close PlatformIO Serial Monitor
- Close any other serial terminal

#### D. Firmware Not Running
- Reset the robot (press reset button)
- Re-upload firmware: `cd robot/firmware/zip_robot_uno && pio run -t upload`

**Debug Steps**:
1. Check bridge logs for boot marker (`R`) reception
2. Check if hello commands are being sent
3. Check for `{hello_ok}` or similar response

---

### 3. Commands Timeout

**Symptom**: WebSocket commands return timeout errors

**Possible Causes**:

#### A. Bridge Not Ready
- Wait for handshake to complete
- Check health endpoint: `curl http://localhost:8766/health`

#### B. Firmware Processing Slow
- Increase timeout: `COMMAND_TIMEOUT_MS=500 npm run dev`
- Check if firmware is stuck (reset robot)

#### C. Serial Buffer Full
- Reduce command rate
- Check for command flooding

**Debug Steps**:
1. Send a simple command via integration test
2. Check if response arrives in logs
3. Try N=120 diagnostics to verify communication

---

### 4. Streaming Not Working

**Symptom**: Robot doesn't move during streaming

**Note**: N=200 setpoint commands are **fire-and-forget** (no response expected)

**Verification Steps**:
1. Start streaming via WebSocket
2. Send N=120 diagnostics command
3. Check diagnostics show non-zero PWM values: `{D80,80,1,3,1}`

**Possible Issues**:
- TTL too short (robot stops before next setpoint)
- Stream rate too slow
- Motor driver in standby

---

### 5. Robot Resets During Operation

**Symptom**: Seeing repeated boot markers (`R`) in logs

**Possible Causes**:
- Firmware watchdog timeout (RAM >85%)
- Power supply issues
- USB connection unstable
- Serial buffer overflow

**Solutions**:
1. Check firmware RAM usage: should be <85%
2. Use shorter command tags (H value)
3. Reduce command rate
4. Check power supply

---

### 6. Wrong Response Format

**Symptom**: Responses don't match expected format

**Note**: The firmware responds with `{<tag>_ok}` format, NOT `{H_ok}`

**Examples**:
- Command: `{"N":0,"H":"hello"}` → Response: `{hello_ok}`
- Command: `{"N":201,"H":"stop"}` → Response: `{stop_ok}`
- Long tags are truncated: `{"N":999,"H":"test_motor"}` → `{test_mo_ok}`

---

## Debug Mode

Enable verbose logging:

```bash
DEBUG=true npm run dev
```

This shows all received serial lines in the logs.

---

## Test Commands

### Quick Health Check
```bash
npm run test:health
```

### Full Integration Test
```bash
# Start bridge first
npm run dev

# In another terminal
npm run test:integration
```

### Manual WebSocket Test

```javascript
const ws = new WebSocket('ws://localhost:8765/robot');

ws.onopen = () => {
  // Send hello
  ws.send(JSON.stringify({
    type: 'robot.command',
    id: 'test1',
    payload: { N: 0, H: 'hello' }
  }));
};

ws.onmessage = (event) => {
  console.log('Reply:', JSON.parse(event.data));
};
```

---

## Log Event Reference

| Event | Description |
|-------|-------------|
| `serial_open` | Serial port opened |
| `serial_close` | Serial port closed |
| `serial_error` | Serial port error |
| `rx_line` | Line received from firmware (DEBUG only) |
| `tx_cmd` | Command sent to firmware |
| `handshake_step` | Handshake progress |
| `pending_timeout` | Command timed out |
| `stream_start` | Streaming started |
| `stream_stop` | Streaming stopped |
| `ws_connect` | WebSocket client connected |
| `ws_disconnect` | WebSocket client disconnected |
| `emergency_stop` | Emergency stop triggered |

---

## Getting Help

1. Check the logs: `./data/bridge.log`
2. Run health check: `curl http://localhost:8766/health`
3. Run integration tests: `npm run test:integration`
4. Check firmware README: `robot/firmware/zip_robot_uno/README.md`

