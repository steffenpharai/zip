# Hardware

Complete bill of materials and reference notes for Zip. The robot is an
off-the-shelf Elegoo chassis with the Jetson and ESP32 as the only
"non-stock" additions.

## Bill of materials

### Robot chassis

| Item | Model / Spec | Notes |
|---|---|---|
| Chassis | Elegoo Smart Robot Car Kit v4.0 | Includes UNO clone + motor shield (TB6612FNG) + ultrasonic + line sensors + servo + IR remote (unused) |
| Motor controller | Built into Elegoo shield, TB6612FNG dual H-bridge | **Critical:** STBY pin (D3) must be HIGH to enable output. Firmware enforces. |
| MCU on shield | ATmega328P @ 16 MHz (Arduino UNO compatible) | UBRR=3 gives exact 500000 baud — use only that rate |
| IMU | MPU6050 (on Elegoo IMU module) | I²C `0x68`, SDA=A4, SCL=A5. Yaw via complementary filter |
| Ultrasonic | HC-SR04 mounted on servo head | TRIG=D13, ECHO=D12 |
| Line sensors | 3-channel reflective IR | A0/A1/A2 (right/middle/left) |
| Battery | 2S 18650 pack (~7.4 V nominal, ~8.4 V full) | Powers UNO/shield/motors only — **not** the Jetson |
| USB cable to PC | Standard micro-USB (CH340 USB-UART) | Used for firmware flashing and brain↔UNO serial when Jetson absent |

### Brain

| Item | Model / Spec | Notes |
|---|---|---|
| Compute | NVIDIA Jetson Orin Nano Super 8 GB | JetPack 6.2.1, L4T R36.4.7, CUDA 12.2 system. MAXN_SUPER power mode. |
| Storage | 256 GB NVMe SSD | Required for Docker images (splat-lab container is ~15.5 GB) |
| Swap | 16 GB on NVMe (`/swap8g` + extension) | Required for OOM-resistant gsplat training |
| Power | Regulated 5V / 3-5A USB-C **OR** 9-19V barrel | The 2S motor pack alone cannot supply this. **Open hardware task.** |
| Cooling | Active fan (Jetson dev kit stock) | Critical under sustained perception load |
| USB-C link to PC | USB-C cable supporting Ethernet-over-USB | Jetson exposes 192.168.55.1; PC sees 192.168.55.100 |
| Wi-Fi | Built-in (or M.2 add-in) | Joins home Wi-Fi for development access |
| Camera (bow) | Logitech C615 USB webcam, MJPEG capable | `/dev/video0` and `/dev/video1`. **Used by splat-lab + Phase 3 bow feed** |
| Camera (aft) | ESP32-S3 with OV2640 (see below) | Over Wi-Fi |

### ESP32-S3 camera module

