# ELEGOO Shield Switch Configuration

## Overview

The ELEGOO Smart Robot Car V4.0 shield has a **slide switch** that routes the Arduino's RX/TX pins (D0/D1) between USB-Serial communication and external module communication.

## Switch Positions

### UPLOAD/COM Position (USB-Serial)

**Use for:**
- ✅ Firmware uploads via USB
- ✅ USB-Serial communication (ROS 2 serial bridge)
- ✅ Direct USB communication with Arduino

**What it does:**
- Routes Arduino RX/TX (D0/D1) to the CH340 USB-to-Serial chip
- Enables communication via USB cable at `/dev/ttyUSB0` (Linux) or `COMx` (Windows)
- Required for ROS 2 serial bridge node

**When to use:**
- **ROS 2 Serial Bridge**: Always use UPLOAD position
- **Firmware Development**: Use UPLOAD position for uploading code
- **Direct Serial Communication**: Use UPLOAD position for USB serial

### CAM Position (External Modules)

**Use for:**
- ✅ ESP32 camera module communication
- ✅ Bluetooth module communication
- ✅ Wireless communication via shield headers

**What it does:**
- Routes Arduino RX/TX (D0/D1) to external module headers (P8 connector)
- Disconnects USB-Serial from Arduino
- Enables wireless communication via ESP32 or Bluetooth

**When to use:**
- **ESP32 Camera**: Use CAM position when ESP32 is connected
- **Bluetooth Module**: Use CAM position when Bluetooth is connected
- **Wireless Operation**: Use CAM position for wireless control

## For ROS 2 Serial Bridge

### ✅ Correct Configuration

**Switch Position**: **UPLOAD/COM**

**Why:**
- ROS 2 serial bridge communicates via USB-Serial (CH340)
- The bridge uses `/dev/ttyUSB0` which requires USB-Serial connection
- UPLOAD position routes RX/TX to CH340 chip

**Verification:**
```bash
# Device should appear as USB serial
ls -la /dev/ttyUSB0

# Should be detected by pyserial
python3 -c "import serial.tools.list_ports; print([p.device for p in serial.tools.list_ports.comports()])"
```

### ❌ Incorrect Configuration

**Switch Position**: CAM

**What happens:**
- Arduino RX/TX disconnected from USB-Serial
- `/dev/ttyUSB0` may not receive data from Arduino
- ROS 2 node cannot communicate with Arduino
- Handshake will fail

## Switch Location

The switch is typically located on the shield PCB, near the USB connector or module headers. It may be labeled as:
- **UPLOAD / COM** (or just "UPLOAD")
- **CAM** (or "CAMERA")

Some shields may have different labeling, but the function is the same:
- One position = USB-Serial (for programming/USB communication)
- Other position = External modules (for wireless communication)

## Troubleshooting

### Problem: No Communication with ROS 2 Node

**Check 1: Switch Position**
```bash
# Verify switch is in UPLOAD/COM position
# Look at physical switch on shield
```

**Check 2: Device Detection**
```bash
# Should see /dev/ttyUSB0
ls -la /dev/ttyUSB0

# Should be detected by pyserial
python3 -c "import serial.tools.list_ports; print([p.device for p in serial.tools.list_ports.comports()])"
```

**Check 3: Direct Serial Test**
```bash
# Test direct communication
python3 -c "
import serial
s = serial.Serial('/dev/ttyUSB0', 115200, timeout=2)
s.write(b'{\"N\":0,\"H\":\"test\"}\n')
import time
time.sleep(0.5)
data = s.read(100)
print('Response:', data)
s.close()
"
```

### Problem: Upload Fails

**Solution:**
1. Ensure switch is in **UPLOAD/COM** position
2. Unplug any ESP32/Bluetooth modules from shield
3. Try upload again

### Problem: ESP32 Not Working

**Solution:**
1. Switch must be in **CAM** position for ESP32 communication
2. Verify ESP32 module is properly connected to P8 header
3. Check ESP32 firmware is running

## Quick Reference

| Task | Switch Position | Notes |
|------|----------------|-------|
| ROS 2 Serial Bridge | **UPLOAD/COM** | Required for USB communication |
| Firmware Upload | **UPLOAD/COM** | Required for programming |
| ESP32 Communication | **CAM** | Routes to external modules |
| Bluetooth | **CAM** | Routes to external modules |
| Direct USB Serial | **UPLOAD/COM** | For serial monitor, etc. |

## Documentation References

- **Firmware Upload**: `robot/firmware/zip_robot_uno/UPLOAD_INSTRUCTIONS.md`
- **ESP32 Communication**: `robot/firmware/zip_esp32_cam/TEST_HARDWARE_TX.md`
- **Serial Bridge**: `docs/ros2/PHASE2_SERIAL_BRIDGE.md`

## Summary

**For ROS 2 Serial Bridge: Always use UPLOAD/COM position**

The switch must be in UPLOAD/COM position to enable USB-Serial communication, which is required for the ROS 2 serial bridge node to communicate with the Arduino via `/dev/ttyUSB0`.
