# ZIP ESP32 Bridge

Production-grade ESP32 Access Point bridge for the ZIP Robot. Enables direct WiFi control of the robot by bridging WebSocket connections to UART communication with the Arduino UNO.

## Features

- **WiFi Access Point**: Creates `ZIP_ROBOT` network for direct connection
- **WebSocket Server**: Real-time bidirectional communication at `/robot`
- **UART Bridge**: Transparent forwarding to Arduino UNO at 115200 baud
- **Dead-Man Safety**: Automatic ESTOP on disconnect or timeout
- **Rate Limiting**: Motion commands limited to 50Hz to prevent UART overflow
- **Health Endpoint**: JSON status at `/health`
- **mDNS Support**: Access via `zip.local`

## Quick Start

```bash
# 1. Build firmware
cd robot/firmware/zip_esp32_bridge
pio run

# 2. Flash to ESP32
pio run -t upload

# 3. Monitor debug output
pio device monitor
```

## Network Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| SSID | `ZIP_ROBOT` | WiFi network name |
| Password | `zip12345` | WiFi password |
| AP IP | `192.168.4.1` | Fixed IP address |
| WebSocket | `ws://192.168.4.1:81/robot` | Control endpoint |
| Health | `http://192.168.4.1/health` | Status endpoint |
| mDNS | `zip.local` | Alternative hostname |

## Wiring

### ESP32 to Arduino UNO Connection

```
ESP32 DevKit          Arduino UNO
┌─────────────┐       ┌─────────────┐
│             │       │             │
│  GPIO16 (RX)├───────┤TX (Pin 1)   │
│  GPIO17 (TX)├───────┤RX (Pin 0)   │
│         GND ├───────┤GND          │
│             │       │             │
└─────────────┘       └─────────────┘
```

| ESP32 Pin | UNO Pin | Description |
|-----------|---------|-------------|
| GPIO16 | TX (Pin 1) | ESP32 receives from UNO |
| GPIO17 | RX (Pin 0) | ESP32 sends to UNO |
| GND | GND | Common ground |

