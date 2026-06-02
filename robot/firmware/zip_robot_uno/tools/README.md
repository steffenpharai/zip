# ZIP Robot Test Tools

Comprehensive testing and verification tools for the ZIP Robot firmware.

## Quick Start

```bash
# Install dependencies
npm install serialport

# Run full test suite
node serial_motor_bringup.js COM5

# Run quick motor test
node serial_motor_bringup.js COM5 --quick

# Run extended motion tests (desktop safe)
node serial_motor_bringup.js COM5 --motion-only
```

---

## serial_motor_bringup.js

### Overview

A comprehensive Node.js test tool that verifies all robot subsystems through serial communication. Tests are designed to be **deterministic** - every test should pass consistently across reboots.

### Installation

```bash
cd robot/firmware/zip_robot_uno/tools
npm install serialport
```

### Usage

```bash
node serial_motor_bringup.js <PORT> [OPTIONS]
```

| Option | Description |
|--------|-------------|
| `<PORT>` | Serial port (e.g., `COM5`, `/dev/ttyUSB0`) |
| `--quick` | Basic motor start/stop only (10 seconds) |
| `--motion-only` | Extended motion tests only (45 seconds) |
| (none) | Full test suite (60 seconds) |

### Test Modes

#### Quick Mode (`--quick`)

Fast verification of basic motor control:
- 3 forward pulses with stop verification
- Confirms N=999 (direct) and N=201 (stop) work

```bash
node serial_motor_bringup.js COM5 --quick
```

#### Motion Only Mode (`--motion-only`)

Extended motion tests safe for desktop operation:
- 8 test phases
- All movements within 0.5 foot radius
- Tests various motion patterns

```bash
node serial_motor_bringup.js COM5 --motion-only
```

#### Full Mode (default)

Complete subsystem verification:
- All motion tests
- Servo control
- Sensor reads
- Macro execution

```bash
node serial_motor_bringup.js COM5
```

---

## Test Phases

### Phase 1: Basic Motor Control
**Purpose**: Verify fundamental motor start/stop
- 3 cycles of forward pulse + stop
- Checks N=999 acknowledgment
- Verifies N=201 stop confirmation

### Phase 2: Forward/Backward Micro Movements
**Purpose**: Test directional control at various speeds
| Test | L PWM | R PWM | Duration |
|------|-------|-------|----------|
| creep_fwd | 60 | 60 | 200ms |
| creep_back | -60 | -60 | 200ms |
| slow_fwd | 80 | 80 | 400ms |
| slow_back | -80 | -80 | 400ms |
| med_fwd | 60 | 60 | 600ms |
| med_back | -60 | -60 | 600ms |

### Phase 3: Pivot Turns (Spin in Place)
**Purpose**: Test zero-radius turns
| Test | L PWM | R PWM | Duration |
|------|-------|-------|----------|
| pivot_R_micro | 60 | -60 | 200ms |
| pivot_L_micro | -60 | 60 | 200ms |
| pivot_R_short | 80 | -80 | 400ms |
| pivot_L_short | -80 | 80 | 400ms |
| pivot_R_med | 60 | -60 | 600ms |
| pivot_L_med | -60 | 60 | 600ms |

### Phase 4: Arc Turns (Gentle Curves)
**Purpose**: Test differential speed turns
| Test | L PWM | R PWM | Duration | Type |
|------|-------|-------|----------|------|
| arc_R_wide | 80 | 60 | 400ms | Wide right |
| arc_L_wide | 60 | 80 | 400ms | Wide left |
| arc_R_tight | 80 | 0 | 200ms | Tight right |
| arc_L_tight | 0 | 80 | 200ms | Tight left |
| arc_R_rev | -80 | -60 | 400ms | Reverse right |
| arc_L_rev | -60 | -80 | 400ms | Reverse left |

### Phase 5: Wiggle Pattern
**Purpose**: Test rapid direction changes
- 4 rapid alternating pivot movements (200ms each)
- Tests motor response time

### Phase 6: Gradual Speed Changes
**Purpose**: Test acceleration/deceleration
```
Speed ramp: 40 → 60 → 80 → 100 → 80 → 60 → 40 → 0
```
Also tests forward-reverse-forward sequence.

