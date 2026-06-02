# Firmware Bring-Up Checklist

Step-by-step testing procedure for ZIP Robot firmware.

## Prerequisites

- Arduino UNO connected via USB
- PlatformIO installed
- Robot hardware assembled per Elegoo V4.0 instructions
- Battery connected (7.4V)

## 1. LED Blink Test

**Objective**: Verify basic I/O and LED functionality

**Steps**:
1. Upload firmware
2. Open serial monitor (115200 baud)
3. Observe LED should show idle state (breathing cyan)

**Expected**: LED displays state-based colors

**Troubleshooting**:
- If LED doesn't light: Check pin 4 connection
- If wrong colors: Verify FastLED library installation

## 2. Serial Hello/Info Test

**Objective**: Verify serial communication and protocol

**Steps**:
1. Connect via serial monitor
2. Send HELLO command (via bridge or manual)
3. Observe INFO response

**Expected**: Robot responds with firmware version, capabilities, pinmap hash

**Troubleshooting**:
- If no response: Check baud rate (115200)
- If garbled: Verify serial port connection
- If timeout: Check protocol framing

## 3. Motor Self-Test

**Objective**: Verify motor driver wiring and STBY pin

**Steps**:
1. Place robot on safe surface (wheels off ground recommended)
2. Power on robot
3. Observe serial output for self-test results
4. Watch LED patterns (green = success, red = failure)

**Expected**:
- Left motor forward ramp (500ms)
- Right motor forward ramp (500ms)
- Left motor backward ramp (500ms)
- Right motor backward ramp (500ms)
- All tests pass

**Troubleshooting**:
- **Motors don't move**: 
  - Check STBY pin (pin 3) is HIGH
  - Verify motor driver connections (AIN1, BIN1, PWMA, PWMB)
  - Check battery voltage (>7.0V)
- **One motor doesn't move**: Check individual motor wiring
- **Motors run continuously**: Check direction pins

## 4. Manual Drive Test

**Objective**: Verify manual control commands

**Steps**:
1. Set mode to MANUAL (mode 1)
2. Send DRIVE_TWIST command: `{"v": 100, "omega": 0}`
3. Observe robot moves forward
4. Send DRIVE_TANK command: `{"left": 100, "right": -100}`
5. Observe robot turns

**Expected**: Robot responds to commands immediately

**Troubleshooting**:
- If no movement: Check mode is MANUAL
- If wrong direction: Verify motor wiring polarity
- If jerky movement: Check PWM ramping settings

## 5. Servo Sweep Test

**Objective**: Verify servo motor functionality

**Steps**:
1. Send SERVO command: `{angle: 0}`
2. Observe servo moves to 0 degrees
3. Send SERVO command: `{angle: 180}`
4. Observe servo moves to 180 degrees
5. Send SERVO command: `{angle: 90}`
6. Observe servo centers

**Expected**: Servo smoothly moves to commanded angles

**Troubleshooting**:
- If servo doesn't move: Check pin 10 connection
- If jittery: Check power supply (servo needs adequate current)
- If wrong angles: Calibrate servo limits

## 6. Ultrasonic Read Test

**Objective**: Verify ultrasonic sensor functionality

**Steps**:
1. Place object 20cm in front of sensor
2. Observe telemetry stream
3. Check `ultrasonic_mm` value

**Expected**: Distance reading approximately 200mm (±10mm)

**Troubleshooting**:
- If reading 0: Check TRIG (pin 13) and ECHO (pin 12) connections
- If always max: Sensor may be disconnected
- If erratic: Check for interference or multiple reflections

## 7. Line Sensor Calibration Test

**Objective**: Verify line tracking sensors

**Steps**:
1. Place robot over white surface
2. Send calibration command (if implemented)
3. Place robot over black line
4. Observe telemetry `line_adc` values

**Expected**:
- White surface: High ADC values (>800)
- Black line: Low ADC values (<200)

**Troubleshooting**:
- If all sensors read same: Check analog connections (A0, A1, A2)
- If values don't change: Verify sensor power and ground
- If inverted: Check sensor orientation

## 8. IMU Calibration & Stability Test

**Objective**: Verify IMU functionality and yaw estimation

**Steps**:
1. Place robot on level surface
2. Observe telemetry `imu.yaw` value
3. Rotate robot 90 degrees
4. Observe yaw changes

**Expected**:
- Yaw value changes smoothly with rotation
- Yaw returns to similar value when rotated back
- No drift when stationary (after calibration)

**Troubleshooting**:
- If yaw doesn't change: Check I2C connections (A4=SDA, A5=SCL)
- If erratic: IMU may need recalibration
- If constant drift: Check IMU mounting (should be level)

## 9. Battery Monitoring Test

**Objective**: Verify battery voltage detection

**Steps**:
1. Observe telemetry `batt_mv` value
2. Compare with multimeter reading
3. Test low battery threshold

**Expected**:
- Voltage reading matches multimeter (±0.1V)
- Low battery warning triggers below 7.0V
- Critical battery stops motors below 6.0V

**Troubleshooting**:
- If reading 0: Check A3 connection
- If wrong scale: Verify voltage divider ratio in config
- If no low battery detection: Check threshold settings

## 10. Protocol Stress Test

**Objective**: Verify protocol reliability

**Steps**:
1. Send rapid commands (10 commands/second)
2. Observe ACK responses
3. Check for dropped frames or CRC errors

**Expected**:
- All commands receive ACK
- No CRC errors
- Telemetry stream continues uninterrupted

**Troubleshooting**:
- If ACKs missing: Check command queue timeout
- If CRC errors: Verify serial connection quality
- If telemetry stops: Check scheduler task execution

## Success Criteria

All tests pass:
- ✅ LED displays states correctly
- ✅ Serial communication works
- ✅ Motors respond to commands
- ✅ Servo moves to angles
- ✅ Sensors provide valid readings
- ✅ Protocol handles commands reliably

## Next Steps

After bring-up:
1. Calibrate sensors for your environment
2. Tune motor PID/ramping parameters
3. Configure mode-specific behaviors
4. Test autonomous modes (line follow, obstacle avoid)

