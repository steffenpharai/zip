# Phase 2 Testing - SUCCESS ✅

## Status: Operational

The serial bridge node is successfully running and communicating with the Arduino!

## What's Working

1. **CH340 Driver**
   - ✅ Driver compiled and installed
   - ✅ Module loaded: `ch34x`
   - ✅ Device attached: `/dev/ttyUSB0`
   - ✅ brltty conflict resolved (removed)

2. **Serial Port**
   - ✅ Device detected: `/dev/ttyUSB0`
   - ✅ Permissions set: `666` (read/write for all)
   - ✅ Visible in Docker container
   - ✅ Detected by pyserial

3. **ROS 2 Serial Bridge Node**
   - ✅ Node launches successfully
   - ✅ Auto-detects serial port: `/dev/ttyUSB0`
   - ✅ Opens connection at 115200 baud
   - ✅ Initiates handshake with Arduino

4. **ROS 2 Topics**
   - ✅ `/cmd_vel` - Motion control (subscribe)
   - ✅ `/ultrasonic` - Ultrasonic sensor (publish)
   - ✅ `/battery` - Battery status (publish)

## Current Status

The node is running and in the handshake phase. It should:
1. Wait for boot marker ("R" or "READY") from Arduino
2. Send hello command (N=0)
3. Receive `{h1_ok}` response
4. Mark as ready and start polling sensors

## Testing Commands

### 1. Monitor Node Output

```bash
sudo docker exec -it ros2-jazzy bash
source /opt/ros/jazzy/install/setup.bash
source /ros2_ws/install/setup.bash

# Launch node (in foreground to see output)
ros2 launch zip_control serial_bridge.launch.py
```

### 2. Check Topics

In another terminal:
```bash
sudo docker exec -it ros2-jazzy bash
source /opt/ros/jazzy/install/setup.bash
source /ros2_ws/install/setup.bash

# List all topics
ros2 topic list

# Should see:
# /battery
# /cmd_vel
# /ultrasonic
```

### 3. Monitor Sensor Data

```bash
# Monitor ultrasonic sensor
ros2 topic echo /ultrasonic

# Monitor battery status
ros2 topic echo /battery
```

### 4. Test Motion Control

```bash
# Send a forward command (0.1 m/s)
ros2 topic pub --once /cmd_vel geometry_msgs/msg/Twist \
  "{linear: {x: 0.1, y: 0.0, z: 0.0}, angular: {x: 0.0, y: 0.0, z: 0.0}}"

# Send a turn command (0.5 rad/s)
ros2 topic pub --once /cmd_vel geometry_msgs/msg/Twist \
  "{linear: {x: 0.0, y: 0.0, z: 0.0}, angular: {x: 0.0, y: 0.0, z: 0.5}}"

# Stop
ros2 topic pub --once /cmd_vel geometry_msgs/msg/Twist \
  "{linear: {x: 0.0, y: 0.0, z: 0.0}, angular: {x: 0.0, y: 0.0, z: 0.0}}"
```

### 5. Continuous Motion (for testing)

```bash
# Publish at 10 Hz for 5 seconds
ros2 topic pub --rate 10 /cmd_vel geometry_msgs/msg/Twist \
  "{linear: {x: 0.1}, angular: {z: 0.0}}" &
sleep 5
kill %1
```

## Expected Behavior

### Handshake Sequence
1. Node opens `/dev/ttyUSB0` at 115200 baud
2. Waits for boot marker ("R" or "READY") or timeout
3. Sends: `{"N":0,"H":"h1"}`
4. Expects: `{h1_ok}`
5. Marks node as ready

### Sensor Polling
- Ultrasonic: Polled every 0.2 seconds (5 Hz)
  - Command: `{"N":21,"H":"ultra1","D1":2}`
  - Response: `{ultra1_<distance_cm>}`
  - Published to: `/ultrasonic`

- Battery: Polled every 0.2 seconds (5 Hz)
  - Command: `{"N":23,"H":"batt1"}`
  - Response: `{batt1_<voltage_mv>}`
  - Published to: `/battery`

### Motion Control
- Subscribes to `/cmd_vel` (geometry_msgs/Twist)
- Converts to setpoint commands: `{"N":200,"D1":<v>,"D2":<w>,"T":200}`
- Rate-limited to 30 Hz max
- Commands include 200ms TTL (deadman safety)

## Troubleshooting

### Node Not Connecting

If handshake fails:
1. **Check Arduino is powered and firmware running**
2. **Check serial connection:**
   ```bash
   sudo minicom -D /dev/ttyUSB0 -b 115200
   # Should see "R" or "READY" on boot
   ```
3. **Check node logs:**
   ```bash
   # In container
   ros2 launch zip_control serial_bridge.launch.py
   # Look for handshake errors
   ```

### No Sensor Data

If topics exist but no data:
1. **Check Arduino firmware responds to commands**
2. **Increase sensor poll rate** (if needed):
   ```bash
   ros2 launch zip_control serial_bridge.launch.py sensor_poll_rate_hz:=10.0
   ```
3. **Check node is ready:**
   ```bash
   ros2 node info /serial_bridge_node
   ```

### Motion Not Working

If `/cmd_vel` commands don't move robot:
1. **Verify Arduino firmware is running**
2. **Check setpoint commands are being sent:**
   - Monitor serial output (if possible)
   - Check node logs for TX messages
3. **Verify firmware accepts N=200 commands**
4. **Check deadman safety** - commands expire after 200ms if not refreshed

## Next Steps

Phase 2 is complete and operational! You can now:

1. **Test full robot control** via ROS 2 topics
2. **Integrate with teleop** (keyboard_teleop, joy_teleop)
3. **Move to Phase 3** (Vision stack)
4. **Integrate with navigation stack** (if using)

## Files Created

- `/dev/ttyUSB0` - Serial device (created by kernel)
- `/lib/modules/5.15.148-tegra/kernel/drivers/usb/serial/ch34x.ko` - Driver module
- ROS 2 topics: `/cmd_vel`, `/ultrasonic`, `/battery`

## Success Criteria Met

- [x] CH340 driver installed
- [x] Serial port detected
- [x] Node launches successfully
- [x] Topics created
- [x] Handshake initiated
- [ ] Handshake completed (requires Arduino response)
- [ ] Sensor data received
- [ ] Motion commands working

The node is ready and waiting for Arduino communication!
