# Phase 2: Serial Bridge Implementation

## Overview

Phase 2 implements the serial bridge between ROS 2 and the Arduino firmware, replacing the Node.js bridge with a ROS 2 node. This enables direct communication between ROS 2 topics and the ELEGOO JSON protocol.

## Implementation

### Components Created

1. **`serial_bridge_node.py`** - Main ROS 2 node
   - Subscribes to `/cmd_vel` (geometry_msgs/Twist)
   - Publishes `/ultrasonic` (sensor_msgs/Range)
   - Publishes `/battery` (zip_core/BatteryStatus)
   - Handles serial communication at 115200 baud
   - Implements handshake protocol

2. **`serial_bridge.launch.py`** - Launch file
   - Configurable serial port and baud rate
   - Parameterized setpoint and sensor rates

3. **`serial_bridge.yaml`** - Configuration file
   - Default settings for serial communication
   - Sensor polling rates

## Protocol Translation

### Motion Control

**ROS 2 → Firmware:**
- `/cmd_vel` (Twist) → `{"N":200,"D1":<v>,"D2":<w>,"T":<ttl>}`
  - `linear.x` (m/s) → `D1` (PWM: -255 to 255)
  - `angular.z` (rad/s) → `D2` (PWM: -255 to 255)
  - Scaling: 1 m/s ≈ 100 PWM, 1 rad/s ≈ 50 PWM

**Firmware → ROS 2:**
- Setpoint commands (N=200) are fire-and-forget (no response)

### Sensor Data

**Firmware → ROS 2:**

1. **Ultrasonic Sensor:**
   - Request: `{"N":21,"H":"ultra","D1":2}`
   - Response: `{ultra_<distance_cm>}`
   - Published to: `/ultrasonic` (sensor_msgs/Range)
   - Polled at configurable rate (default: 5 Hz)

2. **Battery Status:**
   - Request: `{"N":23,"H":"batt"}`
   - Response: `{batt_<voltage_mv>}`
   - Published to: `/battery` (zip_core/BatteryStatus)
   - Polled at configurable rate (default: 5 Hz)

3. **IMU:**
   - Currently not implemented (requires firmware support or diagnostics parsing)
   - Placeholder publisher exists for future implementation

## Handshake Protocol

The node implements a handshake sequence:

1. **Open Serial Port** - Connect at 115200 baud
2. **Wait for Boot Marker** - Look for "R" or "READY" markers
3. **Send Hello** - Send `{"N":0,"H":"h1"}` up to 3 times
4. **Wait for Response** - Expect `{h1_ok}` or similar
5. **Mark Ready** - Node becomes operational

If boot marker is seen during operation, handshake restarts automatically.

## Usage

### Launch the Node

```bash
# Auto-detect serial port
ros2 launch zip_control serial_bridge.launch.py

# Specify serial port
ros2 launch zip_control serial_bridge.launch.py serial_port:=/dev/ttyUSB0

# Custom baud rate (if needed)
ros2 launch zip_control serial_bridge.launch.py baud_rate:=9600
```

### Send Motion Commands

```bash
# Publish cmd_vel (forward at 0.5 m/s)
ros2 topic pub /cmd_vel geometry_msgs/msg/Twist "{linear: {x: 0.5, y: 0.0, z: 0.0}, angular: {x: 0.0, y: 0.0, z: 0.0}}"

# Turn in place (1 rad/s)
ros2 topic pub /cmd_vel geometry_msgs/msg/Twist "{linear: {x: 0.0, y: 0.0, z: 0.0}, angular: {x: 0.0, y: 0.0, z: 1.0}}"
```

### Monitor Sensor Data

```bash
# View ultrasonic readings
ros2 topic echo /ultrasonic

# View battery status
ros2 topic echo /battery

# List all topics
ros2 topic list
```

## Configuration Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| `serial_port` | `""` | Serial port path (empty for auto-detect) |
| `baud_rate` | `115200` | Serial baud rate |
| `auto_detect_port` | `true` | Auto-detect Arduino port |
| `setpoint_ttl_ms` | `200` | Setpoint command time-to-live (deadman safety) |
| `setpoint_max_rate_hz` | `30.0` | Maximum setpoint command rate |
| `sensor_poll_rate_hz` | `5.0` | Sensor polling rate |

## Features

- **Auto Port Detection** - Automatically finds Arduino serial ports
- **Rate Limiting** - Prevents command flooding
- **Deadman Safety** - Setpoint commands expire if not refreshed
- **Handshake Recovery** - Automatically reconnects on firmware reset
- **Thread-Safe** - Serial I/O in background thread
- **Error Handling** - Graceful handling of serial errors

## Dependencies

- `rclpy` - ROS 2 Python client library
- `geometry_msgs` - Twist message type
- `sensor_msgs` - Range message type
- `zip_core` - Custom BatteryStatus message
- `pyserial` - Serial port communication

## Testing

### Manual Testing

1. **Connect Arduino** - Ensure robot is connected via USB
2. **Launch Node** - Start the serial bridge
3. **Check Topics** - Verify topics are published:
   ```bash
   ros2 topic list | grep -E "(cmd_vel|ultrasonic|battery)"
   ```
4. **Send Command** - Test motion:
   ```bash
   ros2 topic pub --once /cmd_vel geometry_msgs/msg/Twist "{linear: {x: 0.1}}"
   ```
5. **Monitor Sensors** - Check sensor data:
   ```bash
   ros2 topic echo /ultrasonic --once
   ros2 topic echo /battery --once
   ```

### Integration Testing

The serial bridge should work seamlessly with:
- Teleop nodes (keyboard_teleop, joy_teleop)
- Navigation stack (cmd_vel subscribers)
- Sensor fusion nodes (ultrasonic, battery subscribers)

## Troubleshooting

### Port Not Found

**Error:** `No serial port found`

**Solutions:**
- Check USB connection
- Verify port permissions: `sudo chmod 666 /dev/ttyUSB0`
- Add user to dialout group: `sudo usermod -a -G dialout $USER`
- Specify port manually: `serial_port:=/dev/ttyUSB0`

### Handshake Failed

**Error:** `Handshake failed: max attempts exceeded`

**Solutions:**
- Check firmware is running and responding
- Verify baud rate matches firmware (115200)
- Check serial cable connection
- Try resetting Arduino

### No Sensor Data

**Issue:** Topics exist but no data published

**Solutions:**
- Check sensor polling rate (increase if needed)
- Verify firmware responds to sensor commands
- Check node logs for errors
- Test firmware directly with serial monitor

## Next Steps

Phase 2 provides the foundation for:
- **Phase 3:** Vision stack (camera, YOLO11, VLM)
- **Phase 4:** LLM orchestration
- **Phase 5:** Voice system
- **Phase 6:** HUD integration via rosbridge

The serial bridge enables all robot control and sensor data to flow through ROS 2, replacing the Node.js bridge entirely.

## Notes

- IMU data is not yet implemented (requires firmware command or diagnostics parsing)
- Line sensor support can be added similarly to ultrasonic
- Diagnostics command (N=120) can be used for comprehensive state monitoring
- Emergency stop (N=201) is available but not yet exposed as a ROS 2 service
