# ELEGOO Smart Robot Car V4.0 - Motion Control Documentation

## Overview

This document describes the motion control system for the ELEGOO Smart Robot Car V4.0, including pin mappings, protocol specifications, safety rules, and upload workflow.

## Hardware Configuration

### Motor Driver: TB6612FNG

**Pin Mapping:**
- `PIN_MOTOR_PWMA` (Pin 5): Left motor PWM
- `PIN_MOTOR_PWMB` (Pin 6): Right motor PWM
- `PIN_MOTOR_AIN1` (Pin 7): Left motor direction control
- `PIN_MOTOR_BIN1` (Pin 8): Right motor direction control
- `PIN_MOTOR_STBY` (Pin 3): **CRITICAL** - Standby control (must be HIGH for motors to run)

**TB6612 Enable Logic:**
- **STBY = HIGH**: Motors enabled, can receive PWM commands
- **STBY = LOW**: Motors disabled, all PWM ignored
- **Critical**: Motors will not move if STBY is LOW, regardless of PWM values

**Direction Control:**
- `AIN1 = HIGH`: Left motor forward
- `AIN1 = LOW`: Left motor reverse
- `BIN1 = HIGH`: Right motor forward
- `BIN1 = LOW`: Right motor reverse

**PWM Range:**
- Valid range: 0-255
- Deadband: 10 (minimum PWM to overcome friction)
- Ramp rate: 5 (maximum PWM change per control loop iteration)

## Communication Protocol

### Protocol Modes

The firmware supports **two protocol modes**:

1. **Binary Protocol** (0xAA 0x55 header) - Original ZIP protocol
2. **JSON Protocol** (ELEGOO-style) - New motion commands + legacy compatibility

Both protocols can be used simultaneously - the firmware auto-detects based on the first byte.

### JSON Protocol Format

**Command Format:**
```json
{"N":<command_number>,"H":"<command_id>","D1":<value>,"D2":<value>,"T":<ttl_ms>}
```

**Response Format:**
- Success: `{H_ok}`
- Failure: `{H_false}`
- True: `{H_true}`
- Value: `{H_value}`
- Generic: `{ok}`

### New Motion Commands (N=200+)

#### N=200: Drive Setpoint (Drive-by-wire)

**Purpose**: Continuous motion control at 10-30Hz

**Request:**
```json
{"N":200,"H":"cmd_setpoint","D1":<v>,"D2":<w>,"T":<ttl_ms>}
```

- `D1` (v): Forward command (-255..255)
- `D2` (w): Yaw command (-255..255)
- `T`: Time-to-live in milliseconds (150-300ms recommended)

**Behavior:**
- Applies immediately via differential mixing:
  - `left = v - k*w`
  - `right = v + k*w`
- Clamps and slew-limits (smooth ramps)
- If TTL expires → **STOP** (deadman safety)
- ACK sent on first valid setpoint only (to avoid spam)

**Example:**
```json
{"N":200,"H":"cmd_001","D1":150,"D2":0,"T":200}
```
Forward at speed 150, no yaw, 200ms TTL.

#### N=201: Stop Now

**Purpose**: Immediate stop and clear all motion states

**Request:**
```json
{"N":201,"H":"cmd_stop","D1":0,"D2":0,"T":0}
```

**Behavior:**
- Stops motion controller immediately
- Cancels any active macro
- Disables motors
- Responds with `{H_ok}`

#### N=210: Macro Execute

**Purpose**: Execute complex motion sequences without streaming many commands

**Request:**
```json
{"N":210,"H":"cmd_macro","D1":<macro_id>,"D2":<intensity>,"T":<ttl_ms>}
```

- `D1` (macro_id): 
  - `1` = FIGURE_8
  - `2` = SPIN_360
  - `3` = WIGGLE
  - `4` = FORWARD_THEN_STOP
- `D2` (intensity): 0-255 (scales macro speeds)
- `T`: Time-to-live (1000-10000ms)

**Behavior:**
- Non-blocking state machine execution
- Cancellable via N=211 or N=201
- Safe fallback if macro runs too long (TTL)

**Example:**
```json
{"N":210,"H":"cmd_002","D1":2,"D2":200,"T":5000}
```
Execute SPIN_360 macro at intensity 200, 5s TTL.

#### N=211: Macro Cancel

**Purpose**: Cancel current macro and stop

**Request:**
```json
{"N":211,"H":"cmd_cancel","D1":0,"D2":0,"T":0}
```

**Behavior:**
- Cancels active macro immediately
- Stops motors
- Responds with `{H_ok}`

### Sensor Commands (N=21..23)

The firmware returns actual sensor values matching the official ELEGOO protocol:

#### N=21: Ultrasonic Sensor

