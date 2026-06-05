# Serial Communication Test Script

This script tests direct communication with the ZIP robot firmware via serial port.

## Prerequisites

1. Install Python 3.7 or later
2. Install required Python packages:
   ```bash
   pip install -r requirements-test.txt
   ```
   Or directly:
   ```bash
   pip install pyserial
   ```

3. Upload the firmware to your robot using PlatformIO:
   ```bash
   cd robot/firmware/zip_robot_uno
   pio run -t upload
   ```

4. Connect the robot to your computer via USB

## Usage

### List available serial ports:
```bash
python test_robot_serial.py --list-ports
```

### Run tests with auto-detected port:
```bash
python test_robot_serial.py
```

### Run tests with specific port:
```bash
# Windows
python test_robot_serial.py --port COM3

# Linux/Mac
python test_robot_serial.py --port /dev/ttyUSB0
```

### Custom baud rate (default is 115200):
```bash
python test_robot_serial.py --port COM3 --baud 115200
```

## What the Test Does

The script runs a comprehensive test suite:

1. **HELLO** - Sends HELLO command, expects INFO and ACK responses
2. **SET_MODE** - Sets robot to MANUAL mode (mode 1)
3. **DRIVE_TANK** - Tests tank drive commands (forward, then stop)
4. **SERVO** - Tests servo control (90°, 0°, 180°, back to 90°)
5. **LED** - Tests LED color changes (red, green, blue, cyan)
6. **TELEMETRY** - Waits for and displays telemetry data

## Expected Output

You should see output like:
```
============================================================
ZIP Robot Serial Communication Test
============================================================
✓ Connected to COM3 @ 115200 baud

=== Test: HELLO ===
→ Sent: type=0x01, seq=1, frame=[AA 55 03 01 01 7B 7D 3C 4E]
← Received: type=0x81 (INFO), seq=1, payload={"fw_version":"1.0.0",...}
← Received: type=0x82 (ACK), seq=1, payload={"ok":true}
  Result: ✓ PASS

=== Test: SET_MODE (mode=1) ===
→ Sent: type=0x02, seq=2, frame=[AA 55 08 02 02 7B 22 6D 6F 64 65 22 3A 31 7D ...]
← Received: type=0x82 (ACK), seq=2, payload={"ok":true}
  Result: ✓ PASS

...
```

## Troubleshooting

### "No serial ports found"
- Make sure the robot is connected via USB
- Check device manager (Windows) or `ls /dev/tty*` (Linux/Mac)
- Try specifying the port manually with `--port`

### "Failed to connect"
- Make sure no other program is using the serial port (close PlatformIO serial monitor, bridge, etc.)
- Check that the baud rate matches (default 115200)
- Try unplugging and replugging the USB cable

### "No ACK received" or "No telemetry received"
- Check that the firmware is uploaded and running
- Look at the serial monitor in PlatformIO to see if the robot is receiving commands
- Verify the protocol implementation matches between firmware and test script

### "CRC validation failed"
- This indicates a protocol mismatch
- Check that both firmware and test script use the same CRC16-CCITT implementation
- Verify frame structure matches

## Protocol Details

The protocol uses binary frames with the following structure:
```
[0xAA 0x55][LEN][TYPE][SEQ][PAYLOAD...][CRC16_LOW][CRC16_HIGH]
```

- Header: 0xAA 0x55
- LEN: Length of TYPE + SEQ + PAYLOAD
- TYPE: Message type (0x01-0x08 for commands, 0x81-0x84 for responses)
- SEQ: Sequence number (1-255, wraps to 1)
- PAYLOAD: JSON-encoded data (max 64 bytes)
- CRC16: CRC16-CCITT checksum (polynomial 0x1021, initial 0xFFFF)

## Integration with PlatformIO

You can also use PlatformIO's serial monitor to see raw bytes:
```bash
pio device monitor --baud 115200
```

However, the test script provides a more user-friendly way to test the protocol with proper encoding/decoding.