| Item | Model / Spec | Notes |
|---|---|---|
| Board | ESP32-S3-DevKitC-1 with OV2640 | Quad flash + octal PSRAM (qio_opi). PSRAM is required for VGA frame buffers. |
| Power | 5V from Elegoo shield rail | Stable; no USB needed in operation |
| Programming | USB-C to PC | Required only for firmware flashing |
| Antenna | PCB or u.FL external | Doesn't matter much at small distances |
| Wi-Fi | STA mode (joins home network) | mDNS `zip-esp32-cam.local`, MJPEG at `:81/stream` |
| **Important** | **CH340→GPIO0 4-pin connector stays UNPLUGGED** | Would pin GPIO0 LOW at boot, preventing app start. See [KNOWN_ISSUES.md](./KNOWN_ISSUES.md#esp32-gpio0-latch). |

### PC (operator station)

| Item | Spec | Notes |
|---|---|---|
| OS | Windows 11 Pro | Dev tools assumed: VS Code, Cursor, Claude Code, PlatformIO, GitHub CLI, Git, Node 20+, npm, OpenSSH (built-in) |
| GPU | NVIDIA RTX 4070 Ti SUPER 16 GB | Reserved for future "PC brain" tier (LLM service over LAN) |
| Wi-Fi | Any home Wi-Fi | Same network as ESP32-S3 camera |
| USB-C to Jetson | USB-C cable supporting Ethernet-over-USB | Direct link, `192.168.55.0/24` |

## Power topology

```
                    Wall  ────► PC (laptop charger)
                                  │
                                  ▼
                              Operator PC

                                  ▲
                                  │ USB-C (Ethernet-over-USB)
                                  │ 192.168.55.x
                    Wall  ────► Jetson Orin Nano Super  (regulated 5V/3A)
                                  │
                                  ▼ USB ────► UNO (USB power feeds shield)
                                  │
                                  ▼ USB ────► Logitech C615 (bow cam)

                    2S 18650 pack ───► Elegoo shield 5V rail ───► ESP32-S3 cam
                                       │
                                       ▼
                                       Motors (PWM + direction)
                                       Servo
                                       Sensors
```

When operating off-tether (drive tests), the UNO is powered from the
motor pack via the Elegoo shield. The Jetson must have its own
regulated 5V/3-5A supply — the 2S motor pack at ~7.4 V cannot directly
power it (would need a buck converter that hasn't been sized yet — open
hardware task).

## Pinouts

### UNO (Elegoo shield wiring)

| Pin | Function | Detail |
|---|---|---|
| D0 | UART RX | From USB-CH340 or Jetson UART |
| D1 | UART TX | To USB-CH340 or Jetson UART |
| D2 | (unused, header on shield) |
| D3 | **MOTOR STBY** | TB6612FNG enable — must be HIGH |
| D4 | (unused, header on shield) |
| D5 | MOTOR PWMA | PWM to motor A |
| D6 | MOTOR PWMB | PWM to motor B |
| D7 | MOTOR AIN_1 | Direction for motor A (HIGH=forward) |
| D8 | MOTOR BIN_1 | Direction for motor B (HIGH=forward) |
| D9 | (unused) |
| D10 | SERVO Z (camera tilt — present on shield, often unused) |
| D11 | SERVO Y (head pan / ultrasonic mount) |
| D12 | ULTRASONIC ECHO | HC-SR04 echo |
| D13 | ULTRASONIC TRIG | HC-SR04 trigger |
| A0 | LINE RIGHT | IR reflective sensor |
| A1 | LINE MIDDLE | IR reflective sensor |
| A2 | LINE LEFT | IR reflective sensor |
| A3 | BATTERY VOLTAGE | Voltage divider, 10-bit ADC |
| A4 | I²C SDA | To MPU6050 IMU |
| A5 | I²C SCL | To MPU6050 IMU |

### ESP32-S3 camera (OV2640 board)

OV2640 camera data + control pins use the standard ESP32-S3 + OV2640
mapping. XCLK is **deliberately 10 MHz** (not the more common 20 MHz)
to avoid EMI coupling into the Wi-Fi antenna — see KNOWN_ISSUES.

| Use | Pin | Notes |
|---|---|---|
| Power LED | (board-dependent) | |
| 4-pin shield connector | **UNPLUGGED** | See note above |
| All camera data pins | Per OV2640 schematic | Don't move them |

## Network topology

| Network | Address | Use |
|---|---|---|
| USB-C Ethernet | `192.168.55.0/24` (Jetson .1, PC .100) | Trusted dev link; brain WebSocket here |
| Home Wi-Fi | (your home subnet) | ESP32 cam mDNS, Jetson Wi-Fi access (192.168.86.47 in this lab), PC |
| Robot AP (V1, retained) | `ZIP_ROBOT` SSID, 192.168.4.1 | Old v1 ESP32 bridge served here — currently unused in v2 |

## Mounting (open hardware tasks)

These are physical setup tasks that need real fabrication or assembly:

- [ ] Jetson power source. Options: regulated 5V/3-5A USB-C buck from
      the 2S motor pack; separate 3S/4S pack for the Jetson; 9-19V barrel
      from a step-up converter. Each has trade-offs in weight and run
      time.
- [ ] Jetson chassis mount. The Jetson dev kit is ~7×10 cm — won't fit
      on the shield without a riser. 3D-printed mount or aluminum
      standoffs.
- [ ] Bow camera (C615) mount. Currently loose; needs to be rigidly
      attached to the chassis with known offset for Phase 6 anchored
      objects.
- [ ] Aft camera (ESP32-S3) mount and antenna routing.

## Where to buy / source

| Item | Source | Notes |
|---|---|---|
| Elegoo Smart Robot Car Kit v4.0 | Amazon, Elegoo direct | ~$70 |
| Jetson Orin Nano Super dev kit | NVIDIA, Arrow, SparkFun | ~$249 |
| Logitech C615 | Amazon, Logitech | ~$30 |
| ESP32-S3-DevKitC-1 with OV2640 | Amazon, AliExpress, Adafruit | ~$15 |
| 256 GB NVMe SSD (Jetson) | Anywhere | Sized for splat-lab container |
| 2S 18650 holder + cells | Amazon | Choose protected cells |
| MPU6050 module | Already in Elegoo IMU pack | |
| Wires / standoffs / mounts | Local hardware / 3D print | |

## Reference: previous hardware investigations

- [reference_jetson_brltty_ch340_gotcha.md](../../C:/Users/phara/.claude/projects/C--Zip/memory/reference_jetson_brltty_ch340_gotcha.md)
  — brltty udev rule hijacks CH340 on JP6.x → `/dev/ttyUSB0` disappears.
  Rename the rule to fix. Also: L4T kernel doesn't ship `ch341.ko`; build
  from upstream Linux source.
- [reference_esp32_flash_hardware.md](../../C:/Users/phara/.claude/projects/C--Zip/memory/reference_esp32_flash_hardware.md)
  — what flash paths work/fail on the Elegoo V4.0 ESP32-S3 specifically.
  Read before attempting any flash ops.
- [reference_jetson_perception_deploy.md](../../C:/Users/phara/.claude/projects/C--Zip/memory/reference_jetson_perception_deploy.md)
  — YOLO11 deploy on the Jetson (onnxruntime-gpu, numpy version pin,
  CUDA EP), camera fanout hub, `/var/lib/zip` snapshot path due to
  read-only home.
