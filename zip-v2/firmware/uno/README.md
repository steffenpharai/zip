# ZIP Robot Firmware

Production-grade firmware for ELEGOO Smart Robot Car V4.0 on Arduino UNO.

**Hardware: ELEGOO UNO R3 + SmartCar-Shield-v1.1 (TB6612FNG Motor Driver)**

**Verified Configuration (January 2026) - v2.8.0**
- RAM: 59.0% (1208/2048 bytes) ✅ Well under 75% threshold
- Flash: 68.3% (22016/32256 bytes)
- All motion tests passing
- Servo control: **Working** ✅
- IMU (MPU6050): **Enabled** ✅ (10Hz polling)
- Sensor commands return actual values (N=21, N=22, N=23)
- **NEW**: Drive Safety Layer (battery-aware limiting, deadband, ramping)
- **NEW**: Init Sequence (non-blocking hardware validation on boot)

✅ **TB6612FNG Support**: Motor driver configured for V1_20230201 kit (TB6612FNG with STBY pin).
✅ **IMU Enabled**: MPU6050 now active at 10Hz polling rate.
✅ **Board-Correct by Construction**: Firmware locked to verified hardware stack.
✅ **Drive Safety**: Battery-aware PWM limiting, deadband compensation, slew-rate ramping.

---

## Table of Contents

