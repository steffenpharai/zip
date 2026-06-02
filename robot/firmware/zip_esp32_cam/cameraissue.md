# ESP32S3-Camera-v1.0 Camera Issue - RESOLVED

## Status: RESOLVED (January 2026)

The ESP32-S3 camera firmware has been successfully refactored and is now working with correct OV2640 GPIO pin mappings. The camera streams video, WiFi AP mode works, and UART bridge to the robot shield is operational.

**Key Fix:** Migrated from OV3660 pin configuration to OV2640 standard pinout:
- XCLK: GPIO 45 → GPIO 15 (not a strapping pin)
- SIOD/SIOC: GPIO 1/2 → GPIO 4/5 (standard OV2640 I2C)
- Data pins: Updated to OV2640 8-bit bus mapping

## Problem Summary (Historical)

The original ESP32 camera firmware crashed during initialization when using PlatformIO with ESP32 framework 2.0.14. The root cause was that the ELEGOO firmware used **ESP32-WROVER** pin definitions (GPIO 34, 35, 36, 39) which **do not exist on ESP32-S3**.

## Hardware Configuration

- **Board**: ESP32S3-Camera-v1.0 (ESP32-S3 chip, revision v0.2)
- **MCU**: ESP32-S3-WROOM-1
- **Camera Module**: OV2640
- **PSRAM**: 8 MB (OPI mode)
- **Flash**: 8 MB (QIO mode)

## Solution Implemented

### Correct ESP32-S3 GPIO Mapping

The firmware was refactored with correct ESP32-S3 GPIO assignments:

**Camera Pins:**
| Signal | GPIO | Notes |
|--------|------|-------|
| PWDN | -1 | Not connected |
| RESET | -1 | Not connected |
| XCLK | 15 | External clock |
| SIOD | 4 | I2C SDA |
| SIOC | 5 | I2C SCL |
| Y2 | 11 | Data bit 0 |
| Y3 | 9 | Data bit 1 |
| Y4 | 8 | Data bit 2 |
| Y5 | 10 | Data bit 3 |
| Y6 | 12 | Data bit 4 |
| Y7 | 18 | Data bit 5 |
| Y8 | 17 | Data bit 6 |
| Y9 | 16 | Data bit 7 |
| VSYNC | 6 | Vertical sync |
| HREF | 7 | Horizontal reference |
| PCLK | 13 | Pixel clock |

**UART Pins (OV2640 Configuration):**
| Pin | GPIO | Notes |
|-----|------|-------|
| RX | 44 | Hardware UART0 RX (safe, not a strapping pin) |
| TX | 43 | Hardware UART0 TX |

**LED Pin:**
| Pin | GPIO | Notes |
|-----|------|-------|
| Status LED | 3 | GPIO 3 (strapping pin, but safe after boot) |

### Firmware Architecture

The monolithic `main.cpp` was refactored into modular services:

```
src/
├── app/
│   └── app_main.cpp           # Main application
├── drivers/
│   ├── camera/
│   │   └── camera_service.*   # Camera initialization & capture
│   └── uart/
│       └── uart_bridge.*      # UART bridge (WROVER-compatible pins)
├── net/
│   └── net_service.*          # WiFi AP management
└── web/
    └── web_server.*           # HTTP handlers & streaming
```

### Key Features

1. **WROVER-Compatible UART**: Uses GPIO3 (RX) and GPIO1 (TX) to match the ESP32-WROVER pinout that the ELEGOO shield was designed for. See "UART RX Fix" section below.

2. **Graceful Degradation**: Firmware continues running even if camera fails. WiFi, UART, and web server remain operational.

3. **Health Endpoint**: `/health` returns JSON diagnostics for all subsystems.

4. **Compile-Time Pin Validation**: `static_assert` checks prevent pin conflicts at build time.

## Verification

### Build Output
```
RAM:   [==        ]  15.3% (used 49996 bytes from 327680 bytes)
Flash: [===       ]  25.7% (used 808449 bytes from 3145728 bytes)
========================= [SUCCESS] =========================
```

### Working Features

- WiFi AP: `ELEGOO-XXXX` network
- Camera stream: `http://192.168.4.1:81/stream`
- Single capture: `http://192.168.4.1/capture`
- Health check: `http://192.168.4.1/health`
- TCP robot commands: Port 100
- UART bridge: 115200 baud to Arduino UNO

## Original Problem (For Reference)

### The Error (Before Fix)
```
Guru Meditation Error: Core 1 panic'ed (LoadProhibited). Exception was unhandled.

Backtrace:
  #0  0x4203c203:0x3fcebc70 in ll_cam_set_pin at ll_cam.c:311
  #1  0x42035341:0x3fcebcc0 in cam_init at cam_hal.c:339
  #2  0x42034e92:0x3fcebcf0 in esp_camera_init at esp_camera.c:275
```

### Root Cause
The ELEGOO firmware used M5STACK_WIDE pin definitions for ESP32-WROVER:
- GPIO 34, 35, 36, 39 were used for camera data pins
- These GPIOs **do not exist** on ESP32-S3
- The camera driver's pin validation rejected these invalid GPIOs

### Why ELEGOO's Original Firmware Worked
The ELEGOO binary was compiled for ESP32-WROVER with an older Arduino framework that had lenient pin validation. The binary happened to run on ESP32-S3 hardware, but couldn't be rebuilt with modern toolchains.

## UART RX Fix (January 2026)

### Problem
After the camera was fixed, UART communication was one-way only:
- **TX worked**: ESP32 could send commands to Arduino UNO
- **RX was dead**: ESP32 received no data from Arduino UNO

### Root Cause
The ELEGOO documentation and shield silkscreen labels "0(RX)" and "1(TX)" were misinterpreted as ESP32 GPIO numbers. They actually refer to **Arduino D0/D1**, not ESP32 GPIOs.

The SmartRobot-Shield was designed for **ESP32-WROVER**, which uses:
| Signal | WROVER GPIO | ESP32-S3 GPIO (original) |
|--------|-------------|--------------------------|
| TX | GPIO1 | GPIO1 ✓ (worked) |
| RX | GPIO3 | GPIO0 ✗ (broken) |

**GPIO0 is a boot strapping pin** on ESP32-S3. Using it for UART RX causes:
- Boot mode issues if the line is low during reset
- Unreliable UART reception on ESP32-S3

### Solution
Changed `UART_RX_GPIO` from `0` to `3` in `board_esp32s3_elegoo_cam.h`:

```cpp
// BEFORE (broken):
#define UART_RX_GPIO  0   // Boot strap pin - doesn't work as UART RX

// AFTER (fixed):
#define UART_RX_GPIO  3   // WROVER-compatible UART0 RX
```

### Verification
After the fix, the `/health` endpoint should show:
- `uart_rx_bytes` incrementing when Arduino sends data
- `uart_rx_frames` incrementing for complete JSON frames
- Two-way UART communication restored

## References

- [ESP32-S3 Datasheet](https://www.espressif.com/sites/default/files/documentation/esp32-s3_datasheet_en.pdf)
- [ESP32-Camera Library](https://github.com/espressif/esp32-camera)
- ELEGOO Smart Robot Car Kit V4.0 2023.02.01

## Resolution Date

January 2, 2026
