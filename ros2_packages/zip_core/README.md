# zip_core

ZIP Robot Core package: Custom messages, safety layers, and core robot state.

## Custom Messages

### RobotDiagnostics.msg
Comprehensive robot state including:
- Motion state (velocity, PWM values)
- Sensor readings (ultrasonic, line tracking)
- IMU data (if available)
- System health (connection status, error counts)
- Timestamps

### RobotSensors.msg
Aggregated sensor readings:
- Ultrasonic distance (HC-SR04)
- Line tracking sensors (3 sensors)
- IMU data (MPU6050, optional)
- Servo position

### BatteryStatus.msg
Battery monitoring:
- Voltage readings (raw and calculated)
- Health status (NORMAL, LOW, CRITICAL, CHARGING)
- Estimated percentage
- Timestamps

### VoiceState.msg
Voice loop state machine:
- Current state (IDLE, LISTENING, PROCESSING, SPEAKING, ERROR)
- Current transcription/TTS text
- Barge-in detection
- Timestamps

## Services

### EmergencyStop.srv
Immediately stops all robot motion and enters safe state.

## Usage

After building, use the messages in other packages:

```python
from zip_core.msg import BatteryStatus, RobotSensors
from zip_core.srv import EmergencyStop
```

```cpp
#include "zip_core/msg/battery_status.hpp"
#include "zip_core/srv/emergency_stop.hpp"
```

## Building

```bash
cd ~/zip_ros2_ws
colcon build --packages-select zip_core
source install/setup.bash
```

## Testing

Verify messages are generated:

```bash
ros2 interface show zip_core/msg/BatteryStatus
ros2 interface show zip_core/srv/EmergencyStop
```
