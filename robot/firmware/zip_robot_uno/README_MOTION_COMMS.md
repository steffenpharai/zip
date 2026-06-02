# ZIP Robot Motion Control & Serial Communication Guide

## Critical: Upload Instructions

### ⚠️ Hardware Requirement for Upload

**UNPLUG THE ESP32 CAMERA/BLUETOOTH MODULE FROM RX/TX BEFORE UPLOAD!**

The Arduino UNO R3 shares RX/TX (pins 0/1) between:
- USB-Serial (for programming)
- ESP32 camera module (if installed)
- Bluetooth module (if installed)

If any module is connected to RX/TX during upload, `avrdude` will fail with sync errors:

```
avrdude: stk500_getsync() attempt 1 of 10: not in sync
```

**Before every upload:**
1. Physically unplug the ESP32 camera from its socket
2. Or disconnect any Bluetooth module
3. Upload firmware via PlatformIO: `pio run -t upload`
4. Reconnect modules after upload completes

## Serial Communication Protocol

### Baud Rate
- **ZIP Firmware**: 115200 baud (faster than official for motion control)
- **Official ELEGOO**: 9600 baud

### Boot Sequence

When the Arduino UNO is reset (including DTR reset on port open):

1. Firmware initializes (takes ~500ms)
2. Sends boot marker: `R\n`
3. Ready to receive commands

### Host Handshake Procedure

```javascript
// 1. Open serial port (DTR reset occurs automatically)
// 2. Wait for reset delay
await sleep(600);

// 3. Flush any garbage data
serialPort.flush();

// 4. Wait for boot marker "R\n"
await waitForLine('R', 2000);

// 5. Send hello handshake
serialPort.write('{"N":0,"H":"hello"}\n');

// 6. Wait for response
await waitForLine('hello_ok', 1000);

// 7. Connection established!
```

## Command Format

### JSON Commands (ELEGOO-style)

```json
{"N":<number>,"H":"<header>","D1":<value>,"D2":<value>,"T":<ttl_ms>}
```

| Field | Required | Description |
|-------|----------|-------------|
| N | Yes | Command number (determines behavior) |
| H | No | Header string (echoed in response) |
| D1-D4 | No | Data fields (meaning depends on N) |
| T | No | Timer/TTL in milliseconds |

### Response Format

```
{header_result}
```

Examples:
- `{hello_ok}` - Hello handshake successful
- `{stop_ok}` - Stop command acknowledged
- `{H_false}` - Command failed
- `{stats:rx=0,jd=0,pe=0,bc=0,tx=0,ms=1234}` - Diagnostics

## Motion Commands (N≥200)

### N=200: Drive Setpoint (Fire-and-Forget)

Stream this command at 20Hz for smooth motion control.

```json
{"N":200,"H":"sp","D1":100,"D2":0,"T":200}
```

| Field | Range | Description |
|-------|-------|-------------|
| D1 | -255 to 255 | Forward velocity (+ = forward, - = reverse) |
| D2 | -255 to 255 | Yaw rate (+ = right turn, - = left turn) |
| T | 150-300ms | TTL (motors stop if no new command received) |

**IMPORTANT**: N=200 does **NOT** send a response. This is intentional for 20Hz streaming.

### N=201: Stop Now

Immediate hard stop. Always responds.

```json
{"N":201,"H":"stop"}
```

Response: `{stop_ok}`

### N=210: Macro Execute

Start a predefined motion pattern.

```json
{"N":210,"H":"macro","D1":2,"D2":200,"T":5000}
```

| Field | Description |
|-------|-------------|
| D1 | Macro ID: 1=FIGURE_8, 2=SPIN_360, 3=WIGGLE, 4=FORWARD_THEN_STOP |
| D2 | Intensity 0-255 (scales motion speed) |
| T | TTL in ms (1000-10000, macro auto-stops after this time) |

Response: `{macro_ok}` or `{macro_false}`

### N=211: Macro Cancel

Cancel running macro.

```json
{"N":211,"H":"cancel"}
```

Response: `{cancel_ok}`

## Utility Commands

### N=0: Hello (Handshake)

```json
{"N":0,"H":"hello"}
```

Response: `{hello_ok}`

### N=120: Get Diagnostics

```json
{"N":120,"H":"diag"}
```

Response format:
```
{stats:rx=0,jd=0,pe=0,bc=0,tx=0,ms=1234}
```

| Field | Description |
|-------|-------------|
| rx | RX ring buffer overflow count |
| jd | JSON lines dropped (too long) |
| pe | Parse errors |
| bc | Binary CRC failures |
| tx | TX responses dropped (buffer full) |
| ms | Milliseconds since last command |

