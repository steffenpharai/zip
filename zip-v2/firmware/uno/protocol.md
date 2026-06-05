# ZIP Robot Protocol Specification

Binary-framed protocol for communication between host and robot.

## Frame Format

```
[0xAA 0x55][LEN][TYPE][SEQ][PAYLOAD...][CRC16]
```

- **Header**: `0xAA 0x55` (2 bytes)
- **LEN**: Total bytes of TYPE + SEQ + PAYLOAD (1 byte)
- **TYPE**: Message type (1 byte)
- **SEQ**: Sequence number for ACK matching (1 byte)
- **PAYLOAD**: Variable length JSON or binary data (max 64 bytes)
- **CRC16**: CRC16-CCITT checksum over LEN..PAYLOAD (2 bytes, little-endian)

**Payload Size Limit**: Maximum payload size is 64 bytes (to match firmware RAM constraints). Commands with payloads exceeding this limit will be rejected.

## Message Types

### Host → Robot (Commands)

| Type | Name | Description | Payload |
|------|------|-------------|---------|
| 0x01 | HELLO | Request robot info | `{}` |
| 0x02 | SET_MODE | Set operating mode | `{mode: 0-4}` |
| 0x03 | DRIVE_TWIST | Twist control (v, omega) | `{"v": 100, "omega": 50}` |
| 0x04 | DRIVE_TANK | Tank drive (left, right) | `{"left": 100, "right": 100}` |
| 0x05 | SERVO | Set servo angle | `{angle: 0-180}` |
| 0x06 | LED | Set LED color/brightness | `{"r": 255, "g": 0, "b": 0, "brightness": 255}` |
| 0x07 | E_STOP | Emergency stop | `{}` |
| 0x08 | CONFIG_SET | Set configuration | `{key: value}` |

### Robot → Host (Responses)

| Type | Name | Description | Payload |
|------|------|-------------|---------|
| 0x81 | INFO | Robot information | `{"fw_version": "1.0.0", "caps": 0xFF, "pinmap_hash": 0x12345678}` |
| 0x82 | ACK | Command acknowledgment | `{"ok": true}` or `{"ok": false, "err": 1}` |
| 0x83 | TELEMETRY | Sensor data stream | See Telemetry Format |
| 0x84 | FAULT | Fault/error report | `{"fault_code": 1, "detail": "Low battery"}` |

## Operating Modes

- `0`: STANDBY - Motors disabled
- `1`: MANUAL - Direct command control
- `2`: LINE_FOLLOW - Autonomous line following
- `3`: OBSTACLE_AVOID - Obstacle avoidance
- `4`: FOLLOW - Follow mode

## Telemetry Format

```json
{
  "ts_ms": 12345,
  "imu": {
    "ax": 0,
    "ay": 0,
    "az": 0,
    "gx": 0,
    "gy": 0,
    "gz": 0,
    "yaw": 0.0
  },
  "ultrasonic_mm": 200,
  "line_adc": [512, 512, 512],
  "batt_mv": 7400,
  "motor_state": {
    "left": 0,
    "right": 0
  },
  "mode": 1
}
```

## Error Codes

- `0`: Success
- `1`: Unknown command
- `2`: Invalid payload
- `3`: Invalid mode
- `4`: Wrong mode for command
- `5`: JSON parse error

## Sequence Numbers

- Sequence numbers start at 1 and increment
- Sequence 0 is reserved (never used)
- Wraps around to 1 after 255
- Used for matching ACK responses to commands

## CRC16 Calculation

- Polynomial: 0x1021 (CRC16-CCITT)
- Initial value: 0xFFFF
- Calculated over: LEN byte + TYPE byte + SEQ byte + PAYLOAD bytes
- Transmitted as: [CRC_LOW, CRC_HIGH] (little-endian)

## Example

**Command**: DRIVE_TWIST with v=100, omega=50

```
Frame: AA 55 0E 03 01 7B 22 76 22 3A 31 30 30 2C 22 6F 6D 65 67 61 22 3A 35 30 7D [CRC16]
       |Header|LEN|TYPE|SEQ|                    JSON Payload                    |CRC|
```

**Response**: ACK

```
Frame: AA 55 05 82 01 7B 22 6F 6B 22 3A 74 72 75 65 7D [CRC16]
       |Header|LEN|TYPE|SEQ|      JSON Payload      |CRC|
```

