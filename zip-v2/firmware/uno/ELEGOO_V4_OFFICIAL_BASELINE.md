# ELEGOO Smart Robot Car V4.0 - Official Protocol Baseline

This document captures the official ELEGOO protocol patterns from the V1_20230201 (TB6612 & MPU6050) firmware, which serves as the source of truth for our Zip motion layer compatibility.

## Source

- **Package**: ELEGOO Smart Robot Car Kit V4.0 2023.02.01
- **Variant**: TB6612 & MPU6050 (SmartRobotCarV4.0_V1_20230201)
- **Files Analyzed**: `ApplicationFunctionSet_xxx0.cpp`, `DeviceDriverSet_xxx0.cpp`, `.ino`

---

## Serial Communication

### Baud Rate

| Parameter | Official Value | Zip Value | Notes |
|-----------|---------------|-----------|-------|
| Baud Rate | **9600** | **115200** | Zip uses faster baud for motion control throughput |

**Important**: The official firmware uses 9600 baud (`Serial.begin(9600)`). The Zip layer intentionally uses 115200 for higher command throughput suitable for drive-by-wire control at 20Hz+.

### Watchdog Timer

| Parameter | Official Value | Zip Value |
|-----------|---------------|-----------|
| Timeout | `WDTO_2S` (2 seconds) | `WDTO_8S` (8 seconds) |

---

## JSON Command Format

### Input Format

```json
{"N":<number>,"H":"<header>","D1":<value>,"D2":<value>,"D3":<value>,"D4":<value>,"T":<timer_ms>}
```

- **N**: Command number (integer, required)
- **H**: Command header/serial number (string, used in responses)
- **D1-D4**: Data parameters (integers, optional, default 0)
- **T**: Timer/TTL in milliseconds (unsigned long, optional)

### Frame Terminator

- **Official**: Waits for `}` character to complete frame
- **No newline required**: Official parser reads until `}` then parses

### JSON Buffer Size

- **Official**: `StaticJsonDocument<200>`
- **Zip**: `StaticJsonDocument<80>` (RAM optimized for simple commands)

---

## Response Format

### Response Patterns

| Type | Format | Example | Notes |
|------|--------|---------|-------|
| OK | `{H_ok}` | `{cmd123_ok}` | No newline in official |
| True | `{H_true}` | `{cmd123_true}` | Boolean true response |
| False | `{H_false}` | `{cmd123_false}` | Boolean false response |
| Value | `{H_value}` | `{cmd123_50}` | Numeric value response |
| Generic OK | `{ok}` | `{ok}` | Used for some commands |

**Note**: Official firmware uses `Serial.print()` without trailing newline. Zip layer adds `\n` for cleaner host parsing.

---

## Command Reference (Official N Values)

### Mode Control Commands

| N | Command | Parameters | Response | Description |
|---|---------|------------|----------|-------------|
| 100 | Standby Mode | - | `{ok}` | Clear all, enter standby |
| 101 | Mode Switch | D1=mode | `{ok}` | 1=Track, 2=Obstacle, 3=Follow |
| 102 | Rocker Control | D1=dir, D2=speed | (none) | Direction + speed |
| 105 | LED Brightness | D1=dir | - | 1=up, 2=down |
| 106 | Servo Preset | D1=preset | `{ok}` | Preset positions |
| 110 | Programming Mode | - | `{H_ok}` | Clear all, programming mode |

### Motor/Car Control Commands

| N | Command | Parameters | Response | Description |
|---|---------|------------|----------|-------------|
| 1 | Motor Control | D1=motor, D2=speed, D3=dir | `{H_ok}` | Individual motor |
| 2 | Car Time-Limited | D1=dir, D2=speed, T=timer | (delayed) | Timed movement |
| 3 | Car No-Time-Limit | D1=dir, D2=speed | `{H_ok}` | Continuous movement |
| 4 | Motor Speed | D1=left, D2=right | `{H_ok}` | Dual motor speed |

### Servo/Lighting Commands

| N | Command | Parameters | Response | Description |
|---|---------|------------|----------|-------------|
| 5 | Servo Control | D1=servo, D2=angle | `{H_ok}` | Servo position |
| 7 | Lighting Time | D1=seq, D2-D4=RGB, T=timer | (delayed) | Timed RGB |
| 8 | Lighting NoTime | D1=seq, D2-D4=RGB | `{H_ok}` | Continuous RGB |

### Sensor Query Commands

| N | Command | Parameters | Response | Description |
|---|---------|------------|----------|-------------|
| 21 | Ultrasonic | D1=mode | `{H_true/false/value}` | 1=status, 2=distance |
| 22 | Tracking | D1=sensor | `{H_value}` | 0=left, 1=middle, 2=right |
| 23 | Ground Check | - | `{H_true/false}` | Car on ground? |

---

## Direction Values (Rocker/Car Control)

| Value | Direction |
|-------|-----------|
| 1 | Forward |
| 2 | Backward |
| 3 | Left (turn) |
| 4 | Right (turn) |
| 5 | Left-Forward (arc) |
| 6 | Left-Backward (arc) |
| 7 | Right-Forward (arc) |
| 8 | Right-Backward (arc) |
| 9 | Stop |

---

## Mode Semantics

### Functional Modes (enum SmartRobotCarFunctionalModel)