### Phase 7: Setpoint Streaming (N=200)
**Purpose**: Test streaming motion commands
- 10 packets forward (v=50, w=0)
- 10 packets arc (v=40, w=30)
- 5 packets reverse (v=-40, w=0)
- Fire-and-forget commands at 10Hz

### Phase 8: Complex Motion Sequences
**Purpose**: Test coordinated movements

**Mini Figure-8:**
```
Right arc → Right arc → Left arc → Left arc
```

**Box Pattern:**
```
Forward → Turn → Forward → Turn → Forward → Turn → Forward → Turn
```

### Phase 9: Servo Control
**Purpose**: Test pan servo
- Tests angles: 90° → 45° → 135° → 90° → 60° → 120° → 90°
- Uses N=5 command with D1=1 (pan servo)

### Phase 10: Sensor Reads
**Purpose**: Verify sensor communication
- Ultrasonic (N=21, D1=2)
- Line sensor left (N=22, D1=0)
- Line sensor middle (N=22, D1=1)
- Line sensor right (N=22, D1=2)

### Phase 11: Macro Execution
**Purpose**: Test macro system
- Start FORWARD_THEN_STOP macro (N=210, D1=4)
- Cancel macro (N=211)

---

## Motion Speed Constants

```javascript
// PWM values (0-255)
const CREEP_PWM = 60;    // Very slow - minimum reliable movement
const SLOW_PWM = 80;     // Slow - controlled movement
const MEDIUM_PWM = 100;  // Medium - still safe for desktop

// Durations
const MICRO_DURATION = 200;   // 200ms - tiny movements
const SHORT_DURATION = 400;   // 400ms - small movements
const MEDIUM_DURATION = 600;  // 600ms - moderate movements
const PAUSE_DURATION = 300;   // Pause between movements
```

**Note**: These values are tuned to keep the robot within a 0.5 foot radius on a desk.

---

## Log Output

All test output is logged to:
```
<project>/.cursor/debug.log
```

### Log Format (NDJSON)

```json
{"location":"serial:rx","message":"RX","data":{"line":"{fwd1_ok}"},"timestamp":1704067200000,"sessionId":"motion-test"}
{"location":"serial:tx","message":"TX","data":{"cmd":"{\"N\":999,...}"},"timestamp":1704067200001,"sessionId":"motion-test"}
```

### Reading Logs

```bash
# View all entries
cat .cursor/debug.log

# Filter for specific patterns
cat .cursor/debug.log | grep "serial:rx"

# Parse as JSON
cat .cursor/debug.log | jq '.message'
```

---

## Expected Results

### Passing Test

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
Servo                       7       0  ✓ PASS
Sensors                     4       0  ✓ PASS
Macro                       2       0  ✓ PASS
────────────────────────────────────────────────────────────

✓ All tests passed!
```

### Diagnostics Response

During tests, N=120 diagnostics show:
```
{D80,80,1,3,1}    # Direct mode: L=80, R=80, STBY=1, state=3, resets=1
{X0,0,0,0,1}      # Stopped: L=0, R=0, STBY=0, state=0, resets=1
```

---

## Troubleshooting

### Port Not Found

```bash
# List available ports
node -e "require('serialport').SerialPort.list().then(p => console.log(p))"
```

### No Response from Robot

1. Check correct port specified
2. Verify firmware is uploaded
3. Wait for "R" ready marker (600ms after reset)
4. Check baud rate is 115200

### Tests Fail Intermittently

1. Check RAM usage (<85%)
2. Reduce test speed (increase PAUSE_DURATION)
3. Check for loose connections
4. Verify power supply is adequate

### Motors Move Unexpectedly

1. Run `--quick` test first to isolate
2. Check for N=200 setpoint timeout issues
3. Verify stop commands are acknowledged

### Servo Doesn't Move

1. Check servo connected to D10
2. Verify 5V power to servo
3. Test with single command: `{"N":5,"D1":1,"D2":90}`

---

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | All tests passed |
| 1 | One or more tests failed |

---

## Contributing

When adding new tests:

1. Add test function following existing pattern
2. Update `testResults` object with new category
3. Add to appropriate test mode (quick/motion/full)
4. Document in this README
5. Verify RAM impact with verbose build

---

## Version

- **Tool Version**: 2.0.0
- **Last Updated**: January 2026
- **Node.js**: 18+
- **Dependencies**: serialport ^12.0.0

