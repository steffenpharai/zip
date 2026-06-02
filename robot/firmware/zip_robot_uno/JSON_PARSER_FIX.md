# JSON Parser Fix - Debugging and Improvements

## Issues Identified

1. **Command Retrieval Bug**: The `getCommand()` method was checking `lastCommand.valid`, but `reset()` was being called in `processByte()` before `getCommand()` could retrieve the command. This meant that even though parsing succeeded, the command couldn't be retrieved.

2. **Missing Debug Output**: Limited debugging made it difficult to diagnose why JSON commands weren't being processed.

3. **State Management**: The parser wasn't properly managing state transitions, especially when handling newline characters.

## Fixes Applied

### 1. Fixed Command Retrieval (`frame_parser.cpp`)

**Problem**: `reset()` was called immediately after parsing, clearing `lastCommand.valid` before `getCommand()` could retrieve it.

**Solution**:
- Modified `processByte()` to NOT call `reset()` after parsing
- Instead, only reset `state` and `buffer` for the next frame
- Keep `lastCommand` valid until `getCommand()` is called
- Modified `getCommand()` to clear the valid flag after retrieving the command

**Changes**:
```cpp
// Before: Called reset() which cleared lastCommand.valid
reset();

// After: Only reset state and buffer, keep lastCommand valid
state = STATE_WAIT_START;
buffer = "";
```

And in `getCommand()`:
```cpp
// After retrieving command, clear valid flag
lastCommand.valid = false;
```

### 2. Enhanced Debugging

**Added debug output**:
- Log unexpected characters in `STATE_WAIT_START` (throttled to once per second)
- More detailed error messages for JSON parse failures
- Log successful command parsing with full details
- Log command routing decisions in `main.cpp`

**Debug messages added**:
- `[JSON] Unexpected char in WAIT_START` - helps identify stray bytes
- `[JSON] ✅ Parsed: N=...` - confirms successful parsing
- `[RX] ✅ JSON command parsed: N=...` - confirms command retrieval
- `[RX] Handling motion command N=...` - shows command routing

### 3. Improved State Machine

**Better handling of newline characters**:
- Clearer comments explaining the fall-through behavior
- Proper state transitions when newline is detected
- Buffer length logging for parse errors

## Testing the Fix

### 1. Upload Updated Firmware

```bash
cd robot/firmware/zip_robot_uno
pio run -t upload
```

### 2. Monitor Serial Output

Open serial monitor at 115200 baud and look for:
- `[JSON] Parsing buffer: [...]` - Shows what JSON is being parsed
- `[JSON] ✅ Parsed: N=...` - Confirms successful parsing
- `[RX] ✅ JSON command parsed: N=...` - Confirms command retrieval
- `[RX] Handling motion command N=...` - Shows command execution

### 3. Send Test JSON Command

Send a JSON command via serial (e.g., using a serial terminal):

```
{N:200,"H":"test","D1":100,"D2":50,"T":200}
```

**Expected output**:
```
[JSON] Parsing buffer: [{N:200,"H":"test","D1":100,"D2":50,"T":200}]
[JSON] ✅ Parsed: N=200, H=test, D1=100, D2=50, T=200
[RX] ✅ JSON command parsed: N=200
[RX] Handling motion command N=200
```

### 4. Common Issues to Check

**If commands still aren't parsed**:

1. **Check for newline**: JSON commands MUST end with `\n` or `\r`
   - Send: `{N:200}\n` (not just `{N:200}`)

2. **Check for binary protocol interference**: If binary protocol (0xAA 0x55) frames are being sent, those bytes will be routed to binary decoder, not JSON parser

3. **Check serial buffer**: Ensure `task_protocol_rx()` is being called frequently enough (it's set to 1ms interval, so should be fine)

4. **Check for buffer overflow**: If JSON is longer than 256 bytes, it will be rejected

5. **Check rate limiting**: If commands are sent too fast, they may be rate-limited

## Protocol Details

### JSON Command Format

```
{N:200,"H":"cmd_id","D1":value,"D2":value,"D3":value,"D4":value,"T":ttl}\n
```

- **N**: Command number (required)
  - `0`: Hello/echo
  - `1-110`: Legacy ELEGOO commands
  - `200+`: New motion commands
- **H**: Command header/ID (optional string)
- **D1-D4**: Data fields (optional integers)
- **T**: TTL/timer (optional milliseconds)
- **Must end with `\n` or `\r`**

### Binary Protocol vs JSON Protocol

The firmware supports **both** protocols:

1. **Binary Protocol** (0xAA 0x55 header):
   - Used by the bridge service
   - More efficient, includes CRC16
   - Frame structure: `[0xAA 0x55][LEN][TYPE][SEQ][PAYLOAD][CRC16]`

2. **JSON Protocol** (ELEGOO-style):
   - Used for direct serial JSON commands
   - Human-readable, easier to debug
   - Frame structure: `{...}\n`

The firmware automatically detects which protocol is being used based on the first byte:
- If first byte is `0xAA` → Binary protocol
- Otherwise → JSON protocol (if starts with `{`)

## Next Steps

1. **Upload the fixed firmware**
2. **Test with JSON commands** via serial terminal
3. **Monitor debug output** to verify parsing
4. **Check that commands are being routed correctly** based on N value
5. **Verify motion commands (N=200+) are working**

## Debugging Tips

- Enable serial monitor at 115200 baud
- Look for `[JSON]` and `[RX]` prefixes in debug output
- Send simple test commands first: `{N:0}\n` (Hello command)
- Check that newline is being sent (some terminals require explicit `\n`)
- Verify JSON syntax is correct (no trailing commas, proper quotes)

