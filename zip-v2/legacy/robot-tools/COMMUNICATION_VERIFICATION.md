# Communication Verification Guide

## Quick Start

### Step 1: Install Dependencies

```bash
cd robot/tools
npm install
```

### Step 2: Find Your COM Port

**Windows:**
- Open Device Manager
- Look under "Ports (COM & LPT)"
- Find "Arduino Uno" or "CH340" - note the COM number (e.g., COM3)

**Linux/Mac:**
```bash
ls /dev/tty* | grep -i usb
# or
ls /dev/tty* | grep -i arduino
```

### Step 3: Run Simple Test

```bash
node simple_test.js COM3
```

Replace `COM3` with your port.

**Expected Output:**
```
=== Simple Communication Test ===
Port: COM3
Baud: 115200

Serial port COM3 opened at 115200 baud

Sending hello command...

[SEND] {"N":0,"H":"hello","D1":0,"D2":0,"T":0}
[RECV] {hello_ok}
[RECV] ZIP Robot Ready - FW: 1.0.0

✓✓✓ COMMUNICATION VERIFIED ✓✓✓
Robot is responding correctly!
```

## Full Test Suite

Run comprehensive tests:

```bash
node test_communication.js COM3
```

This tests:
- ✓ Hello command (N=0)
- ✓ Stop command (N=201)
- ✓ Setpoint command (N=200)
- ✓ Macro command (N=210)
- ✓ Legacy stop (N=100)

## Manual Serial Monitor Test

1. Open Arduino Serial Monitor or PlatformIO Serial Monitor
2. Set baud rate to **115200**
3. Set line ending to **Newline**
4. Send: `{"N":0,"H":"hello","D1":0,"D2":0,"T":0}`
5. Should receive: `{hello_ok}` and `ZIP Robot Ready - FW: 1.0.0`

## Troubleshooting

### No Response

1. **Check COM Port**: Verify correct port in Device Manager
2. **Check Baud Rate**: Must be 115200
3. **Check Firmware**: Ensure firmware is uploaded
4. **Check ESP32/Bluetooth**: Unplug module if upload fails
5. **Check USB Cable**: Try different cable
6. **Check Serial Monitor**: Open serial monitor to see if robot sends anything

### Wrong Responses

1. **Check JSON Format**: Must be valid JSON
2. **Check Protocol**: Robot supports both binary and JSON
3. **Check Rate Limiting**: Max 50 commands/second

### Motors Don't Move

1. **Check STBY Pin**: Must be HIGH (pin 3)
2. **Check First Command**: Motors disabled until first valid command
3. **Check TTL**: Setpoint may have expired
4. **Check Safety**: Motors may be force-disabled

## Verification Checklist

- [ ] Serial port opens successfully
- [ ] Robot responds to N=0 (hello)
- [ ] Robot sends firmware version string
- [ ] Robot responds to N=201 (stop)
- [ ] Robot responds to N=200 (setpoint)
- [ ] Robot responds to N=210 (macro)
- [ ] Robot responds to N=100 (legacy stop)
- [ ] Motors enable on first valid command
- [ ] Motors stop on TTL expiry
- [ ] Motors stop on N=201
- [ ] Rate limiting works (>50Hz commands ignored)

## Expected Serial Output (On Boot)

When firmware boots, you should see:
```
=== ZIP Robot Firmware ===
Version: 1.0.0
Initializing...
Init motor driver...
Motor driver OK
Init servo...
Servo OK
...
Initialization complete. Ready for commands.
Protocols: Binary (0xAA 0x55) and JSON (ELEGOO-style)
Send {"N":0,"H":"hello"} to test communication
```

## Test Commands Reference

### Hello (N=0)
```json
{"N":0,"H":"hello","D1":0,"D2":0,"T":0}
```
Response: `{hello_ok}`

### Stop (N=201)
```json
{"N":201,"H":"stop","D1":0,"D2":0,"T":0}
```
Response: `{stop_ok}`

### Setpoint (N=200)
```json
{"N":200,"H":"setpoint","D1":150,"D2":0,"T":200}
```
Response: `{setpoint_ok}` (first time only)

### Macro (N=210)
```json
{"N":210,"H":"macro","D1":4,"D2":200,"T":5000}
```
Response: `{macro_ok}` or `{macro_false}`

### Legacy Stop (N=100)
```json
{"N":100,"H":"legacy","D1":0,"D2":0,"T":0}
```
Response: `{ok}`

