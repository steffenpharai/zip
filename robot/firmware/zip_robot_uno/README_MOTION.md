# ZIP Robot Firmware - Motion Control README

## Overview

Motion-first firmware for ELEGOO Smart Robot Car V4.0 with drive-by-wire setpoints, motion macros, and safety guarantees.

## Building with PlatformIO

### Prerequisites

- [PlatformIO](https://platformio.org/) installed
- VS Code with PlatformIO extension (recommended)
- Arduino UNO connected via USB

### Build

```bash
cd robot/firmware/zip_robot_uno
pio run
```

### Upload

**⚠️ CRITICAL: Unplug ESP32/Bluetooth module before uploading!**

1. **Disconnect ESP32/Bluetooth module** from UNO RX/TX pins
2. **Upload firmware**:
   ```bash
   pio run -t upload
   ```
3. **Reconnect ESP32/Bluetooth module** after "Done uploading"

**If upload fails with `avrdude stk500_getsync resp=0x00`**, unplug the ESP32/Bluetooth module and retry.

### Monitor Serial Output

```bash
pio device monitor
```

Default baud rate: 115200

## Protocol Support

The firmware supports **two protocols simultaneously**:

1. **Binary Protocol** (0xAA 0x55): Original ZIP protocol
2. **JSON Protocol**: ELEGOO-style JSON commands

Auto-detection: First byte `0xAA` → binary protocol, otherwise JSON protocol.

## Motion Commands

### N=200: Drive Setpoint

Continuous motion control at 10-30Hz:

```json
{"N":200,"H":"cmd_001","D1":150,"D2":0,"T":200}
```

- `D1`: Forward velocity (-255..255)
- `D2`: Yaw velocity (-255..255)
- `T`: TTL in milliseconds (150-300ms)

### N=201: Stop Now

Immediate stop:

```json
{"N":201,"H":"cmd_stop","D1":0,"D2":0,"T":0}
```

### N=210: Macro Execute

Execute motion macro:

```json
{"N":210,"H":"cmd_macro","D1":1,"D2":200,"T":5000}
```

- `D1`: Macro ID (1=FIGURE_8, 2=SPIN_360, 3=WIGGLE, 4=FORWARD_THEN_STOP)
- `D2`: Intensity (0-255)
- `T`: TTL (1000-10000ms)

### N=211: Macro Cancel

Cancel active macro:

```json
{"N":211,"H":"cmd_cancel","D1":0,"D2":0,"T":0}
```

## Verifying Communication

### Quick Test

**First, verify basic communication:**

```bash
cd robot/tools
npm install
node simple_test.js COM3
```

This sends a hello command and verifies the robot responds.

**Expected output:**
```
✓✓✓ COMMUNICATION VERIFIED ✓✓✓
Robot is responding correctly!
```

### Full Test Suite

Run comprehensive motion tests:

```bash
node test_communication.js COM3
```

This tests:
- ✓ Hello command (N=0) - Communication verification
- ✓ Stop command (N=201)
- ✓ Setpoint command (N=200)
- ✓ Macro command (N=210)
- ✓ Legacy stop (N=100)

### Motion Test Suite

For full motion testing:

```bash
node motion_test.js COM3
```

Replace `COM3` with your serial port (e.g., `/dev/ttyUSB0` on Linux).

**Test Coverage:**
- ✓ N=200 setpoints (forward, turning)
- ✓ TTL deadman stop
- ✓ N=201 immediate stop
- ✓ Macros (FIGURE_8, SPIN_360, WIGGLE, FORWARD_THEN_STOP)
- ✓ Macro cancellation

See `robot/tools/COMMUNICATION_VERIFICATION.md` for detailed troubleshooting.

## Safety Features

1. **Deadman Stop**: TTL expiration automatically stops robot
2. **Rate Limiting**: Max 50 commands/second
3. **Startup Safe**: Motors disabled until first valid command
4. **Hard Stop Override**: N=201, N=100, N=3 D1=9 always stop

## Configuration

Edit `include/config.h` for:
- Task frequencies
- Motion control parameters
- Safety timeouts
- Rate limits

## Pin Mapping

See `include/pins.h` for complete pin assignments.

**Critical Pins:**
- `PIN_MOTOR_STBY` (Pin 3): **MUST be HIGH** for motors to run
- `PIN_MOTOR_PWMA` (Pin 5): Left motor PWM
- `PIN_MOTOR_PWMB` (Pin 6): Right motor PWM

## Troubleshooting

### Motors Don't Move

1. Check STBY pin is HIGH
2. Verify first command was sent (enables motors)
3. Check TTL hasn't expired
4. Verify PWM values in commands

### Upload Fails

1. **Unplug ESP32/Bluetooth module** (blocks RX/TX)
2. Verify COM port is correct
3. Check USB cable connection

### Commands Ignored

1. Check rate limiting (max 50 commands/second)
2. Verify JSON format is correct
3. Check serial baud rate matches (9600 for ELEGOO JSON, 115200 for binary)

## Documentation

- **Motion Control Spec**: `robot/ELEGOO_MOTION_CONTROL.md`
- **Protocol Spec**: `robot/firmware/zip_robot_uno/protocol.md`
- **Hardware Spec**: See ELEGOO documentation

## License

See main project LICENSE file.

