# ZIP V2 — Deploy from cold

How to take a freshly-flashed Jetson and a robot with no firmware loaded
to a working system you can drive from a browser. If you're picking up
an already-paired setup, skip to "Daily operations".

## Prerequisites

- Hardware:
  - Elegoo SmartCar Kit V4.0 (UNO + SmartCar shield + OV2640 ESP32-S3 cam)
  - NVIDIA Jetson Orin Nano Super
  - Logitech C615 (or any UVC webcam)
  - USB-A→USB-B cable (shield), USB-C cable (Jetson), USB-C cable (ESP32)
  - Home 2.4 GHz Wi-Fi with a known SSID + password
- PC software:
  - Node 18+ (for the HUD: `npm run dev:local`)
  - Python 3.11+ with `pip` (for tooling: esptool, avrdude wrappers)
  - PlatformIO Core (`pip install platformio`)
  - `gh` CLI authenticated as the GitHub user
  - OpenSSH (Windows 10+ has this in `C:\Windows\System32\OpenSSH\ssh.exe`)
- Repos cloned:
  - `git clone git@github.com:steffenpharai/zip-v2.git C:\Zip`
  - The nested `jetson/` directory is its own repo — agents will clone
    it onto the Jetson, not into the outer worktree.

## Step 1 — Jetson first boot

Follow [`JETSON_BRINGUP.md`](./JETSON_BRINGUP.md). Key endpoints when
that's done:

