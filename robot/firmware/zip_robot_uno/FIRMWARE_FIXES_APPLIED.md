# Firmware Fixes Applied

## Changes Made to Fix Reset Loop

### 1. Increased Watchdog Timeout ✅
**File:** `src/main.cpp` (line 165)
- Changed from `WDTO_2S` (2 seconds) to `WDTO_4S` (4 seconds)
- Prevents premature watchdog resets

### 2. Added Watchdog Reset in Telemetry Task ✅
**File:** `src/main.cpp` (line 72-74)
- Added `wdt_reset()` before sending telemetry
- Ensures watchdog doesn't timeout during telemetry transmission

### 3. Reduced Telemetry Payload Size ✅
**File:** `src/behavior/command_handler.cpp` (sendTELEMETRY function)
- Reduced buffer from 128 bytes to 64 bytes (matches protocol limit)
- Reduced JSON document from 128 to 64 bytes
- Shortened JSON keys to reduce payload size:
  - `ts_ms` → `t`
  - `imu` → `a` (accel)
  - `ultrasonic_mm` → `u`
  - `line_adc` → `l`
  - `batt_mv` → `b`
  - `motor_state` → `m`
  - `mode` → `md`
- Removed gyroscope data to save space (kept only accelerometer and yaw)

## Next Steps

1. **Recompile firmware:**
   ```bash
   cd robot/firmware/zip_robot_uno
   pio run
   ```

2. **Upload to Arduino:**
   ```bash
   pio run -t upload
   ```

3. **Test with bridge service:**
   - Restart bridge service
   - Send HELLO command
   - Check for protocol frames and ACKs

## Expected Results

After uploading the fixed firmware:
- ✅ Firmware should initialize once and stay running (no reset loop)
- ✅ Telemetry should be sent every 100ms (10Hz) with protocol frames
- ✅ Commands should receive ACKs
- ✅ Bridge should detect: `[SerialManager] Protocol frame detected`
- ✅ Bridge should decode: `[SerialManager] ✅ Decoded message`

## Notes

- Telemetry payload is now optimized to fit within 64-byte protocol limit
- Watchdog timeout increased to 4 seconds to prevent false resets
- Some telemetry data reduced (gyroscope removed) to fit size constraint
- All essential data still included: accelerometer, yaw, ultrasonic, line sensors, battery, motors, mode

