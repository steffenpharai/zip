# Arduino ROS Communication Guide

This document describes the complete ROS 2 interface for communicating with the Arduino robot firmware.

## Overview

The `serial_bridge_node` provides a complete ROS 2 interface to all Arduino commands. It bridges:
- **ROS Topics** → Arduino commands (motion control)
- **ROS Services** → Arduino commands (servo, macros, diagnostics, etc.)
- **Arduino responses** → ROS Topics (sensors, diagnostics)

## Serial Connection

The node automatically detects the Arduino serial port (USB-A to USB-C connection). You can also specify it manually:

```bash
ros2 launch zip_control serial_bridge.launch.py serial_port:=/dev/ttyUSB0
```

Default settings:
- **Baud Rate**: 115200
- **Auto-detect**: Enabled
- **Sensor Poll Rate**: 5 Hz
- **Setpoint Max Rate**: 30 Hz

## ROS Topics

### Published Topics

#### `/cmd_vel` (geometry_msgs/Twist) - **Subscriber**
Publishes velocity commands to the robot. Automatically converted to Arduino N=200 setpoint commands.

```bash
# Move forward at 0.5 m/s
ros2 topic pub /cmd_vel geometry_msgs/msg/Twist "{linear: {x: 0.5, y: 0.0, z: 0.0}, angular: {x: 0.0, y: 0.0, z: 0.0}}"

# Turn left at 0.5 rad/s
ros2 topic pub /cmd_vel geometry_msgs/msg/Twist "{linear: {x: 0.0, y: 0.0, z: 0.0}, angular: {x: 0.0, y: 0.0, z: 0.5}}"

# Stop
ros2 topic pub /cmd_vel geometry_msgs/msg/Twist "{linear: {x: 0.0, y: 0.0, z: 0.0}, angular: {x: 0.0, y: 0.0, z: 0.0}}"
```

#### `/ultrasonic` (sensor_msgs/Range) - **Publisher**
Ultrasonic sensor distance readings (published at sensor_poll_rate_hz).

```bash
ros2 topic echo /ultrasonic
```

#### `/battery` (zip_core/BatteryStatus) - **Publisher**
Battery voltage and status (published at sensor_poll_rate_hz).

```bash
ros2 topic echo /battery
```

#### `/robot_sensors` (zip_core/RobotSensors) - **Publisher**
Aggregated sensor readings including:
- Ultrasonic distance
- Line sensors (left, middle, right)
- IMU availability
- Servo position

```bash
ros2 topic echo /robot_sensors
```

#### `/robot_diagnostics` (zip_core/RobotDiagnostics) - **Publisher**
Comprehensive robot diagnostics including:
- Motion state
- Motor PWM values
- Sensor readings
- System health

```bash
ros2 topic echo /robot_diagnostics
```

## ROS Services

### `/emergency_stop` (zip_core/srv/EmergencyStop)
Immediately stops all robot motion (Arduino N=201).

```bash
ros2 service call /emergency_stop zip_core/srv/EmergencyStop
```

### `/servo_control` (zip_core/srv/ServoControl)
Control the pan servo (Arduino N=5).

```bash
# Set servo to 90 degrees (center)
ros2 service call /servo_control zip_core/srv/ServoControl "{angle: 90}"

# Set servo to 0 degrees (left)
ros2 service call /servo_control zip_core/srv/ServoControl "{angle: 0}"

# Set servo to 180 degrees (right)
ros2 service call /servo_control zip_core/srv/ServoControl "{angle: 180}"
```

### `/macro_execute` (zip_core/srv/MacroExecute)
Execute a predefined motion macro (Arduino N=210).

**Macro IDs:**
- `1` = FIGURE_8
- `2` = SPIN_360
- `3` = WIGGLE
- `4` = FORWARD_THEN_STOP

```bash
# Execute figure-8 pattern
ros2 service call /macro_execute zip_core/srv/MacroExecute "{macro_id: 1, intensity: 128, ttl_ms: 5000}"

# Spin 360 degrees
ros2 service call /macro_execute zip_core/srv/MacroExecute "{macro_id: 2, intensity: 200, ttl_ms: 3000}"

# Wiggle motion
ros2 service call /macro_execute zip_core/srv/MacroExecute "{macro_id: 3, intensity: 150, ttl_ms: 2000}"

# Forward then stop
ros2 service call /macro_execute zip_core/srv/MacroExecute "{macro_id: 4, intensity: 180, ttl_ms: 4000}"
```

### `/macro_cancel` (zip_core/srv/MacroCancel)
Cancel any active macro (Arduino N=211).

```bash
ros2 service call /macro_cancel zip_core/srv/MacroCancel
```

### `/get_diagnostics` (zip_core/srv/GetDiagnostics)
Get comprehensive robot diagnostics (Arduino N=120).

```bash
ros2 service call /get_diagnostics zip_core/srv/GetDiagnostics
```

Response includes:
- Motion state
- Motor PWM values
- Hardware profile
- IMU status
- RAM usage
- Battery voltage
- Safety layer configuration
- Init sequence state

### `/direct_motor_control` (zip_core/srv/DirectMotorControl)
Direct PWM control of motors, bypassing motion controller (Arduino N=999).

