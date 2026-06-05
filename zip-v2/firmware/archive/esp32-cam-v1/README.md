# ZIP ESP32-S3 Camera Firmware

Production-ready ESP32-S3 camera firmware for the ELEGOO Smart Robot Car V4.0, refactored with modular architecture and proper ESP32-S3 GPIO mappings.

## Features

- **WiFi AP Mode**: Creates `ELEGOO-XXXX` network (no password)
- **MJPEG Streaming**: `http://192.168.4.1:81/stream`
- **Single Capture**: `http://192.168.4.1/capture`
- **Health Diagnostics**: `http://192.168.4.1/health` (JSON)
- **Web UI**: `http://192.168.4.1/`
- **JSON Command Bridge**: TCP port 100 (WiFi → Serial2 → UNO)
- **Boot-Safe UART**: GPIO0 protection during startup

## Hardware Configuration

| Component | Configuration |
|-----------|---------------|
| Board | ESP32S3-Camera-v1.0 |
| MCU | ESP32-S3-WROOM-1 |
| Camera | OV2640 |
| PSRAM | 8 MB (OPI) |
| Flash | 8 MB (QIO) |

### Pin Assignments

**Camera (OV2640):**
| Signal | GPIO |
|--------|------|
| XCLK | 15 |
| SIOD | 4 |
| SIOC | 5 |
| Y2-Y9 | 11, 9, 8, 10, 12, 18, 17, 16 |
| VSYNC | 6 |
| HREF | 7 |
| PCLK | 13 |

**UART Bridge (to Robot Shield P8):**
| Pin | GPIO | Note |
|-----|------|------|
| RX | 3 | UART1 RX (via GPIO matrix) - VERIFIED |
| TX | 40 | UART1 TX (via GPIO matrix) - VERIFIED |

**Status LED:**
| Pin | GPIO |
|-----|------|
| LED | 14 | Moved from GPIO3 to free it for UART RX |

## Requirements