| Mode | Name | Description |
|------|------|-------------|
| 0 | `Standby_mode` | Idle, motors stopped |
| 1 | `TraceBased_mode` | Line tracking |
| 2 | `ObstacleAvoidance_mode` | Autonomous obstacle avoidance |
| 3 | `Follow_mode` | Follow object |
| 4 | `Rocker_mode` | Remote joystick control |
| 5 | `CMD_inspect` | Debug/inspection |
| 6 | `CMD_Programming_mode` | Waiting for commands |
| 7+ | Various CMD modes | Command execution states |

### Mode Transitions

1. **N=100**: Force to `Standby_mode`, stop all, clear RGB
2. **N=110**: Force to `CMD_Programming_mode`, stop all, clear RGB
3. **N=101 with D1=1-3**: Switch to Track/Obstacle/Follow mode
4. **N=102 with D1=9**: Back to `Standby_mode` (stop command)

---

## Pin Mapping (TB6612 Variant)

### Motor Driver (TB6612FNG)

| Function | Pin | Notes |
|----------|-----|-------|
| STBY | 3 | Standby (HIGH = enabled) |
| AIN1 | 7 | Motor A direction 1 |
| AIN2 | 6 | Motor A direction 2 |
| PWMA | 5 | Motor A PWM |
| BIN1 | 4 | Motor B direction 1 |
| BIN2 | 2 | Motor B direction 2 |
| PWMB | 9 | Motor B PWM |

### Motor Direction Control

```cpp
// Forward (direction_just)
direction_A = HIGH, direction_B = LOW  // Motor A
direction_A = HIGH, direction_B = LOW  // Motor B

// Backward (direction_back)
direction_A = LOW, direction_B = HIGH  // Motor A
direction_A = LOW, direction_B = HIGH  // Motor B

// Stop (direction_void)
direction_A = LOW, direction_B = LOW   // Both LOW = coast
// OR direction_A = HIGH, direction_B = HIGH  // Both HIGH = brake
```

### Servo

| Function | Pin |
|----------|-----|
| Pan Servo | 10 |
| Tilt Servo | 11 |

### Sensors

| Sensor | Pin(s) | Notes |
|--------|--------|-------|
| Ultrasonic Trig | A2 | HC-SR04 |
| Ultrasonic Echo | A3 | HC-SR04 |
| Line Tracking L | A0 | ITR20001 |
| Line Tracking M | A1 | ITR20001 |
| Line Tracking R | A4 | ITR20001 |
| Voltage Divider | A5 | Battery voltage |
| RGB LED | 13 | WS2812 (FastLED) |

### I2C (MPU6050)

| Function | Pin |
|----------|-----|
| SDA | A4 |
| SCL | A5 |

---

## Stop Semantics

### Commands That Stop Motors

1. **N=100**: Clear all → Standby (stops motors)
2. **N=110**: Clear all → Programming (stops motors)
3. **N=102 with D1=9**: Stop direction
4. **N=1 with D3=0**: Motor stop direction
5. **N=3 with D1=0**: Car stop (implicit)
6. **N=4 with D1=0 and D2=0**: Both motors zero

### Stop Priority (Zip Layer)

The Zip motion layer adds these stop semantics:

1. **N=201**: Immediate hard stop (highest priority)
2. **Setpoint TTL expiry**: Automatic stop when no new setpoint
3. **Macro cancel (N=211)**: Stop and cancel macro
4. **Legacy stop (N=100/110)**: Override all Zip motion state

---

## Zip Layer Extensions (N=200+)

These commands extend the official protocol for drive-by-wire control:

| N | Command | Parameters | Response | Description |
|---|---------|------------|----------|-------------|
| 200 | Drive Setpoint | D1=v, D2=w, T=ttl | (none) | Fire-and-forget streaming |
| 201 | Stop Now | - | `{H_ok}` | Immediate hard stop |
| 210 | Macro Execute | D1=id, D2=intensity, T=ttl | `{H_ok}` | Start onboard macro |
| 211 | Macro Cancel | - | `{H_ok}` | Cancel running macro |
| 120 | Get Stats | - | `{stats...}` | Diagnostic counters |

### Setpoint Details (N=200)

- **D1 (v)**: Forward velocity, -255 to +255
- **D2 (w)**: Yaw rate, -255 to +255 (positive = right)
- **T**: Time-to-live in ms (150-300 recommended)
- **No response**: Fire-and-forget for streaming at 20Hz+
- **TTL expiry**: Motors auto-stop if no new setpoint within TTL

### Macro IDs (N=210)

| ID | Macro | Description |
|----|-------|-------------|
| 1 | FIGURE_8 | Figure-8 pattern |
| 2 | SPIN_360 | 360° spin in place |
| 3 | WIGGLE | Left-right wiggle |
| 4 | FORWARD_THEN_STOP | Forward then stop |

---

## Compatibility Notes

### Breaking Changes from Official

1. **Baud rate**: 115200 vs 9600 (must configure host)
2. **Response newlines**: Zip adds `\n` for easier parsing
3. **Boot message**: Zip sends `R\n`, official is silent

### Preserved Behavior

1. **N=0-199**: Route to legacy handler or acknowledge
2. **N=100/110**: Clear all functions, stop motors
3. **N=102**: Rocker direction control
4. **Response format**: `{H_ok}` pattern preserved

### Handshake Protocol (Zip Extension)

1. Host opens serial port (triggers UNO reset via DTR)
2. Wait ~600ms for bootloader
3. Firmware sends `R\n` when ready
4. Host sends: `{"N":0,"H":"hello"}\n`
5. Firmware responds: `{hello_ok}\n`
6. Communication established
