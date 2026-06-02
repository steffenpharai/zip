# Communication Verification Guide

## Quick Test

1. **Connect robot via USB**
2. **Unplug ESP32/Bluetooth module** (if attached)
3. **Run test script**:
   ```bash
   cd robot/tools
   npm install
   node test_communication.js COM3
   ```
   Replace `COM3` with your serial port.

## Expected Behavior

### Test 1: Stop Command (N=201)
- **Send**: `{"N":201,"H":"test_stop","D1":0,"D2":0,"T":0}`
- **Expected**: `{test_stop_ok}` or `{ok}`
- **Robot**: Should stop motors immediately

### Test 2: Setpoint Command (N=200)
- **Send**: `{"N":200,"H":"test_setpoint","D1":100,"D2":0,"T":200}`
- **Expected**: `{test_setpoint_ok}` (on first command only)
- **Robot**: Should start moving forward (if motors enabled)

### Test 3: Macro Command (N=210)
- **Send**: `{"N":210,"H":"test_macro","D1":4,"D2":200,"T":5000}`
- **Expected**: `{test_macro_ok}` or `{test_macro_false}`
- **Robot**: Should execute FORWARD_THEN_STOP macro

### Test 4: Legacy Stop (N=100)
- **Send**: `{"N":100,"H":"test_legacy","D1":0,"D2":0,"T":0}`
- **Expected**: `{ok}`
- **Robot**: Should enter standby mode (motors disabled)

## Troubleshooting

### No Response
1. **Check baud rate**: Firmware uses 115200, test script uses 115200
2. **Check COM port**: Verify correct port in Device Manager (Windows) or `ls /dev/tty*` (Linux)
3. **Check firmware**: Ensure firmware is uploaded and running
4. **Check serial monitor**: Open serial monitor to see if robot is sending anything

### Wrong Responses
1. **Check JSON format**: Must be valid JSON with proper fields
2. **Check protocol**: Robot supports both binary (0xAA 0x55) and JSON
3. **Check rate limiting**: Max 50 commands/second

### Motors Don't Move
1. **Check STBY pin**: Must be HIGH (pin 3)
2. **Check first command**: Motors disabled until first valid command
3. **Check TTL**: Setpoint may have expired
4. **Check safety layer**: Motors may be force-disabled

## Manual Serial Test

You can also test manually using a serial monitor:

1. Open serial monitor at 115200 baud
2. Send: `{"N":201,"H":"test","D1":0,"D2":0,"T":0}`
3. Should receive: `{test_ok}`

## Verification Checklist

- [ ] Serial port opens successfully
- [ ] Robot responds to N=201 (stop)
- [ ] Robot responds to N=200 (setpoint)
- [ ] Robot responds to N=210 (macro)
- [ ] Robot responds to N=100 (legacy stop)
- [ ] Motors enable on first valid command
- [ ] Motors stop on TTL expiry
- [ ] Motors stop on N=201
- [ ] Rate limiting works (>50Hz commands ignored)

