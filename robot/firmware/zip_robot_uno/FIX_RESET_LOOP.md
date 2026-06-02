# Fix for Firmware Reset Loop

## Quick Fix: Increase Watchdog Timeout

The firmware is resetting every ~2 seconds. The watchdog timeout is too short. Here's the fix:

### Step 1: Update config.h

Edit `robot/firmware/zip_robot_uno/include/config.h`:

**Change line 37:**
```cpp
#define WATCHDOG_TIMEOUT_MS 4000     // Change from 2000 to 4000
```

### Step 2: Update main.cpp

Edit `robot/firmware/zip_robot_uno/src/main.cpp`:

**Change line 165:**
```cpp
wdt_enable(WDTO_4S);  // Change from WDTO_2S to WDTO_4S
```

### Step 3: Add Watchdog Reset in Telemetry Task

Edit `robot/firmware/zip_robot_uno/src/main.cpp`:

**Change the task_telemetry function (around line 72):**
```cpp
void task_telemetry() {
  wdt_reset();  // ADD THIS LINE - Reset watchdog before sending telemetry
  commandHandler.sendTELEMETRY();
}
```

### Step 4: Reduce Telemetry Payload Size

The telemetry JSON is likely > 64 bytes. Edit `robot/firmware/zip_robot_uno/src/behavior/command_handler.cpp`:

**In sendTELEMETRY() function, reduce the JSON document size (around line 318):**
```cpp
StaticJsonDocument<64> doc;  // Change from 128 to 64
uint8_t buffer[64];  // Change from 128 to 64
uint8_t payload[64];  // Change from 128 to 64
```

**And reduce the data sent:**
```cpp
// Remove some IMU fields or reduce precision
// Keep only essential telemetry data
```

### Step 5: Recompile and Upload

```bash
cd robot/firmware/zip_robot_uno
pio run -t upload
```

## Alternative: Disable Watchdog (Testing Only)

To verify if watchdog is the issue, temporarily disable it:

**In main.cpp, comment out line 165:**
```cpp
// wdt_enable(WDTO_2S);  // Temporarily disabled for testing
```

**WARNING:** Only for testing! Re-enable after confirming the issue.

## Expected Result

After applying these fixes:
- ✅ Firmware should initialize once and stay running
- ✅ Telemetry should be sent every 100ms (10Hz)
- ✅ Commands should receive ACKs
- ✅ Bridge should detect protocol frames