- Jetson hostname: `zip-jetson` (or whatever you set).
- SSH config alias on PC: `Host zip-jetson` → `192.168.55.1` (USB-C bridge).
- Passwordless sudo enabled for the `zip` user (`/etc/sudoers.d/zip-nopasswd`).
- `gh` auth via `~/.netrc` HTTPS token (copied from root's `gh` config).

## Step 2 — Kernel module + udev fixes on Jetson

The L4T kernel ships no `ch341` driver and Ubuntu's `brltty` udev rule
will eat the CH340. Both are documented in
[`KNOWN_ISSUES.md`](./KNOWN_ISSUES.md). One-time fixes:

```bash
ssh zip-jetson 'bash -s' << 'EOF'
# brltty udev rule disable
sudo mv /usr/lib/udev/rules.d/85-brltty.rules /usr/lib/udev/rules.d/85-brltty.rules.disabled
sudo mv /lib/udev/rules.d/85-brltty.rules /lib/udev/rules.d/85-brltty.rules.disabled 2>/dev/null || true
sudo udevadm control --reload-rules
sudo udevadm trigger --subsystem-match=usb

# ch341 build (kernel headers are pre-installed via nvidia-l4t-kernel-headers)
mkdir -p ~/build/ch341 && cd ~/build/ch341
curl -fsSL -o ch341.c "https://git.kernel.org/pub/scm/linux/kernel/git/stable/linux.git/plain/drivers/usb/serial/ch341.c?h=v$(uname -r | cut -d- -f1)"
cat > Makefile <<'MK'
obj-m := ch341.o
KDIR := /lib/modules/$(shell uname -r)/build
PWD  := $(shell pwd)
default:
	$(MAKE) -C $(KDIR) M=$(PWD) modules
MK
make -j4
sudo install -m 644 ch341.ko /lib/modules/$(uname -r)/kernel/drivers/usb/serial/
echo -e "ch341\nusbserial" | sudo tee /etc/modules-load.d/ch341.conf
sudo depmod -a
sudo modprobe usbserial
sudo modprobe ch341

# zip user needs dialout for /dev/ttyUSB0
sudo usermod -aG dialout zip
EOF
```

Verify `/dev/ttyUSB0` shows up persistently:

```bash
ssh zip-jetson 'ls -la /dev/ttyUSB0'
```

If it doesn't, the brltty rule wasn't fully disabled. Check
`dmesg | grep brltty`.

## Step 3 — Flash the UNO firmware

```bash
# Build on PC (PlatformIO):
cd C:\Zip\robot\firmware\zip_robot_uno
pio run -e uno

# Flash from the Jetson (since the shield's USB-B lives there in normal operation):
scp .pio/build/uno/firmware.hex zip-jetson:/tmp/uno.hex
ssh zip-jetson '
  sudo systemctl stop zip-brain.service 2>/dev/null
  sudo avrdude -c arduino -p atmega328p -P /dev/ttyUSB0 -b 115200 \
    -U flash:w:/tmp/uno.hex:i
  sudo systemctl start zip-brain.service
'
```

If `/dev/ttyUSB0` is busy: the brain is already running and holding it.
The `systemctl stop` line takes care of that — make sure you don't skip
it.

## Step 4 — Flash the ESP32-S3 STA firmware

```bash
# Create secrets.h locally (never committed):
cat > C:\Zip\robot\firmware\zip_esp32_cam_sta\include\secrets.h <<EOF
#pragma once
#define ZIP_WIFI_SSID     "YourHomeSSID"
#define ZIP_WIFI_PASSWORD "your-actual-password"
EOF

# Connect USB-C to the ESP32 module. Build + upload:
cd C:\Zip\robot\firmware\zip_esp32_cam_sta
pio run -e esp32cam_sta -t upload --upload-port COM4

# Find the ESP32 IP on your network. Easiest path: from the Jetson,
# since the Jetson is on the same Wi-Fi as the ESP32 will join.
ssh zip-jetson 'getent hosts zip-esp32-cam.local'
# → 192.168.x.y zip-esp32-cam.local
```

**Important**: keep the SmartCar shield's 4-pin connector between the
shield's CH340 and the ESP32 *unplugged*. It pins GPIO0 low at boot →
chip enters bootloader, doesn't run the firmware. See
[`KNOWN_ISSUES.md`](./KNOWN_ISSUES.md#esp32-s3-stuck-in-bootloader).

## Step 5 — Deploy zip-brain to the Jetson

```bash
ssh zip-jetson 'bash -s' << 'EOF'
git clone https://github.com/steffenpharai/zip-brain.git ~/zip
cd ~/zip
python3 -m venv .venv
.venv/bin/pip install --upgrade pip
.venv/bin/pip install -r requirements.txt

# Install systemd unit
sudo install -m 644 systemd/zip-brain.service /etc/systemd/system/zip-brain.service
sudo systemctl daemon-reload
sudo systemctl enable zip-brain.service

# Configure runtime env (UART baud + AFT camera URL):
sudo mkdir -p /etc/systemd/system/zip-brain.service.d
sudo tee /etc/systemd/system/zip-brain.service.d/uart.conf >/dev/null <<UNIT
[Service]
Environment="ZIP_UNO_BAUD=500000"
UNIT
sudo tee /etc/systemd/system/zip-brain.service.d/cameras.conf >/dev/null <<UNIT
[Service]
Environment="ZIP_CAM_AFT_URL=http://zip-esp32-cam.local:81/stream"
UNIT
sudo systemctl daemon-reload
sudo systemctl restart zip-brain.service

# Probe:
sleep 2
curl -s http://localhost:8080/health
EOF
```

You should see `uno_connected: true`, `cameras: ["bow", "aft"]`.

## Step 5b — Perception backend (Phase 4)

YOLO11 runs on the Jetson via `onnxruntime-gpu` (CUDA EP). The brain venv
needs three things the base install doesn't have: system OpenCV, numpy 1.26,
and onnxruntime-gpu.

```bash
ssh zip-jetson 'bash -s' << 'EOF'
# 1. Let the brain venv see the system OpenCV (apt cv2 4.8, no rebuild):
sed -i "s/include-system-site-packages = false/include-system-site-packages = true/" ~/zip/.venv/pyvenv.cfg

# 2. numpy 1.26 (system numpy 1.21 is too old for onnxruntime 1.24) + the
#    onnxruntime-gpu Jetson wheel. The jetson-ai-lab index is the source;
#    the .dev host is flaky — .io is the working mirror.
~/zip/.venv/bin/pip install "numpy==1.26.4"
~/zip/.venv/bin/pip install onnxruntime-gpu==1.24.0 \
  --extra-index-url https://pypi.jetson-ai-lab.io/jp6/cu126

# 3. Place the model where the brain expects it:
mkdir -p ~/zip/models
#   copy yolo11n.onnx (Ultralytics YOLO11-nano ONNX export) to:
cp /path/to/yolo11n.onnx ~/zip/models/yolo11n.onnx

# 4. Snapshots need a writable dir — ~/zip is read-only under the unit's
#    ProtectHome. The unit's StateDirectory=zip provides /var/lib/zip; the
#    ZIP_PERCEPTION_SNAPSHOT_DIR env (drop-in) points there.
sudo systemctl daemon-reload && sudo systemctl restart zip-brain
EOF
```

Verify: `curl -s http://192.168.55.1:8080/perception/state` →
`{"enabled":true,"backend":"ort-cuda"}`. The brain log shows
`detector: onnxruntime ready (ort-cuda)` and `perception: detect loop start`.

> TensorRT EP (FP16) is ~2× faster but its first-run engine build takes
> minutes and the cache dir must be writable. It's gated off by default
> (`ZIP_PERCEPTION_TRT=0`); CUDA EP is ~31 fps standalone, far over the 5 Hz
> the loop runs at. Enable later once a warm cache exists.

## Step 6 — Start the HUD on the PC

```bash
cd C:\Zip
npm install
npm run dev:local
```

Open `http://localhost:3000/v2`. Within ~3 seconds you should see:

- Mission bar: ONLINE pulse dot, UNO ATTACHED `/dev/ttyUSB0`.
- Telemetry: battery + ultrasonic populating.
- Cameras: both BOW and AFT showing the LIVE indicator.
- UART log: streaming JSON in/out.
- WASD/arrow keys move the robot, space stops it.

## Daily operations

Once paired, you just need to:

```bash
# PC
cd C:\Zip && npm run dev:local

# Jetson (already running as systemd, but if you change code):
ssh zip-jetson 'cd ~/zip && git pull && sudo systemctl restart zip-brain'

# Tail brain logs:
ssh zip-jetson 'sudo journalctl -u zip-brain -f'
```

For firmware changes, see
[`DEV_WORKFLOW.md`](./DEV_WORKFLOW.md#updating-the-uno-firmware).

## Smoke tests

These should all pass after a successful deploy:

```bash
# 1. Brain health
curl -s http://192.168.55.1:8080/health | python -m json.tool

# 2. Camera registry
curl -s http://192.168.55.1:8080/cam/list | python -m json.tool

# 3. BOW stream produces JPEG frames (run for 3s, count SOI markers)
timeout 3 curl -s http://192.168.55.1:8080/cam/bow | grep -c $'\xff\xd8'

# 4. AFT stream (proxied through Jetson)
timeout 3 curl -s http://192.168.55.1:8080/cam/aft | grep -c $'\xff\xd8'

# 5. ESP32 directly
ssh zip-jetson 'curl -s http://zip-esp32-cam.local:81/health'

# 6. Perception is up and on the GPU
curl -s http://192.168.55.1:8080/perception/state   # {"enabled":true,"backend":"ort-cuda"}
```