**Request:**
```json
{"N":21,"H":"ultra","D1":2}   // D1=2: Get distance in cm
{"N":21,"H":"obs","D1":1}     // D1=1: Obstacle detection (true/false)
```

**Response:**
- D1=2: `{ultra_42}` (distance in cm, 0-400)
- D1=1: `{obs_true}` or `{obs_false}` (obstacle within 20cm)

#### N=22: Line Sensor

**Request:**
```json
{"N":22,"H":"line0","D1":0}   // D1=0: Left sensor
{"N":22,"H":"line1","D1":1}   // D1=1: Middle sensor
{"N":22,"H":"line2","D1":2}   // D1=2: Right sensor
```

**Response:** `{line0_512}` (analog value 0-1023)

#### N=23: Battery Voltage

**Request:**
```json
{"N":23,"H":"batt"}
```

**Response:** `{batt_7400}` (voltage in millivolts)

### Legacy Commands (N=1..110)

The firmware preserves compatibility with ELEGOO legacy commands:

- **N=100**: Clear all functions - Enter standby mode (stops motors)
- **N=3**: Car control - D1=9 means stop
- **N=4**: Motor speed control (D1=left, D2=right, 0-255)

Other legacy commands are acknowledged but not fully implemented in MVP.

## Safety Rules

### 1. Deadman Stop (TTL)

- All N=200 setpoint commands have a TTL (time-to-live)
- If TTL expires without a new command, robot **automatically stops**
- Recommended TTL: 150-300ms for 10-30Hz update rates

### 2. Rate Limiting

- Maximum command rate: **50 commands/second**
- Commands exceeding this rate are **ignored**
- Prevents command flooding and buffer overflow

### 3. Startup Safe State

- Motors are **disabled on startup** until first valid command
- First valid command enables motors automatically
- Prevents accidental motion on power-up

### 4. Hard Stop Override

The following commands **always stop** motion immediately:
- **N=201**: Stop now
- **N=100**: Legacy standby (clear all functions)
- **N=3 D1=9**: Legacy stop command

These override any active setpoint or macro.

## Upload Workflow (Critical)

### ESP32/Bluetooth Upload Conflict

**Problem**: ESP32 camera module or Bluetooth module uses UNO RX/TX pins (D0/D1) and blocks firmware upload.

**Solution**: 
1. **Before Upload**: Unplug ESP32/Bluetooth module cable from UNO
2. **Upload Firmware**: Use PlatformIO or Arduino IDE to upload
3. **After Upload**: Reconnect ESP32/Bluetooth module cable

**Error Message**: If you see `avrdude stk500_getsync resp=0x00`, unplug the ESP32/Bluetooth module and retry.

### Upload Steps

1. **Disconnect ESP32/Bluetooth**:
   - Unplug the module cable from UNO RX/TX pins
   - Or disconnect the entire module

2. **Upload Firmware**:
   ```bash
   cd robot/firmware/zip_robot_uno
   pio run -t upload
   ```

3. **Reconnect ESP32/Bluetooth**:
   - After "Done uploading" message
   - Reconnect module cable
   - Robot is ready to use

## Motion Control Architecture

### Real-Time Ownership

**UNO (Firmware) Owns:**
- PWM timing & motor direction
- Smoothing/ramp (slew limiting)
- Deadman watchdog (TTL monitoring)
- Overrides & safe states

**PC (Host) Owns:**
- High-level decisions
- Setpoint updates (10-30Hz)
- Macro selection and triggering

### Differential Mixing

Motion controller converts (v, w) setpoints to left/right PWM:

```
left = v - k*w
right = v + k*w
```

Where:
- `v`: Forward velocity (-255..255)
- `w`: Yaw velocity (-255..255)
- `k`: Mixing constant (currently 1.0, can be tuned)

### Slew Limiting

Smooth ramps prevent sudden motor changes:
- Maximum change per update: 5 PWM units
- Applied to both left and right motors independently
- Prevents mechanical stress and smooth motion

## Testing

See `robot/firmware/zip_robot_uno/README_MOTION.md` for testing instructions and the `motion_test.js` script.

## Troubleshooting

### Motors Don't Move

1. **Check STBY Pin**: Must be HIGH (pin 3)
2. **Check PWM Values**: Verify commands are being sent
3. **Check Safety Layer**: Motors disabled until first valid command
4. **Check TTL**: Setpoint may have expired

### Upload Fails

1. **Unplug ESP32/Bluetooth**: Module blocks RX/TX during upload
2. **Check COM Port**: Verify correct port in PlatformIO
3. **Check Baud Rate**: Upload uses 115200, not 9600

### Commands Not Responding

1. **Check Rate Limiting**: May be exceeding 50 commands/second
2. **Check JSON Format**: Must be valid JSON with proper fields
3. **Check Serial Connection**: Verify baud rate matches (9600 for ELEGOO, 115200 for ZIP)