**Important Notes:**
- When uploading to Arduino UNO, **disconnect the ESP32 TX wire** (GPIO17) to avoid conflicts
- The ESP32 and UNO must share a common ground
- No level shifting required (ESP32 GPIO is 3.3V but UNO tolerates this on RX)
- Power ESP32 independently (USB) or from 5V rail (check your board's regulator)

### Alternative Pin Configuration

If GPIO16/17 are not available on your ESP32 variant, edit `include/config.h`:

```cpp
#define UART_RX_PIN  16  // Change to your RX pin
#define UART_TX_PIN  17  // Change to your TX pin
```

## Connecting to the Robot

### 1. Connect to WiFi

1. Power on the robot (ESP32 will boot)
2. On your PC/phone, connect to WiFi network `ZIP_ROBOT`
3. Password: `zip12345`

### 2. Verify Connection

Open a browser and navigate to:
- `http://192.168.4.1/health` - JSON status
- `http://192.168.4.1/` - Info page

### 3. Configure ZIP HUD

Set the environment variable in your `.env.local`:

```env
NEXT_PUBLIC_ROBOT_BRIDGE_WS_URL=ws://192.168.4.1:81/robot
```

Or using mDNS (if your OS supports it):

```env
NEXT_PUBLIC_ROBOT_BRIDGE_WS_URL=ws://zip.local:81/robot
```

### 4. Test WebSocket

Using websocat or similar tool:

```bash
# Install websocat
cargo install websocat

# Connect and send test command
echo '{"N":0,"H":"ping"}' | websocat ws://192.168.4.1:81/robot
```

## Protocol

The ESP32 bridge is transparent - it forwards JSON messages between WebSocket and UART.

### WebSocket → UART

- Text frames are forwarded directly
- Newline (`\n`) is appended if missing
- Binary frames are rejected

### UART → WebSocket

- Lines ending with `\n` are parsed
- Only valid JSON lines (starting with `{`, ending with `}`) are forwarded
- Debug/garbage output is filtered out

### Motion Commands

These commands are subject to rate limiting (50Hz max):

| Command | Description |
|---------|-------------|
| `{"N":200,"D1":v,"D2":w,"T":ttl}` | Setpoint streaming (velocity, yaw rate, TTL) |
| `{"N":999,"D1":left,"D2":right}` | Direct motor PWM control |

### Stop Command

```json
{"N":201,"H":"stop"}
```

## Safety Behavior

### Disconnect ESTOP

When the WebSocket controller disconnects (browser closed, network lost):
- ESP32 immediately sends `{"N":201,"H":"estop"}\n` to UNO
- Robot motors stop instantly
- Next WebSocket connection becomes new controller

### Motion Watchdog

While connected, if no motion command (`N=200` or `N=999`) is received for **500ms**:
- ESP32 sends single ESTOP command
- Prevents runaway if HUD freezes
- Watchdog resets when next motion command arrives

### Single Controller Mode

- Only one WebSocket client can control the robot at a time
- First connection becomes the "controller"
- Additional connections are immediately closed
- When controller disconnects, next connection can take over

## Health Endpoint

`GET http://192.168.4.1/health`

```json
{
  "ok": true,
  "ssid": "ZIP_ROBOT",
  "ip": "192.168.4.1",
  "ws_port": 81,
  "ws_path": "/robot",
  "clients": 1,
  "controller": true,
  "uart_baud": 115200,
  "rx_lines": 1234,
  "tx_lines": 567,
  "dropped_lines": 3,
  "last_motion_ms_ago": 45
}
```

| Field | Description |
|-------|-------------|
| `ok` | Always true if responding |
| `ssid` | AP network name |
| `ip` | AP IP address |
| `ws_port` | WebSocket server port |
| `ws_path` | WebSocket path |
| `clients` | Number of connected WebSocket clients |
| `controller` | true if a controller is connected |
| `uart_baud` | UART baud rate |
| `rx_lines` | Lines received from UNO |
| `tx_lines` | Lines sent to UNO |
| `dropped_lines` | Lines dropped (rate limit, non-JSON, overflow) |
| `last_motion_ms_ago` | Milliseconds since last motion command (null if none) |

## Configuration

All settings are in `include/config.h`. Rebuild after changes.

### WiFi Settings

```cpp
#define WIFI_SSID       "ZIP_ROBOT"   // Network name
#define WIFI_PASSWORD   "zip12345"    // Password (empty = open)
#define WIFI_CHANNEL    1             // WiFi channel
```

### Safety Settings

```cpp
#define MOTION_WATCHDOG_MS    500   // Dead-man timeout (ms)
#define MOTION_RATE_LIMIT_MS  20    // Min interval = 50Hz max
```

### UART Settings

```cpp
#define UART_BAUD      115200  // Must match UNO firmware
#define UART_RX_PIN    16      // ESP32 RX <- UNO TX
#define UART_TX_PIN    17      // ESP32 TX -> UNO RX
```

### Debug Settings

```cpp
#define DEBUG_LOGS     1       // Enable debug output to Serial
```

## Build Variants

```bash
# Standard build
pio run -e esp32bridge

# Debug build (verbose logging)
pio run -e esp32bridge_debug

# Release build (minimal logging)
pio run -e esp32bridge_release
```

## Troubleshooting

### Can't See WiFi Network

1. Check ESP32 is powered (LED on)
2. Monitor serial output for errors: `pio device monitor`
3. Try a different WiFi channel in config
4. Ensure no other device is using same SSID

### WebSocket Won't Connect

1. Verify you're connected to `ZIP_ROBOT` WiFi
2. Check IP is `192.168.4.1`
3. Test health endpoint first: `http://192.168.4.1/health`
4. Check if another client is already connected (single controller mode)

### Robot Not Responding

1. Check wiring (TX↔RX crossover)
2. Verify UNO firmware is running (LED patterns)
3. Monitor ESP32 serial for UART activity
4. Test with simple command: `{"N":0,"H":"ping"}`

### Motors Won't Stop

1. This should never happen with watchdog
2. Check ESP32 is still running (not crashed)
3. Verify ESTOP command in serial log
4. As last resort, power cycle robot

### Rate Limiting Too Aggressive

If motion feels laggy:
1. Reduce HUD streaming rate to 50Hz
2. Or increase `MOTION_RATE_LIMIT_MS` in config (not recommended above 30ms)

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        ZIP HUD (Browser)                     │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ WiFi (ZIP_ROBOT)
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                         ESP32 Bridge                         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │ HTTP Server │  │  WebSocket  │  │    Safety Module    │  │
│  │   :80       │  │   :81       │  │  - Watchdog (500ms) │  │
│  │  /health    │  │  /robot     │  │  - Disconnect ESTOP │  │
│  └─────────────┘  └──────┬──────┘  │  - Rate Limit (50Hz)│  │
│                          │         └──────────┬──────────┘  │
│                          ▼                    │             │
│                   ┌─────────────┐             │             │
│                   │ UART Bridge │◄────────────┘             │
│                   │  115200 8N1 │                           │
│                   └──────┬──────┘                           │
└──────────────────────────┼──────────────────────────────────┘
                           │ TX/RX
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                      Arduino UNO                             │
│                   ZIP Robot Firmware                         │
└─────────────────────────────────────────────────────────────┘
```

## Acceptance Tests

After flashing, verify these tests pass:

1. **WiFi Available**: Phone/PC sees `ZIP_ROBOT` network ✓
2. **Health Endpoint**: `http://192.168.4.1/health` returns JSON with `ok: true` ✓
3. **Ping Test**: Send `{"N":0,"H":"ping"}` via WebSocket, receive response ✓
4. **Rate Limiting**: Stream at 100Hz for 5s, verify ~50Hz forwarded ✓
5. **Disconnect ESTOP**: Close browser, verify ESTOP sent to UNO ✓
6. **Watchdog ESTOP**: Stop sending motion for 500ms, verify ESTOP sent ✓

## Version History

- **v1.0.0** - Initial release
  - WiFi AP mode
  - WebSocket bridge
  - Dead-man safety
  - Rate limiting
  - Health endpoint
  - mDNS support

