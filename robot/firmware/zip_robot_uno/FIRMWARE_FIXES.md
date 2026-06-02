# Firmware Fixes Applied

## Issues Found and Fixed

### 1. Protocol Decoder LEN Validation Bug (CRITICAL)

**Problem:**
The decoder was rejecting valid frames with payloads larger than 64 bytes. The LEN field validation was checking:
```cpp
if (expectedLen < 2 || expectedLen > 64)
```

But `expectedLen` is the LEN field value which includes TYPE(1) + SEQ(1) + PAYLOAD_LEN. So:
- Minimum LEN = 2 (TYPE + SEQ, no payload) ✓
- Maximum LEN = 2 + 64 = 66 (TYPE + SEQ + max payload) ✗ (was checking 64)

**Fix:**
Changed validation to:
```cpp
if (expectedLen < 2 || expectedLen > PROTOCOL_MAX_LEN)
```

Where `PROTOCOL_MAX_LEN = 2 + PROTOCOL_MAX_PAYLOAD_SIZE = 66`

**Files Changed:**
- `src/protocol/protocol_decode.cpp` - Fixed LEN validation
- `include/protocol/protocol_types.h` - Added PROTOCOL_MAX_LEN constant

### 2. Added Protocol Constants

**Improvement:**
Added `PROTOCOL_MAX_LEN` constant to `protocol_types.h` for consistency and maintainability.

**Files Changed:**
- `include/protocol/protocol_types.h` - Added PROTOCOL_MAX_PAYLOAD_SIZE and PROTOCOL_MAX_LEN

### 3. Added Debug Output

**Improvement:**
Enabled minimal debug output in command handler to verify commands are being received. Only logs commands (0x01-0x08), not telemetry responses, to avoid flooding the serial port.

**Files Changed:**
- `src/behavior/command_handler.cpp` - Enabled debug logging for received commands

## Testing

After uploading the fixed firmware, you should see:
1. Commands being received (debug output: `CMD:0x01,seq=1`)
2. ACK responses being sent
3. Proper handling of all command types

## Verification

To verify the fixes work:
1. Upload the firmware to your robot
2. Run the test script: `python test_robot_serial.py --port COM5`
3. You should see:
   - Commands being sent
   - Debug output from robot showing commands received
   - ACK responses being received
   - All tests passing

## Notes

- The CRC calculation was verified to be correct in both encoder and decoder
- Serial.flush() is already being called for all responses
- The protocol RX task processes bytes correctly in the main loop

