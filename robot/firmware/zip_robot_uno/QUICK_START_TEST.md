# Quick Start: Testing Robot Communication

## Step 1: Install Dependencies

```bash
pip install pyserial
```

Or use the requirements file:
```bash
pip install -r requirements-test.txt
```

## Step 2: Upload Firmware

Make sure the firmware is uploaded to your robot:

```bash
# In this directory (robot/firmware/zip_robot_uno)
pio run -t upload
```

## Step 3: Find Your Serial Port

### Windows:
```bash
python test_robot_serial.py --list-ports
```
Look for ports like `COM3`, `COM4`, etc.

### Linux/Mac:
```bash
python test_robot_serial.py --list-ports
```
Look for ports like `/dev/ttyUSB0`, `/dev/ttyACM0`, etc.

## Step 4: Run the Test

### Auto-detect port:
```bash
python test_robot_serial.py
```

### Specify port manually:
```bash
# Windows
python test_robot_serial.py --port COM3

# Linux/Mac  
python test_robot_serial.py --port /dev/ttyUSB0
```

## What to Expect

The script will:
1. Connect to the robot
2. Send HELLO command and wait for INFO + ACK
3. Set robot to MANUAL mode
4. Test drive commands (tank drive)
5. Test servo control
6. Test LED colors
7. Wait for and display telemetry

You should see output like:
```
✓ Connected to COM3 @ 115200 baud
→ Sent: type=0x01, seq=1, frame=[AA 55 03 01 01 7B 7D 3C 4E]
← Received: type=0x81 (INFO), seq=1, payload={"fw_version":"1.0.0",...}
← Received: type=0x82 (ACK), seq=1, payload={"ok":true}
  Result: ✓ PASS
```

## Troubleshooting

### "No serial ports found"
- Make sure robot is connected via USB
- Close PlatformIO serial monitor if it's open
- Close the bridge service if it's running
- Try unplugging and replugging USB

### "Failed to connect"
- Another program might be using the port
- Check Device Manager (Windows) or `dmesg` (Linux) for port issues
- Try a different USB cable or port

### "No ACK received"
- Check that firmware is actually running (look for serial output in PlatformIO)
- Verify baud rate matches (115200)
- Check that protocol implementation matches

### Robot not responding
- Open PlatformIO serial monitor to see if robot is receiving bytes:
  ```bash
  pio device monitor --baud 115200
  ```
- You should see the robot's initialization messages
- If you see garbled text, baud rate might be wrong

## Next Steps

Once the test passes, you can:
1. Use the bridge service to connect via WebSocket
2. Integrate with the ZIP HUD application
3. Debug specific commands by modifying the test script

## Protocol Debugging

If commands aren't working, you can manually inspect frames:

1. The script prints all sent/received frames in hex
2. Compare with firmware's expected format
3. Check CRC16 calculation matches
4. Verify JSON payload encoding

The protocol frame format is:
```
[0xAA 0x55][LEN][TYPE][SEQ][PAYLOAD...][CRC16_LOW][CRC16_HIGH]
```

Where:
- LEN = 1 (TYPE) + 1 (SEQ) + PAYLOAD_LEN
- CRC16 covers: LEN + TYPE + SEQ + PAYLOAD
- CRC16 is CRC16-CCITT (polynomial 0x1021, initial 0xFFFF)

