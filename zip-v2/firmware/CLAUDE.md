# CLAUDE.md — Firmware guidance

You're editing UNO (`uno/`) or ESP32-S3 cam (`esp32-cam/`) firmware.
This file gives local context; for repo rules see
[`/AGENTS.md`](../../AGENTS.md).

## Hardware reality

Read [`/docs/HARDWARE.md`](../../docs/HARDWARE.md) before changing
pinouts or board configs. Read
[`/docs/KNOWN_ISSUES.md`](../../docs/KNOWN_ISSUES.md) before debugging
"why doesn't the UART work" or "why won't the ESP32 boot."

## UNO firmware

### What it owns

- 100 Hz control loop (10 ms cycle time)
- Motor PWM via TB6612FNG H-bridge (STBY=D3 must be HIGH)
- Motor ramp / slew (battery-aware: full @ OK, 60% @ LOW, 33% @ CRIT)
- IMU (MPU6050 @ I²C 0x68) — 10 Hz yaw via complementary filter
- Ultrasonic, line, battery, servo, IR-remote (ignored)
- JSON-over-UART protocol at exactly **500000 baud**
  ([ADR 0003](../../docs/adr/0003-uart-500k-baud.md))
- Hardware watchdog (8 s) + software deadman (300 ms TTL on setpoints)

### What it does NOT own

- WiFi, Bluetooth, agent logic — those are the brain's job.
- Path planning or perception — too much CPU/RAM.
- Direct camera control (we have an ESP32 for that).

### Common edits

| Edit | File | Notes |
|---|---|---|
| Add a new sensor read | `src/main.cpp` (`task_sensors_slow`) | Add an N=… JSON handler too |
| Adjust motor ramp | `src/main.cpp` (`motion_controller`) | Test with `pio run -t upload` + scope/pio monitor |
| Tune battery thresholds | `include/config.h` or via `-D` flag in `platformio.ini` | Both must be guarded with `#ifndef` |
| Add a new macro | `include/macro_engine.h` | Non-blocking; updates each loop |
| Change baud | **Don't.** See ADR 0003 |

### Critical patterns

- **Guard every `-D`-overridable macro with `#ifndef`** in headers, or
  the build flag is silently shadowed. See
  [`/docs/KNOWN_ISSUES.md#pio--d-shadow-trap`](../../docs/KNOWN_ISSUES.md#pio--d-shadow-trap).
- **No dynamic allocation in motor paths.** RAM budget is ~2 KB on the
  UNO. `String` and `new`/`malloc` are forbidden anywhere the control
  loop touches.
- **STBY=HIGH before every motor write.** Hardware reality. Firmware
  enforces; new code paths must do the same.
- **No response on `N=200` setpoint.** Fire-and-forget. Sending a reply
  fills the TX buffer and breaks 50 Hz streaming. `N=201` STOP and
  `N=120` diagnostics DO respond.

### Build / flash

```bash
cd zip-v2/firmware/uno
pio run -e uno                    # build
pio run -e uno --target upload    # flash via USB
pio device monitor -b 500000      # serial monitor (note 500k, not 115.2k)
```

UNO auto-resets on DTR; expect an "R\n" boot marker within 500 ms of
serial open.

### Diagnostics

`N=120` returns a JSON snapshot:
- Current motion owner (DIRECT / SETPOINT / IDLE)
- Active PWM L/R
- Reset count + reason (WDT / brownout / external)
- RAM usage (typically ~1170/2048 bytes = 57%)
- IMU init state
- Safety layer state (OK / LOW / CRIT)
- Init sequence stage

Always run `N=120` after a firmware reflash to confirm bring-up
sequenced correctly.

### Memory note

When you add code, check the size report:

```
RAM:   [====      ]  57.0% (used 1167 bytes from 2048 bytes)
Flash: [=====     ]  53.8% (used 17310 bytes from 32256 bytes)
```

If RAM goes above ~80%, every operation that pushes to the stack
risks corruption. Servo `attach`/`detach` is stack-heavy; the firmware
already does pre/post RAM probes around it.

---

## ESP32-S3 camera firmware

### What it owns

- Wi-Fi STA join (joins home Wi-Fi, secrets in gitignored `secrets.h`)
- mDNS advertisement (`zip-esp32-cam.local`)
- OV2640 capture (VGA, JPEG quality 12, 10 MHz XCLK)
- MJPEG HTTP server (`:81/stream`) via `esp_http_server` (httpd, NOT
  the Arduino WebServer)
- `:80/health` JSON endpoint (SSID, IP, RSSI, uptime, hostname)

### What it does NOT own

- Image preprocessing or compression beyond OV2640's onboard JPEG.
- Network bridging (V1 had an AP-mode bridge that proxied UART over
  WebSocket; v2 retired that — see `firmware/archive/esp32-bridge-v1/`).
- AP mode (v1 used `ZIP_ROBOT` SSID; v2 is STA-only).

### Critical settings (don't change without testing)

- **XCLK = 10 MHz** (not 20). 20 MHz EMI-couples into the Wi-Fi
  antenna; throughput collapses. See KNOWN_ISSUES.
- **Use `esp_http_server` (httpd), NOT Arduino WebServer.** Arduino
  WebServer measured at 2.4 fps; httpd hits 15-25 fps at VGA.
- **`WiFi.setSleep(false)`.** Don't deep-sleep mid-streaming.
- **`board_build.arduino.memory_type = qio_opi`** — Quad flash, Octal
  PSRAM. PSRAM is required for VGA frame buffers.
- **4-pin CH340→GPIO0 connector stays UNPLUGGED** on the Elegoo shield.
  Plugged pulls GPIO0 LOW at boot → stays in bootloader forever. See
  KNOWN_ISSUES.

### Build / flash

```bash
cd zip-v2/firmware/esp32-cam
cp include/secrets.example.h include/secrets.h     # add your Wi-Fi creds
pio run -e esp32cam_sta                            # build
pio run -e esp32cam_sta --target upload            # flash via USB
pio device monitor -b 115200                       # serial monitor
```

If upload stalls, hold the BOOT button while plugging USB.

### Verification

After flash, check:

```bash
curl http://zip-esp32-cam.local/health
# Expect {"ssid":"...", "ip":"...", "rssi":...}

curl -I http://zip-esp32-cam.local:81/stream
# Expect 200 OK + multipart/x-mixed-replace
```

Open `http://zip-esp32-cam.local:81/stream` in a browser to see the
live feed. Frame rate should be 15-25 fps at VGA.

---

## Both firmwares

### Things to NEVER do

- **Don't add a `delay(>10ms)`** in either firmware's main loop without
  also yielding (`vTaskDelay` on ESP32, or breaking up the work). 10 ms
  blocks the UNO's control loop and breaks deadman timing.
- **Don't use floating-point** in UNO motor paths if you can avoid it.
  AVR has no FPU; every `float` op is software emulation.
- **Don't enable `Serial.println("debug")` spam in release.** Even at
  500000 baud, dropped chars in the JSON parser are a constant source
  of weird bugs.
- **Don't add new `#define` macros without `#ifndef` guards** if you
  ever intend to override them from `platformio.ini`.

### Archived firmwares

- `firmware/archive/esp32-bridge-v1/` — V1 AP-mode WiFi↔UART bridge.
  Reference value: rate-limiting pattern, dead-man logic, WS→UART
  architecture.
- `firmware/archive/esp32-cam-v1/` — V1 AP-mode camera (multi-task).
  Reference value: GPIO definitions, PSRAM layout, XCLK frequency notes.

Don't reactivate these without a strong reason. The current v2
firmwares are simpler, lower power, and proven.
