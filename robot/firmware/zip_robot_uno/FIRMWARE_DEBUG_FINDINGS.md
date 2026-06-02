# Firmware Debug Findings - DRIVE_TANK Mode Issue

## Problem
DRIVE_TANK commands fail with error code 4 (Wrong mode - not in MANUAL mode) even after SET_MODE succeeds with mode=1 (MANUAL).

## Investigation

### Code Analysis
1. **SET_MODE handler** (`handleSetMode`):
   - Parses JSON: `{"mode": 1}`
   - Sets `currentMode = (RobotMode)mode;` where `mode = 1` (MODE_MANUAL)
   - Sends ACK with `ok: true`
   - Code looks correct

2. **DRIVE_TANK handler** (`handleDriveTank`):
   - Checks `if (currentMode != MODE_MANUAL)` at the start
   - Returns error code 4 if not in MANUAL mode
   - Code looks correct

3. **Mode initialization**:
   - `currentMode` initialized to `MODE_STANDBY` (0) in constructor
   - Reset to `MODE_STANDBY` in `init()` method
   - No other code appears to reset the mode

### Possible Causes

1. **Enum Casting Issue**: The cast `(RobotMode)mode` might not be working correctly
2. **Memory Corruption**: The `currentMode` variable might be getting corrupted
3. **Command Ordering**: Commands might be processed out of order (unlikely with serial)
4. **JSON Parsing**: The mode value might not be parsed correctly (but ACK says OK)
5. **Race Condition**: Mode might be checked before it's fully set (unlikely in single-threaded Arduino)

### Debug Output Added

Added comprehensive debug output to:
- `handleSetMode`: Logs mode being set, current mode before, and verification after
- `handleDriveTank`: Logs current mode when command is received

### Next Steps

1. **Compile and upload firmware** with debug output
2. **Run test script** and capture serial output
3. **Analyze debug logs** to see:
   - What mode value is actually being set
   - What mode value is checked when DRIVE_TANK is called
   - If there's any mismatch

### Test Command
```bash
python test_robot_serial.py --port COM5
```

Then check serial monitor output for `[SET_MODE]` and `[DRIVE_TANK]` debug messages.

## Files Modified
- `src/behavior/command_handler.cpp`: Added debug output to `handleSetMode()` and `handleDriveTank()`