1. [Quick Start](#quick-start)
2. [Board Profile](#board-profile)
3. [Verified From Shield Labels](#verified-from-shield-labels)
4. [Hardware Configuration](#hardware-configuration)
5. [Architecture](#architecture)
6. [Subsystem Configuration](#subsystem-configuration)
7. [Building & Uploading](#building--uploading)
8. [Testing](#testing)
9. [Protocol Reference](#protocol-reference)
10. [Pin Mapping](#pin-mapping)
11. [RAM Constraints & Lessons Learned](#ram-constraints--lessons-learned)
12. [Troubleshooting](#troubleshooting)

---

## Quick Start

```bash
# 1. Build and upload firmware
cd robot/firmware/zip_robot_uno
pio run -t upload

# 2. Run the verification tests
cd tools
node serial_motor_bringup.js COM5

# 3. Run extended motion tests (slow, 0.5ft radius safe)
node serial_motor_bringup.js COM5 --motion-only

# 4. Run hardware smoke test
node hardware_smoke.js COM5
```

---

## Board Profile

This firmware is **LOCKED** to a specific hardware stack. Do not attempt to run on different hardware without modifying the board header.

**Profile String:**
```
ELEGOO UNO R3 Car V2.0 + SmartCar-Shield-v1.1 (TB6612FNG V1_20230201)
```

**Profile Hash:** `ELGV11TB`

**Hardware Stack:**
| Component | Specification |
|-----------|---------------|
| MCU | ELEGOO UNO R3 (ATmega328P) |
| Shield | ELEGOO SmartCar-Shield-v1.1 |
| Motor Driver | TB6612FNG dual H-bridge |
| Kit Version | V1_20230201 (2023+) |
| IMU | MPU6050 @ I2C 0x68 |

**Compile-Time Guard:**
The board header will `#error` if the target is not Arduino UNO (ATmega328P).

---

## Verified From Shield Labels

These pin assignments are **verified from silkscreen labels** visible on the actual shield hardware. Do not change without photographic evidence.

### Ultrasonic Header
**Silkscreen:** `"+5V 13 12 GND"`
```
Pin Order (left to right): +5V, D13 (Trig), D12 (Echo), GND
```

### Servo Header
**Silkscreen:** `"GND +5V 10"`
```
Pin Order (left to right): GND, +5V, D10 (Signal)
```

### Line Tracking Header
**Silkscreen:** `"GND +5V A2 A1 A0"`
```
Pin Order (left to right): GND, +5V, A2 (Left), A1 (Middle), A0 (Right)
```

### Power Input Header
**Silkscreen:** `"GND / Vin"`
```
Battery input feeds VIN rail
Battery monitor via voltage divider on A3
```

### Mode Button
```
D2 (INT0 capable)
```

---

## Hardware Configuration

### Motor Driver: TB6612FNG

This firmware is configured for the **ELEGOO SmartCar Shield v1.1 (V1_20230201)** which uses the **Toshiba TB6612FNG** dual H-bridge motor driver IC.

**Key features:**
- **STBY pin on D3** - Must be HIGH to enable motor output
- **Same direction polarity** - Both motors use HIGH=forward, LOW=reverse
- **Compatible with kits dated 2023.02.01** (check your kit date)

**Kit Variants:**
| Kit Version | Motor Driver | STBY Pin | AIN_1 | BIN_1 |
|-------------|--------------|----------|-------|-------|
| V1_20230201 (2023+) | **TB6612FNG** | **D3** | D7 | D8 |
| V0_20210120 (older) | DRV8835 | None | D8 | D7 |

⚠️ **If motors don't move**, check your kit date and verify you have the correct driver configured.

### IMU: MPU6050 (GY-521 Module)

- I2C Address: `0x68`
- Polling rate: 10Hz (in `task_sensors_slow`)
- Non-blocking I2C reads (14 bytes per update)
- Gyro calibration on startup (50 samples)

### Pin Mapping Source

All pin definitions are in `include/board/board_elegoo_uno_smartcar_shield_v11.h` - the single source of truth for hardware configuration.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Main Loop (1ms)                          │
│  ┌──────────────┬──────────────┬──────────────┬──────────────┐  │
│  │  Scheduler   │  Serial RX   │  Watchdog    │  TX Flush    │  │
│  └──────────────┴──────────────┴──────────────┴──────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
          ┌───────────────────┼───────────────────┐
          ▼                   ▼                   ▼
┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐
│ task_control_loop│ │ task_sensors_slow│ │ task_protocol_rx │
│     (50 Hz)      │ │     (10 Hz)      │ │    (1 kHz)       │
├──────────────────┤ ├──────────────────┤ ├──────────────────┤
│ motionController │ │ ultrasonic       │ │ JSON Parser      │
│ macroEngine      │ │ batteryMonitor   │ │ Command Router   │
│                  │ │ lineSensor       │ │                  │
│                  │ │ imu (MPU6050)    │ │                  │
└──────────────────┘ └──────────────────┘ └──────────────────┘
          │
          ▼
┌──────────────────┐
│   Motor Driver   │
│   (TB6612FNG)    │
└──────────────────┘
```

### Core Components

| Component | File | Description |
|-----------|------|-------------|
| **Board Config** | `include/board/board_elegoo_uno_smartcar_shield_v11.h` | Pin definitions (single source of truth) |
| **Scheduler** | `src/core/scheduler.cpp` | Cooperative task scheduler |
| **Motor Driver** | `src/hal/motor_tb6612.cpp` | TB6612FNG PWM control |
| **IMU** | `src/hal/imu_mpu6050.cpp` | MPU6050 gyro/accel driver |
| **Motion Controller** | `src/motion/motion_controller.cpp` | Setpoint tracking |
| **Macro Engine** | `src/motion/macro_engine.cpp` | Predefined motion sequences |
| **Frame Parser** | `src/serial/frame_parser.cpp` | JSON command parsing |
| **JSON Protocol** | `src/serial/json_protocol.cpp` | Response formatting |

---

## Subsystem Configuration

### Enabled Subsystems ✅

| Subsystem | Init | Task | RAM Impact | Description |
|-----------|------|------|------------|-------------|
| `motorDriver` | ✅ | control_loop | baseline | TB6612FNG motor control |
| `imu` | ✅ | sensors_slow | ~60 bytes | MPU6050 gyro/accel (10Hz) |
| `batteryMonitor` | ✅ | sensors_slow | minimal | ADC battery voltage |
| `servoPan` | ✅ | - | minimal | Pan servo (Servo lib) |
| `ultrasonic` | ✅ | sensors_slow | minimal | HC-SR04 distance |
| `lineSensor` | ✅ | sensors_slow | minimal | 3x IR line detect |
| `modeButton` | ✅ | - | minimal | Digital input |
| `motionController` | ✅ | control_loop | minimal | Setpoint tracking |
| `macroEngine` | ✅ | control_loop | minimal | Motion macros |
| `driveSafety` | ✅ | control_loop | ~30 bytes | Battery-aware drive limiting |
| `initSequence` | ✅ | control_loop | ~20 bytes | Boot-time hardware validation |

### Disabled/Removed Subsystems

| Subsystem | Reason | RAM Saved |
|-----------|--------|-----------|
| `ArduinoJson` | Replaced with lightweight fixed-field scanner | ~600 bytes |
| `statusLED` | FastLED library uses ~96 bytes RAM + heavy stack usage | ~100 bytes |
| `commandHandler` | Legacy ELEGOO runtime (intentionally removed) | varies |

### Task Configuration

| Task | Frequency | Enabled | Purpose |
|------|-----------|---------|---------|
| `task_control_loop` | 50 Hz | ✅ | Motion/macro updates |
| `task_sensors_fast` | 50 Hz | ✅ | Reserved for future use |
| `task_sensors_slow` | 10 Hz | ✅ | Ultrasonic, battery, line sensor, IMU |
| `task_protocol_rx` | 1 kHz | ✅ | Serial command processing |
| `task_telemetry` | 0 Hz | ❌ | Disabled (causes TX floods) |

---

## Building & Uploading

### Prerequisites

- [PlatformIO](https://platformio.org/) (CLI or VSCode extension)
- [Node.js](https://nodejs.org/) 18+ (for test scripts)
- Arduino UNO connected via USB

### Build Commands

```bash
# Navigate to firmware directory
cd robot/firmware/zip_robot_uno

# Build firmware (production, size-optimized)
pio run

# Build and upload
pio run -t upload

# Upload to specific port
pio run -t upload --upload-port COM5

# Check memory usage
pio run -v | grep -E "RAM|Flash"

# Clean build
pio run -t clean

# Monitor serial (115200 baud)
pio device monitor -b 115200
```

### Build Environments

| Environment | Optimization | Debug Symbols | Use Case |
|-------------|--------------|---------------|----------|
| `uno` | `-Os` (size) | No | Production |
| `uno_debug` | `-O0` (none) | Yes | Debugging |

### Expected Build Output

```
RAM:   [======    ]  59.0% (used 1208 bytes from 2048 bytes)
Flash: [=======   ]  68.3% (used 22016 bytes from 32256 bytes)
```

✅ **RAM Headroom**: Still plenty of stack space for servo operations and function calls.

### Expected Boot Output

```
HW:ELGV11TB imu=1 batt=7400
R
INIT:done batt=7400 imu=1 yaw=12
```

The init sequence runs motor pulses to validate drivetrain (~1.7 seconds).

---

## Testing

### Test Scripts

| Script | Language | Purpose |
|--------|----------|---------|
| `tools/serial_motor_bringup.js` | Node.js | Motor/motion tests |
| `tools/hardware_smoke.js` | Node.js | Quick hardware validation |
| `tools/drive_calibrate.js` | Node.js | Interactive deadband calibration |
| `tools/serial_motion_test.js` | Node.js | Extended motion validation |
| `test_servo_rotation.py` | Python | Servo control tests |

**Note**: Test scripts wait ~3.5 seconds after port open for the init sequence to complete.

### Motor Test: `serial_motor_bringup.js`

A comprehensive Node.js test tool for verifying motor functionality.

#### Installation

```bash
cd robot/firmware/zip_robot_uno/tools
npm install serialport
```

#### Usage

```bash
# Full test suite (motors + sensors + servo + macros)
node serial_motor_bringup.js COM5

# Quick test (basic motor control only - 3 cycles)
node serial_motor_bringup.js COM5 --quick

# Extended motion tests only (safe for desktop - 0.5ft radius)
node serial_motor_bringup.js COM5 --motion-only
```

### Hardware Smoke Test: `hardware_smoke.js`

Quick validation that all hardware responds correctly.

```bash
node hardware_smoke.js COM5
```

Tests:
1. N=0 Hello → expect `{H_ok}`
2. N=120 Diagnostics → expect `{...hw:ELGV11TB...}`
3. N=23 Battery → expect `{H_<4000-9000>}` (mV)
4. N=21 Ultrasonic → expect `{H_<0-400>}` (cm)
5. N=22 Line sensors → expect `{H_<0-1023>}` (analog)
6. N=5 Servo → expect `{H_ok}`
7. N=201 Stop → expect `{H_ok}`

Exit code 0 = all pass, 1 = any failure.

### Servo Test: `test_servo_rotation.py`

Python test script for verifying servo control via N=5 JSON protocol.

#### Usage

```bash
cd robot/firmware/zip_robot_uno

# Run full servo test suite
python test_servo_rotation.py --port COM5 --all

# Set servo to specific angle
python test_servo_rotation.py --port COM5 --angle 90

# Run sweep test only
python test_servo_rotation.py --port COM5 --sweep

# List available serial ports
python test_servo_rotation.py --list-ports
```

#### Test Modes

| Mode | Flag | Description |
|------|------|-------------|
| **All** | `--all` | Edge cases + sweep + rapid moves |
| **Single** | `--angle 90` | Set to specific angle |
| **Sweep** | `--sweep` | 0° → 180° → 0° sweep |

#### Test Phases (Full Mode)

| # | Phase | Tests | Description |
|---|-------|-------|-------------|
| 1 | Basic Motor | 3 | Forward pulse, stop verify |
| 2 | Forward/Backward | 6 | Creep, slow, medium speeds |
| 3 | Pivot Turns | 6 | Spin in place L/R |
| 4 | Arc Turns | 6 | Wide/tight curves |
| 5 | Wiggle | 4 | Rapid side-to-side |
| 6 | Gradual Speed | 8 | Ramp up/down |
| 7 | Setpoint Stream | 25 | N=200 streaming |
| 8 | Complex Patterns | 12 | Figure-8, box pattern |
| 9 | Servo | 7 | Pan angles 45°-135° |
| 10 | Sensors | 4 | Ultrasonic, line sensors |
| 11 | Macros | 2 | Start/cancel macro |

#### Motion Speed Settings (Desktop Safe)

```javascript
const CREEP_PWM = 60;       // Very slow
const SLOW_PWM = 80;        // Slow  
const MEDIUM_PWM = 100;     // Medium slow
const MICRO_DURATION = 200; // 200ms movements
const SHORT_DURATION = 400; // 400ms movements
```

#### Expected Output

```
════════════════════════════════════════════════════════════
TEST SUMMARY
════════════════════════════════════════════════════════════
Total responses: 93

Test Phase            Passed  Failed  Status
────────────────────────────────────────────────────────────
Motor Direct                3       0  ✓ PASS
Motor Stop                  3       0  ✓ PASS
Forward/Backward            6       0  ✓ PASS
Pivot Turns                 6       0  ✓ PASS
Arc Turns                   6       0  ✓ PASS
Wiggle                      1       0  ✓ PASS
Gradual Speed               1       0  ✓ PASS
Setpoint Stream             1       0  ✓ PASS
────────────────────────────────────────────────────────────

✓ All tests passed!
```

#### Log Output

All test output is logged to:
```
<project>/.cursor/debug.log
```

Format: NDJSON (one JSON object per line)

---

## Protocol Reference

### Baud Rate: 115200

### Command Format

```json
{"N":<command>,"H":"<tag>","D1":<val1>,"D2":<val2>,"T":<ttl>}
```

### Core Commands

| N | Command | Parameters | Response | Description |
|---|---------|------------|----------|-------------|
| 0 | Hello | - | `{hello_ok}` | Handshake/ping |
| 5 | Servo | D1=angle | `{H_ok}` | Pan servo control (0-180°) |
| 21 | Ultrasonic | D1=mode | `{H_<value>}` | Distance/obstacle sensor |
| 22 | Line Sensor | D1=sensor | `{H_<value>}` | IR line sensor (L/M/R) |
| 23 | Battery | - | `{H_<mV>}` | Battery voltage |
| 120 | Diagnostics | - | `{<state>...}` | Debug state dump (includes safety layer) |
| 130 | Re-run Init | - | `{H_ok}` | Re-run initialization sequence |
| 140 | Set Config | D1=param, D2=val | `{H_ok}` | Set drive safety config |
| 200 | Setpoint | D1=v, D2=w, T=ttl | (none) | Streaming motion |
| 201 | Stop | - | `{H_ok}` | Immediate stop (preempts everything) |
| 210 | Macro Start | D1=id | `{H_ok}` | Start macro |
| 211 | Macro Cancel | - | `{H_ok}` | Cancel macro |
| 999 | Direct Motor | D1=L, D2=R | `{H_ok}` | Raw PWM control (through safety layer) |

### Sensor Commands (N=21-23)

These commands return actual sensor values in the response.

| N | Command | Parameters | Response | Description |
|---|---------|------------|----------|-------------|
| 21 | Ultrasonic | D1=1 | `{H_true/false}` | Obstacle detection (≤20cm) |
| 21 | Ultrasonic | D1=2 | `{H_<distance>}` | Distance in cm (0-400) |
| 22 | Line Sensor | D1=0 | `{H_<value>}` | Left sensor (0-1023) |
| 22 | Line Sensor | D1=1 | `{H_<value>}` | Middle sensor (0-1023) |
| 22 | Line Sensor | D1=2 | `{H_<value>}` | Right sensor (0-1023) |
| 23 | Battery | - | `{H_<voltage_mv>}` | Battery voltage in mV |

**Examples:**
```json
// Ultrasonic distance
{"N":21,"H":"ultra","D1":2}  →  {ultra_42}   // 42cm

// Ultrasonic obstacle detection
{"N":21,"H":"obs","D1":1}    →  {obs_false}  // No obstacle

// Line sensor (middle)
{"N":22,"H":"line1","D1":1}  →  {line1_512}  // Analog value

// Battery voltage
{"N":23,"H":"batt"}          →  {batt_7400}  // 7.4V
```

### Diagnostics Response (N=120)

```
{<owner><L>,<R>,<state>,<resets>,hw:<hash>,imu:<0/1>,ram:<free>,min:<min>,batt:<mV>,b:<state>,cap:<max>,db:<L>/<R>,ramp:<a>/<d>,kick:<0/1>,init:<state>}
{stats:rx=<rx>,jd=<jd>,pe=<pe>,tx=<tx>,ms=<ms>}
```

| Field | Values | Description |
|-------|--------|-------------|
| owner | `I`=Idle, `D`=Direct, `M`=Motion, `X`=Stopped | Motion owner |
| L, R | -255 to 255 | Current PWM values |
| state | 0-4 | Motion controller state |
| resets | 0+ | Reset counter |
| hw | `ELGV11TB` | Hardware profile hash |
| imu | 0/1 | IMU initialization status |
| ram | bytes | Current free RAM |
| min | bytes | Minimum observed free RAM |
| batt | mV | Battery voltage in millivolts |
| b | 0/1/2 | Battery state (0=OK, 1=LOW, 2=CRIT) |
| cap | 0-255 | Current max PWM cap |
| db | L/R | Deadband values (left/right) |
| ramp | a/d | Ramp steps (accel/decel per tick) |
| kick | 0/1 | Kickstart enabled |
| init | 0-3 | Init state (0=pending, 1=running, 2=done, 3=warn) |

### Drive Config Command (N=140)

Set runtime drive safety parameters:

| D1 | Parameter | D2 Value |
|----|-----------|----------|
| 1 | Deadband | High byte=Left, Low byte=Right (0-255 each) |
| 2 | Ramp Accel Step | 0-50 (PWM per tick) |
| 3 | Ramp Decel Step | 0-50 (PWM per tick) |
| 4 | Kickstart Enable | 0=off, 1=on |
| 5 | Max PWM Cap | 0-255 |

**Example:**
```json
{"N":140,"H":"cfg","D1":1,"D2":14135}  // Set deadband L=55, R=55 (55<<8|55)
{"N":140,"H":"cfg","D1":4,"D2":0}      // Disable kickstart
```

### Direct Motor Control (N=999)

```json
{"N":999,"H":"tag","D1":180,"D2":180}
```

- D1: Left motor PWM (-255 to 255, negative=reverse)
- D2: Right motor PWM (-255 to 255, negative=reverse)
- Bypasses all motion control, directly sets pins
- Automatically enables STBY pin (TB6612FNG)

### Servo Control (N=5)

```json
{"N":5,"H":"tag","D1":90}
```

- D1: Servo angle (0-180 degrees)
- Controls the pan servo on pin 10
- Uses official Elegoo pulse width calibration (500μs-2400μs)
- Re-attaches servo before each write for reliability

**Examples:**
```json
{"N":5,"D1":0}     // Pan full left
{"N":5,"D1":90}    // Pan center
{"N":5,"D1":180}   // Pan full right
```

**Test Script:**
```bash
# Run servo rotation test
python test_servo_rotation.py --port COM5 --all
```

### Setpoint Streaming (N=200)

```json
{"N":200,"D1":100,"D2":30,"T":200}
```

- D1: Forward velocity (-255 to 255)
- D2: Yaw/turn rate (-255 to 255)
- T: Time-to-live in ms (150-300 typical)
- Fire-and-forget (no response)
- Stream at 10-20Hz for smooth motion

---

## Pin Mapping

### Motor Driver (TB6612FNG)

| Function | Pin | Silkscreen | Notes |
|----------|-----|------------|-------|
| Motor A (Right) PWM | D5 | - | `PIN_MOTOR_PWMA` |
| Motor B (Left) PWM | D6 | - | `PIN_MOTOR_PWMB` |
| Motor A (Right) Direction | D7 | - | `PIN_MOTOR_AIN_1` |
| Motor B (Left) Direction | D8 | - | `PIN_MOTOR_BIN_1` |
| **STBY (Standby)** | **D3** | - | **Must be HIGH to enable motors!** |

**Direction Control Logic (TB6612FNG):**
- Motor A (Right): Forward = AIN_1 HIGH, Reverse = AIN_1 LOW
- Motor B (Left): Forward = BIN_1 HIGH, Reverse = BIN_1 LOW
- Note: Both motors use same polarity (HIGH=forward)

### IMU (MPU6050)

| Function | Pin | Notes |
|----------|-----|-------|
| SDA | A4 | I2C data |
| SCL | A5 | I2C clock |
| Address | 0x68 | Default MPU6050 address |

### Sensors & Peripherals

| Function | Pin | Silkscreen | Notes |
|----------|-----|------------|-------|
| Servo Pan (Z) | D10 | `"GND +5V 10"` | Horizontal pan, 0-180° |
| Servo Tilt (Y) | D11 | - | Vertical tilt (not impl.) |
| Ultrasonic Trig | D13 | `"+5V 13 12 GND"` | HC-SR04 |
| Ultrasonic Echo | D12 | `"+5V 13 12 GND"` | HC-SR04 |
| Line Sensor L | A2 | `"GND +5V A2 A1 A0"` | ITR20001 |
| Line Sensor M | A1 | `"GND +5V A2 A1 A0"` | ITR20001 |
| Line Sensor R | A0 | `"GND +5V A2 A1 A0"` | ITR20001 |
| Battery Monitor | A3 | - | Voltage divider |
| Mode Button | D2 | - | Interrupt capable |
| RGB LED | D4 | - | WS2812 (disabled) |
| IR Receiver | D9 | - | (not used in ZIP firmware) |

---

## RAM Constraints & Lessons Learned

### Arduino UNO Limitations

- **Total RAM**: 2048 bytes
- **Safe Limit for basic commands**: ~85% (1740 bytes)
- **Safe Limit for servo control**: ~75% (1536 bytes) - servo.attach() needs stack space
- **Current Usage**: 59.0% (1208 bytes) ✅

✅ **RAM Optimized**: TB6612FNG driver + IMU + Drive Safety Layer + Init Sequence still well under 75% threshold.

### What Uses RAM

| Component | Approx. RAM | Notes |
|-----------|-------------|-------|
| Serial buffers | 128 bytes | TX + RX |
| Frame parser | ~80 bytes | Lightweight fixed-field scanner |
| Scheduler | ~50 bytes | 4 task slots |
| Motor driver | ~20 bytes | State + config |
| IMU | ~60 bytes | Calibration offsets + yaw |
| Sensors | ~30 bytes | Cached values |
| Drive Safety | ~30 bytes | Config + state machine |
| Init Sequence | ~20 bytes | State + warn bits |
| Stack | ~660 bytes | **Available** for function calls |

### What Broke (and Why) - All Fixed ✅

| Issue | Symptom | Cause | Solution |
|-------|---------|-------|----------|
| **ArduinoJson** | 83%+ RAM, servo failures | StaticJsonDocument + library overhead | ✅ Replaced with fixed-field scanner |
| **FastLED** | Watchdog resets | +96 bytes RAM + stack | ✅ Disabled statusLED |
| **Wrong motor driver** | Motors didn't move | Initially configured for DRV8835, but kit has TB6612FNG | ✅ Added STBY pin (D3) support |
| **Wrong pin mapping** | Motors didn't move | AIN_1/BIN_1 pins swapped between DRV8835/TB6612 | ✅ Corrected to AIN_1=D7, BIN_1=D8 |
| **Verbose debug** | Resets mid-command | F() strings still use RAM | ✅ Minimal logging |

### Best Practices

1. **Never use `String`** - Use `char[]` with fixed sizes
2. **Use `F()` sparingly** - Still consumes RAM at runtime
3. **Minimize debug output** - Serial.print() uses stack
4. **Keep RAM under 75%** - Leave room for stack + servo
5. **Test after each subsystem enable** - Find RAM issues early
6. **Use board header** - Single source of truth for pins

---

## Troubleshooting

### Motors Don't Move

1. Verify N=999 command is acknowledged (`{H_ok}`)
2. Check diagnostics: `{"N":120}` - should show `{D<pwm>,...}`
3. Verify battery voltage is adequate (N=23 should show >7000mV)
4. **TB6612FNG requires STBY=HIGH** - firmware sets D3 HIGH on motor commands
5. Check if your kit uses TB6612FNG (2023+) or DRV8835 (older) - pin mapping differs!

### Motors Don't Stop

1. Send `{"N":201}` and check for `{H_ok}`
2. Check diagnostics shows `{X0,0,...}`
3. Ensure control loop is running (50Hz)

### No Serial Response

1. Verify baud rate is 115200
2. Check for boot output: `HW:ELGV11TB imu=1 batt=XXXX` then `R`
3. Reduce command rate (max 50/sec)
4. Check TX buffer isn't full

### Watchdog Resets (repeated `R`)

1. Check RAM usage (<75%)
2. Remove debug print statements
3. Ensure no blocking operations
4. Verify all tasks complete quickly

### IMU Not Working

1. Check diagnostics N=120 shows `imu:1`
2. Verify I2C wiring (SDA=A4, SCL=A5)
3. Check MPU6050 module is powered (3.3V or 5V)
4. If `imu:0`, the MPU6050 was not detected at startup

### Test Script Fails

1. Ensure correct COM port
2. Wait for init sequence (~3.5 seconds after port open)
3. Check Node.js serialport installed
4. Verify firmware is uploaded
5. Check for `INIT:done` or `INIT:warn` in boot output

### Init Sequence Issues

1. **Motors pulse on boot**: Normal - init validates drivetrain with short pulses
2. **`INIT:warn` with `batt_low`**: Battery voltage below 7000mV, reduced PWM used
3. **`INIT:warn` with `imu_missing`**: MPU6050 not detected at I2C 0x68
4. **`INIT:warn` with `imu_no_motion`**: IMU detected but yaw didn't change during spins
5. **Init takes >3 seconds**: Check for serial congestion, reduce debug output

### Servo Doesn't Move

**Quick Checks:**
1. Verify servo signal wire connected to pin 10
2. Check servo has 5V power (red wire)
3. Check servo ground connected to Arduino GND
4. Send test command: `{"N":5,"D1":90}`
5. Run servo test: `python test_servo_rotation.py --port COM5 --angle 90`

**Hardware Issues:**
- Check servo physically connected and powered
- Verify pin 10 is not damaged
- Try a known-good servo

---

## Version History

### v2.8.0 (January 2026) - Current
- **Drive Safety Layer**: Battery-aware motion control
  - Battery state detection: OK (≥7400mV), LOW (7000-7399mV), CRIT (<7000mV)
  - Dynamic PWM cap reduction in LOW/CRIT states
  - PWM deadband compensation (configurable per motor, default 55)
  - Slew-rate limiting with asymmetric accel/decel ramping
  - Optional kickstart pulse for overcoming static friction
  - All motor outputs (N=200, N=999) go through safety layer
- **Init Sequence**: Non-blocking boot-time hardware validation (~1.7s)
  - TB6612 STBY setup
  - Servo center (90°)
  - Sensor smoke checks (battery, ultrasonic, line sensors, IMU)
  - Motor direction pulses (forward, reverse, spin L/R)
  - IMU response check during spins
  - Status: `INIT:done/warn batt=<mV> imu=<0/1> yaw=<delta>`
- **New commands**:
  - N=130: Re-run init sequence
  - N=140: Set drive config (deadband, ramp, kickstart, PWM cap)
- **Enhanced diagnostics (N=120)**: Now includes batt, b, cap, db, ramp, kick, init fields
- **New tool**: `tools/drive_calibrate.js` - Interactive deadband calibration
- **Test timing**: All tools now wait 3.5s after port open for init sequence
- **RAM**: 59.0% (1208 bytes)
- **Flash**: 68.3% (22016 bytes)

### v2.7.0 (January 2026)
- **Board-correct by construction**: Firmware locked to verified hardware stack
  - New canonical board header: `board_elegoo_uno_smartcar_shield_v11.h`
  - MCU guard: `#error` if not ATmega328P
  - Hardware profile string and hash for diagnostics
  - Silkscreen-verified pin assignments documented
- **Motor driver renamed**: Files renamed from DRV8835 to TB6612
  - `motor_tb6612.h/.cpp` (was `motor_driver_drv8835.h/.cpp`)
  - Class renamed to `MotorDriverTB6612`
- **Boot-time hardware validation**: 
  - Prints `HW:<hash> imu=<0/1> batt=<mV>` on startup
  - Warns if battery or ultrasonic out of range
- **Enhanced diagnostics**: N=120 now includes `hw:ELGV11TB` profile hash
- **RAM**: ~57% (unchanged)

### v2.6.0 (January 2026)
- **TB6612FNG motor driver support**: Corrected for V1_20230201 kit
  - Added STBY pin support (D3 - must be HIGH to enable motors)
  - Fixed pin mapping: AIN_1=D7, BIN_1=D8
  - Correct direction logic: both motors use HIGH=forward
- **RAM**: 57.1% (1170 bytes)
- **Flash**: 54.6% (17620 bytes)
- All motion tests passing

### v2.5.0 (January 2026)
- **Initial DRV8835 attempt**: Refactored for SmartCar Shield v1.1
  - Created board header: `include/board/board_elegoo_v4_uno_v11.h`
  - Issue: Motors didn't move (wrong driver for hardware)
- **MPU6050 IMU enabled**: 10Hz polling in sensors_slow task
  - Non-blocking I2C reads
  - Gyro calibration on startup
  - IMU status in N=120 diagnostics
- Backward compatible with existing test tools

### v2.4.0 (January 2026)
- **Major RAM reduction**: 83.7% → 51.6% (saves ~660 bytes)
- **ArduinoJson removed**: Replaced with lightweight fixed-field scanner
  - No external JSON library dependency
  - Fixed-field parsing for ELEGOO protocol (N, H, D1-D4, T)
  - Saves 96+ bytes stack per parse + library overhead
- **Servo control now working**: RAM well under 75% threshold
- **Flash reduced**: 71.9% → 47.1%
- All motion tests passing

### v2.3.0 (January 2026)
- **Servo control uses exact ELEGOO pattern**: attach → write → delay(450) → detach
- Known Issue (Fixed in v2.4.0): Servo commands failed at 83% RAM

### v2.2.0 (January 2026)
- **Sensor commands now return actual values** (matching official ELEGOO protocol)
- N=21: Ultrasonic returns distance in cm or obstacle detection status
- N=22: Line sensors return analog values (0-1023)
- N=23: Battery voltage command added (returns mV)
- Updated test scripts to validate sensor values

### v2.1.0 (January 2026)
- **Added N=5 servo control** via JSON protocol
- Fixed servo HAL to match official Elegoo pattern (re-attach before write)
- Added pulse width calibration (500μs-2400μs)
- New `test_servo_rotation.py` test script
- RAM reduced to 82.7% (from 83.9%)

### v2.0.0 (January 2026)
- Complete motion control refactor
- Removed legacy ELEGOO runtime handlers
- Single motor ownership model
- Comprehensive test suite
- RAM optimization (96% → 84%)

### v1.0.0 (Initial)
- Basic ELEGOO compatibility
- Dual protocol support
- Self-test on boot

---

## License

MIT License - See LICENSE file for details.

## References

- [ELEGOO Smart Robot Car V4.0](https://www.elegoo.com)
- [TB6612FNG Datasheet](https://www.sparkfun.com/datasheets/Robotics/TB6612FNG.pdf)
- [MPU6050 Datasheet](https://invensense.tdk.com/products/motion-tracking/6-axis/mpu-6050/)
- [PlatformIO Documentation](https://docs.platformio.org/)
- [Arduino UNO Pinout](https://www.arduino.cc/en/Reference/Board)