### N=100: Clear All to Standby (Legacy)

Stops all motion and resets to standby mode.

```json
{"N":100}
```

Response: `{ok}`

## Host Integration Best Practices

### 1. Always Run a Dedicated Reader Loop

The Arduino UNO has only a 64-byte TX buffer. If the host doesn't read data fast enough, responses will be dropped.

```javascript
// BAD: Reading only when needed
function sendCommand(cmd) {
  serial.write(cmd);
  return await readLine();  // May miss other data
}

// GOOD: Continuous reader loop
const responseQueue = [];

serial.on('data', (data) => {
  // Always consume data immediately
  const lines = data.toString().split('\n');
  lines.forEach(line => {
    if (line.trim()) responseQueue.push(line.trim());
  });
});

function sendCommand(cmd) {
  serial.write(cmd);
  // Response will appear in responseQueue
}
```

### 2. Don't Expect ACKs for N=200

Drive setpoints are fire-and-forget by design:

```javascript
// Stream setpoints at 20Hz
setInterval(() => {
  serial.write(`{"N":200,"D1":${v},"D2":${w},"T":200}\n`);
}, 50);  // 20Hz = 50ms interval

// No need to wait for response!
```

### 3. Handle the DTR Reset

Opening a serial port toggles DTR, which resets the Arduino:

```javascript
// When opening a port, the robot WILL reset
serial.open();

// Wait for reset to complete
await sleep(600);

// Flush any startup garbage
serial.read();

// Now wait for "R\n" boot marker
await waitForLine('R', 2000);
```

### 4. Set Appropriate TTL

TTL should be slightly longer than your command interval:
- 20Hz streaming → use 200ms TTL
- 10Hz streaming → use 150ms TTL

If connection drops, motors stop automatically after TTL expires.

## Running the Test Harness

### Prerequisites

```bash
cd tools
npm install
```

### Run Tests

```bash
# Windows
node serial_motion_test.js COM5

# Linux/Mac
node serial_motion_test.js /dev/ttyUSB0
```

### Expected Output

```
=== ZIP Robot Serial Motion Test ===

Port: COM5
Baud: 115200

Opening port...
Port opened.

Waiting 600ms for DTR reset...

--- TEST 1: Boot Marker ---
<< R
✓ Received boot marker

--- TEST 2: Hello Handshake ---
>> {"N":0,"H":"test"}
<< {hello_ok}
✓ Hello handshake successful

... (more tests) ...

=== TEST SUMMARY ===
Boot Marker:       ✓ PASS
Hello Handshake:   ✓ PASS
Setpoint Streaming: ✓ PASS
TTL Stop:          ✓ PASS
Stop Command:      ✓ PASS
Macro Start:       ✓ PASS
Macro Cancel:      ✓ PASS
Diagnostics:       ✓ PASS

Total: 8/8 tests passed
```

## Next.js/Node.js Integration

### Example Bridge Code

```javascript
const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');

class RobotBridge {
  constructor(port) {
    this.serial = new SerialPort({ path: port, baudRate: 115200 });
    this.parser = this.serial.pipe(new ReadlineParser({ delimiter: '\n' }));
    
    // Always read to prevent TX backpressure
    this.parser.on('data', (line) => this.onResponse(line.trim()));
  }
  
  onResponse(line) {
    // Handle responses here
    console.log('Robot:', line);
  }
  
  // Fire-and-forget setpoint (no response expected)
  setpoint(v, w, ttl = 200) {
    this.serial.write(`{"N":200,"D1":${v},"D2":${w},"T":${ttl}}\n`);
  }
  
  // Stop with acknowledgment
  async stop() {
    this.serial.write('{"N":201,"H":"stop"}\n');
    // Response will arrive via onResponse callback
  }
}
```

## Troubleshooting

### Upload Fails with Sync Error
→ Unplug ESP32 camera from RX/TX pins before upload

### No "R\n" Boot Marker
→ Check baud rate (115200)
→ Try longer reset delay (1000ms)
→ Verify firmware is actually uploaded

### Commands Not Acknowledged
→ Check JSON syntax (must have `"N":` field)
→ Verify baud rate matches (115200)
→ Check for rate limiting (max 50 commands/sec)

### Motors Don't Move
→ Verify STBY pin (pin 3) is HIGH
→ Check battery voltage
→ Send N=200 with non-zero D1/D2

### Watchdog Resets (repeated "R\n")
→ Indicates blocking in serial operations
→ Reduce command rate
→ Check for TX buffer overflow (read responses faster)