**⚠️ WARNING**: This bypasses safety layers. Use with caution.

```bash
# Set left motor to 100 PWM, right to -100 PWM (spin)
ros2 service call /direct_motor_control zip_core/srv/DirectMotorControl "{left_pwm: 100, right_pwm: -100}"

# Stop motors
ros2 service call /direct_motor_control zip_core/srv/DirectMotorControl "{left_pwm: 0, right_pwm: 0}"
```

### `/rerun_init` (zip_core/srv/ReRunInit)
Re-run the initialization sequence (Arduino N=130).

```bash
ros2 service call /rerun_init zip_core/srv/ReRunInit
```

### `/set_drive_config` (zip_core/srv/SetDriveConfig)
Configure drive safety parameters (Arduino N=140).

**Parameters:**
- `1` = Deadband (high byte = L, low byte = R)
- `2` = Acceleration step
- `3` = Deceleration step
- `4` = Kick enable (0/1)
- `5` = Max PWM cap

```bash
# Set deadband: L=10, R=10 (packed as 0x0A0A = 2570)
ros2 service call /set_drive_config zip_core/srv/SetDriveConfig "{parameter: 1, value: 2570}"

# Set acceleration step to 5
ros2 service call /set_drive_config zip_core/srv/SetDriveConfig "{parameter: 2, value: 5}"

# Enable kick start
ros2 service call /set_drive_config zip_core/srv/SetDriveConfig "{parameter: 4, value: 1}"
```

## Command Mapping

| ROS Interface | Arduino Command | Description |
|--------------|----------------|-------------|
| `/cmd_vel` topic | N=200 | Setpoint streaming |
| `/emergency_stop` service | N=201 | Emergency stop |
| `/servo_control` service | N=5 | Servo control |
| `/macro_execute` service | N=210 | Execute macro |
| `/macro_cancel` service | N=211 | Cancel macro |
| `/get_diagnostics` service | N=120 | Get diagnostics |
| `/direct_motor_control` service | N=999 | Direct motor control |
| `/rerun_init` service | N=130 | Re-run init |
| `/set_drive_config` service | N=140 | Set drive config |
| Auto-polled | N=21 | Ultrasonic sensor |
| Auto-polled | N=22 | Line sensors |
| Auto-polled | N=23 | Battery voltage |

## Testing Communication

### 1. Start the Serial Bridge

```bash
ros2 launch zip_control serial_bridge.launch.py
```

### 2. Verify Connection

Check that the node is running and connected:

```bash
ros2 node list
ros2 topic list
ros2 service list
```

### 3. Test Motion Control

```bash
# Move forward
ros2 topic pub /cmd_vel geometry_msgs/msg/Twist "{linear: {x: 0.3, y: 0.0, z: 0.0}, angular: {x: 0.0, y: 0.0, z: 0.0}}"

# Wait 2 seconds, then stop
sleep 2
ros2 topic pub /cmd_vel geometry_msgs/msg/Twist "{linear: {x: 0.0, y: 0.0, z: 0.0}, angular: {x: 0.0, y: 0.0, z: 0.0}}"
```

### 4. Test Sensors

```bash
# Monitor ultrasonic sensor
ros2 topic echo /ultrasonic

# Monitor battery
ros2 topic echo /battery

# Monitor all sensors
ros2 topic echo /robot_sensors
```

### 5. Test Services

```bash
# Get diagnostics
ros2 service call /get_diagnostics zip_core/srv/GetDiagnostics

# Control servo
ros2 service call /servo_control zip_core/srv/ServoControl "{angle: 90}"

# Execute macro
ros2 service call /macro_execute zip_core/srv/MacroExecute "{macro_id: 4, intensity: 150, ttl_ms: 3000}"
```

## Troubleshooting

### Serial Port Not Found

If auto-detection fails, specify the port manually:

```bash
# Find available ports
ls /dev/ttyUSB* /dev/ttyACM*

# Launch with specific port
ros2 launch zip_control serial_bridge.launch.py serial_port:=/dev/ttyUSB0
```

### No Response from Arduino

1. Check serial connection (USB-A to USB-C cable)
2. Verify Arduino firmware is uploaded
3. Check baud rate (must be 115200)
4. Check node logs: `ros2 run zip_control serial_bridge_node`

### Handshake Failed

The node performs a handshake on startup. If it fails:
1. Check that Arduino is powered on
2. Verify firmware is running (check Serial Monitor)
3. Try unplugging and replugging USB cable
4. Check for boot marker "R" in logs

### Services Timeout

If services timeout:
1. Check serial connection is active
2. Verify Arduino is responding (check diagnostics)
3. Increase timeout in service callback if needed

## Protocol Details

All commands use the ELEGOO JSON protocol format:
```json
{"N":<command_number>,"H":"<tag>","D1":<value1>,"D2":<value2>,"T":<ttl_ms>}
```

Responses use token format:
```
{tag_ok}
{tag_value}
{tag_false}
```

Diagnostics use special format:
```
{owner,lpwm,rpwm,mstate,reset,hw:<hash>,imu:<0/1>,ram:<free>,...}
```

## Next Steps

- Integrate with navigation stack
- Add action servers for complex behaviors
- Implement safety monitoring
- Add telemetry logging