- [PlatformIO](https://platformio.org/) CLI or VS Code extension
- USB cable to connect ESP32-S3 to PC
- ELEGOO Smart Robot Car V4.0 hardware

## Build and Upload

### 1. Build

```bash
cd robot/firmware/zip_esp32_cam

# Standard build
pio run -e esp32cam

# Debug build (verbose logging, self-test)
pio run -e esp32cam_debug

# Minimal build (no camera, UART bridge only)
pio run -e esp32cam_minimal
```

### 2. Upload

```bash
pio run -t upload
```

Or specify the port:

```bash
pio run -t upload --upload-port COM4
```

### 3. Monitor

```bash
pio device monitor
```

**Note**: The firmware runs independently of Serial connection. You can:
- Unplug USB and power via external supply
- Close Serial monitor - system continues running
- Access diagnostics via WiFi health endpoint

Expected output:
```
==========================================
  ZIP ESP32-S3 Camera Firmware v2.0
  Board: ESP32S3-Camera-v1.0
==========================================
Chip: ESP32-S3 rev 0, 2 cores @ 240 MHz
Flash: 8 MB
Heap: 280000 bytes free
PSRAM: 8388608 bytes (8380000 free)
Camera: XCLK=15 SIOD=4 SIOC=5 PCLK=13
UART: RX=3 TX=40 @ 115200 baud
LED: GPIO14
==========================================
[INIT] Initializing camera...
[CAM] Camera initialized successfully
[INIT] Initializing WiFi...
:----------------------------:
wifi_name:ELEGOO-1234ABCD
:----------------------------:
Camera Ready! Use 'http://192.168.4.1' to connect
==========================================
```

## Architecture

```
robot/firmware/zip_esp32_cam/
├── include/
│   ├── board/
│   │   └── board_esp32s3_elegoo_cam.h  ← Pin definitions (single source of truth)
│   └── config/
│       ├── build_config.h              ← Feature flags
│       └── runtime_config.h            ← Runtime parameters
├── src/
│   ├── app/
│   │   └── app_main.cpp               ← Main application (setup/loop)
│   ├── drivers/
│   │   ├── camera/
│   │   │   ├── camera_service.h
│   │   │   └── camera_service.cpp     ← Camera initialization & capture
│   │   └── uart/
│   │       ├── uart_bridge.h
│   │       └── uart_bridge.cpp        ← UART with boot-safe GPIO0
│   ├── net/
│   │   ├── net_service.h
│   │   └── net_service.cpp            ← WiFi AP management
│   └── web/
│       ├── web_server.h
│       └── web_server.cpp             ← HTTP handlers & streaming
└── platformio.ini
```

## Data Flow

```
┌─────────────────────────────────────────────────────────────┐
│                     ESP32-S3                                 │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐    ┌─────────────────────────────────┐ │
│  │  WiFi AP        │    │  Camera Server                  │ │
│  │  ELEGOO-XXXX    │    │  - OV2640 sensor (GPIO 15 XCLK)│ │
│  │  192.168.4.1    │    │  - MJPEG encoder                │ │
│  └────────┬────────┘    │  - HTTP handlers                │ │
│           │             └─────────────────────────────────┘ │
│  ┌────────▼────────┐                                        │
│  │  TCP Server     │    ┌─────────────────────────────────┐ │
│  │  Port 100       │───►│  UART Bridge (115200 baud)      │ │
│  │  JSON bridge    │◄───│  GPIO3 RX, GPIO40 TX            │ │
│  └─────────────────┘    └────────────┬────────────────────┘ │
└──────────────────────────────────────┼──────────────────────┘
                                       │
                          ┌────────────▼────────────┐
                          │  Arduino UNO (ZIP)      │
                          │  115200 baud            │
                          │  Motion control         │
                          └─────────────────────────┘
```

## Build Configurations

### Feature Flags (platformio.ini)

| Flag | Default | Description |
|------|---------|-------------|
| `ENABLE_CAMERA` | 1 | Enable camera subsystem |
| `ENABLE_UART` | 1 | Enable UART bridge |
| `ENABLE_STREAM` | 1 | Enable MJPEG streaming |
| `ENABLE_HEALTH_ENDPOINT` | 1 | Enable /health JSON |
| `ENABLE_SELF_TEST` | 0 | Run self-test at boot |
| `ENABLE_VERBOSE_LOGS` | 0 | Verbose debug logging |

### Build Environments

| Environment | Description |
|-------------|-------------|
| `esp32cam` | Standard production build |
| `esp32cam_debug` | Debug build with logging & self-test |
| `esp32cam_minimal` | No camera (UART bridge only) |

## Health Endpoint

`GET /health` returns comprehensive JSON diagnostics for all subsystems:

```json
{
  "camera": {
    "init_ok": true,
    "status": "OK",
    "last_error": "OK",
    "error_code": 0,
    "error_code_name": "ESP_OK",
    "captures": 1234,
    "failures": 0,
    "last_capture_ms": 1,
    "last_frame_bytes": 8972,
    "last_capture_time": 20124,
    "idle_ms": 2103
  },
  "uart": {
    "init_ok": true,
    "rx_pin": 3,
    "tx_pin": 40,
    "rx_bytes": 5678,
    "tx_bytes": 1234,
    "rx_frames": 42,
    "tx_frames": 10,
    "framing_errors": 0,
    "buffer_overflows": 0,
    "last_rx_ts": 3589,
    "last_tx_ts": 1234,
    "idle_ms": 18638,
    "rx_available": 0
  },
  "wifi": {
    "status": "AP_ACTIVE",
    "init_ok": true,
    "mode": "AP",
    "ssid": "ELEGOO-A892C72C01FC",
    "ip": "192.168.4.1",
    "tx_power": 15,
    "stations": 1,
    "uptime_ms": 17330,
    "last_error": "OK"
  },
  "psram": {
    "detected": true,
    "bytes": 8385831,
    "free": 8168671,
    "used": 217160
  },
  "heap": {
    "free": 222564,
    "min_free": 214744,
    "largest_free_block": 212980
  },
  "chip": {
    "model": "ESP32-S3",
    "revision": 0,
    "cores": 2,
    "freq_mhz": 240,
    "flash_size_mb": 8
  }
}
```

### Diagnostic Fields

**Camera Diagnostics:**
- `error_code`: ESP-IDF error code (0 = ESP_OK)
- `error_code_name`: Human-readable error name
- `last_capture_ms`: Duration of last capture operation
- `last_frame_bytes`: Size of last captured frame
- `idle_ms`: Time since last capture

**UART Diagnostics:**
- `init_ok`: Whether UART is initialized
- `buffer_overflows`: Count of buffer overflow events
- `last_rx_ts` / `last_tx_ts`: Timestamps of last activity
- `idle_ms`: Time since last UART activity
- `rx_available`: Bytes currently in RX buffer

**WiFi Diagnostics:**
- `status`: Detailed status (DISCONNECTED, INITIALIZING, AP_ACTIVE, ERROR, TIMEOUT)
- `uptime_ms`: Time since AP started
- `last_error`: Last error message from network service

**System Diagnostics:**
- `psram.detected`: Whether PSRAM is detected
- `psram.used`: Used PSRAM bytes
- `heap.largest_free_block`: Largest allocatable block
- `chip.flash_size_mb`: Flash size in MB

### Query Health Endpoint (Python Script)

A Python diagnostic script is available to query the health endpoint over WiFi:

```bash
cd robot/firmware/zip_esp32_cam
python scripts/query_health.py [IP_ADDRESS]

# Default IP is 192.168.4.1
python scripts/query_health.py
```

The script provides:
- Detailed camera diagnostics with error codes
- UART communication status and troubleshooting
- WiFi connection details
- System resource usage
- Automatic diagnosis and troubleshooting tips

## Boot-Safe UART

The UART bridge uses GPIO3 (RX) and GPIO40 (TX), which are routed via GPIO matrix to UART1. These pins are **not boot strapping pins**, so they can be safely initialized immediately without boot protection delays.

**Previous Implementation**: GPIO0 was used for RX, which required a boot guard window to prevent interference with download mode. With GPIO3, this protection is no longer needed.

**Current Implementation**:
- UART1 initialized immediately on boot
- GPIO3/40 routed via GPIO matrix (not hardware UART pins)
- No boot delay required
- Shield slide-switch must be in "CAM" position to bridge GPIO3/40 to Arduino Uno

## Graceful Degradation

The firmware continues running even if subsystems fail:

- **Camera fails**: WiFi, UART, and web server still work. `/stream` returns 503.
- **UART fails**: Camera and WiFi still work.
- **WiFi fails**: Logs error but doesn't crash.
- **Serial not connected**: System runs normally without USB/Serial monitor. Serial operations are non-blocking and buffer output.

## Troubleshooting

### Upload Failed

1. Press and hold the BOOT button on ESP32-S3 while uploading
2. Check COM port is correct
3. Close any serial monitors

### Camera Not Detected

1. Check ribbon cable connection
2. Power cycle the ESP32
3. Monitor serial output for pin mismatch errors
4. Check `/health` endpoint for error details

### PSRAM Not Detected

Ensure `platformio.ini` has:
```ini
board_build.arduino.memory_type = qio_opi
```

### WiFi Connection Drops

1. Ensure PC is close to robot (WiFi range ~15m with 15dBm TX power)
2. Check for interference from other 2.4GHz devices
3. Robot must be powered on
4. TX power is configurable via `CONFIG_WIFI_TX_POWER` in `runtime_config.h` (default: 15dBm)

### ESP32 Not Running Without USB/Serial Monitor

**Fixed in v2.0**: The firmware now runs independently of Serial connection status.

**Previous Issue**: ESP32 would only run when USB was connected and Serial monitor was open, due to blocking `Serial.flush()` calls.

**Solution**: 
- Removed all blocking `Serial.flush()` calls
- Serial operations are now non-blocking (buffer output, drain when connected)
- Critical messages use ESP_LOG (always works, even without Serial)
- Buffer space checks prevent blocking when Serial buffer is full

**Result**: ESP32 now runs normally on external power without USB/Serial connection.

### Watchdog Timeout / System Reset After WiFi Init

**Fixed in v2.0**: Runtime watchdog timeout resolved by making TCP server socket non-blocking.

**Previous Issue**: ESP32 would reset ~10 seconds after WiFi initialization due to watchdog timeout. The `network_camera` task was blocked on `accept()` waiting for TCP clients.

**Solution**: 
- TCP server socket set to non-blocking mode using `fcntl()`
- `accept()` returns immediately when no client available (errno=EAGAIN)
- Task can feed watchdog every loop iteration, preventing timeout
- Error handling distinguishes "no client available" from actual errors

**Result**: System runs indefinitely without watchdog resets, even when no TCP clients are connected.

### Health Endpoint Crashes ESP32

**Fixed in v2.0**: Enhanced health endpoint with proper string handling and buffer management.

**Previous Issue**: Accessing `/health` endpoint caused ESP32 to crash/restart.

**Solution**:
- Fixed String lifetime issues (store String objects before use)
- Increased JSON buffer to 3KB to prevent overflow
- Added buffer overflow protection with fallback error response
- Made JSON buffer static to avoid stack overflow
- Added null pointer safety checks for all string operations

**Result**: Health endpoint now provides comprehensive diagnostics without crashes.

## Changes from Original ELEGOO Firmware

| Item | Original | Refactored |
|------|----------|------------|
| Architecture | Monolithic main.cpp | Modular services |
| Pin definitions | WROVER (invalid for S3) | OV2640 ESP32-S3 GPIOs |
| Camera sensor | OV2640 (assumed) | OV2640 (verified) |
| XCLK pin | GPIO 45 (strapping) | GPIO 15 (safe) |
| I2C pins | GPIO 1/2 | GPIO 4/5 (OV2640 standard) |
| UART pins | GPIO0/1 (boot issues) | GPIO43/44 (hardware UART0) |
| LED pin | GPIO13/14 | GPIO3 (after boot) |
| Boot safety | None | Strapping pin protection |
| Diagnostics | Minimal | /health JSON endpoint |
| Build system | Arduino IDE | PlatformIO |
| Error handling | Basic | Structured with status tracking |

## License

Based on ELEGOO official firmware. Modified for ZIP robot integration.
