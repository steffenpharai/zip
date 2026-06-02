# Jetson Orin Nano Super — Known Facts

Captured during Phase 1 bringup on 2026-06-02. Re-run the inventory if anything below is suspect; until then, treat as ground truth.

## Identity

| | |
|---|---|
| Board | NVIDIA Jetson Orin Nano (Super dev kit, SD-card image) |
| L4T release | R36.4.7 (build GCID 42132812, Thu Sep 18 22:54:44 UTC 2025) |
| JetPack | 6.2.1 (matches L4T 36.4.7) |
| Kernel | Linux 5.15.148-tegra aarch64, SMP PREEMPT |
| Hostname | `zip` |
| Login | user `zip`, password `zip1` (key-based SSH preferred — see SSH section below) |
| Storage | 117 GB SD card (mmcblk0p1 is /), 88 GB free |

## SSH access from PC

Two paths, both keyless:

```
ssh zip-jetson           # USB-C bridge (192.168.55.1)
ssh zip-jetson-wifi      # home Wi-Fi (192.168.86.47) — added below
```

PC's SSH key: `~/.ssh/id_ed25519` (ed25519, no passphrase, comment `zip-dev@STEFFEN-DESKTOP`).
Jetson's authorized_keys: `/home/zip/.ssh/authorized_keys` (single entry, this key).
Jetson host-key fingerprint (ed25519): `SHA256:W8NzCb1IoXI4qnA/1Opg5YOG6bG38a01iA5H/Ef6LIQ`.

## Software stack

| Component | Version |
|---|---|
| CUDA | 12.6.68 (`/usr/local/cuda-12.6` + symlink `/usr/local/cuda`) |
| TensorRT | 10.3.0.30 (built against CUDA 12.5) |
| cuDNN | 9.3.0.75 (libcudnn9-cuda-12, dev, samples, static) |
| Python | 3.10.12 (`/usr/bin/python3`) |
| Docker | Installed (`docker0` bridge up) |
| ROS 2 | **Not installed** (intentional for now) |
| `nvidia-jetpack` metapackage | **Not installed** (Candidate 6.2.1+b38) — needed for full dev headers/samples |

## Hardware details

- **CPU**: 6× ARM Cortex-A78AE, 1 thread/core, 3 cores/cluster (2 clusters), aarch64
- **RAM**: 7.4 GiB total, 1.3 GiB used at idle baseline
- **Swap**: 3.7 GiB across 6 zram devices (no disk swap)
- **Power mode**: MAXN_SUPER (mode 2) — maximum-performance mode for the Super variant
- **GPU**: Ampere, accessed via `tegrastats` (no `nvidia-smi` on Tegra — that's normal)

## Network interfaces

| Iface | State | Notes |
|---|---|---|
| `wlP1p1s0` | UP | Wi-Fi 5/6 module installed, connected to `TellMyWifILoveHer` (192.168.86.47/24) |
| `l4tbr0` | UP | USB-C network bridge, **192.168.55.1/24**; this is how we SSH today |
| `enP8p1s0` | DOWN | Built-in Gigabit Ethernet port (available for future dev wiring) |
| `usb0`, `usb1` | UP (link-local) | USB-C dual-network endpoints |
| `can0` | DOWN | CAN bus (unused) |
| `docker0` | UP | Docker bridge (172.17.0.1/16) |

## Connected peripherals (USB bus)

| Device | VID:PID | Notes |
|---|---|---|
| **Logitech HD Webcam C615** | `046d:082c` | UVC webcam — exposes `/dev/video0` and `/dev/video1`. **This is the V1 vision camera.** |
| IMC Networks Bluetooth Radio | `13d3:3549` | Built-in BT (not used for V2 yet) |
| Areson MR-K013 Multicard Reader | `25a7:fa61` | Card reader (not used) |
| Realtek 4-port USB 2.0 hub | `0bda:5489` | Internal hub |
| Realtek 4-port USB 3.0 hub | `0bda:0489` | Internal hub |

## Camera (Logitech HD Webcam C615) — VERIFIED

- Exposes `/dev/video0` (and `/dev/video1` for metadata)
- Capture pipeline works end-to-end (v4l2-ctl → MJPEG 640×480 → file → SCP to PC, single 16.7 KB JPEG transferred clean)
- YUYV modes confirmed: 640×480, 432×240, 320×240, 176×144, 160×120 at 5/7.5/10/15/20/24/30 fps
- MJPG mode also supported (the test capture used MJPG and produced valid JPEG output)
- Test frame at `C:\Zip\firmware_backup\jetson_phase1\cam_test.jpg` (intentionally dark — first frame before AGC; verifies path, not picture quality)
- Tegra ISP also exposed at `/dev/media0` — available for future CSI camera (not used yet)

## Installed during Phase 1 bringup

- `v4l-utils` (for `v4l2-ctl`)
- `gstreamer1.0-tools` (for `gst-launch-1.0`, `gst-inspect-1.0`)
- `tmux`, `htop` (dev convenience)

## Jetson ↔ UNO UART — VERIFIED

- Shield's USB-B (CH340) → Jetson USB-A → `/dev/ttyUSB0` @ 115200 baud
- Same JSON protocol the PC used:
  - `{"N":0,"H":"ping"}` → `{hello_ok}`
  - `{"N":23,"H":"batt"}` → `{batt_7897}` (7.90 V)
  - `{"N":21,"H":"u","D1":2}` → `{u_44}` (44 cm)
- UNO boot banner over the link: `HW:ELGV11TB imu=1 batt=7897` / `INIT:done batt=7897 imu=1 yaw=0`

### How we got there (two non-obvious fixes)

1. **L4T kernel doesn't ship the `ch341` driver.** Built from upstream Linux 5.15.148 source (matches our kernel exactly) against the installed `nvidia-l4t-kernel-headers`:
   - Build dir: `~/build/ch341/` on the Jetson
   - Sources: `ch341.c` fetched from `https://git.kernel.org/pub/scm/linux/kernel/git/stable/linux.git/plain/drivers/usb/serial/ch341.c?h=v5.15.148`
   - Module installed at `/lib/modules/$(uname -r)/kernel/drivers/usb/serial/ch341.ko`
   - Auto-load enabled via `/etc/modules-load.d/ch341.conf` (lines: `ch341`, `usbserial`)
   - Bonus: same recipe works for any Linux source tag — just change the `?h=v...` version

2. **`brltty` udev rule was hijacking the CH340 device.** Disabled by renaming `/usr/lib/udev/rules.d/85-brltty.rules` → `.disabled-by-zip` (and `/lib/udev/rules.d/85-brltty.rules` likewise). This is a well-known Ubuntu issue — `brltty` greedily claims any device with a `1a86:7523` (CH340) descriptor as a potential Braille terminal. Confirmed the rule is the only thing in the brltty packaging that needs to go for our purpose. The fix survives reboot.

### Tools / packages installed during Phase 1

- `build-essential` (already present)
- `v4l-utils`, `gstreamer1.0-tools` (camera tooling)
- `tmux`, `htop` (dev convenience)
- `python3-serial` (Ubuntu apt package; `serial.__version__ == "3.5"`)
- ch341 kernel module (built from source, installed permanently)

### Sudo policy

Currently piping `zip1` to `sudo -S` for one-shot privileged commands. Fine for bringup; **for Phase 2+ consider** NOPASSWD sudo for the `zip` user (`/etc/sudoers.d/zip-nopasswd` with `zip ALL=(ALL) NOPASSWD: ALL`) — standard dev-jetson convention, removes the password-piping from every operational command.

### Deferred to Phase 2

- `nvidia-jetpack` metapackage install (~3 GB; brings in TRT samples + multimedia API headers; we only need this when we start writing C++ TRT code or rebuilding multimedia stack — Python+pip-installed Ultralytics doesn't need it)
- `.bashrc` tweaks (CUDA path exports, conda/venv setup)
- VS Code Remote-SSH workflow (open this folder from PC's VS Code as `zip-jetson`)

## Open decisions for Phase 2 (deferred)

- **Internal bus**: ROS 2 Humble vs. zmq/NATS pubsub. Will decide after first service prototype.
- **MJPEG vs. H.264 / WebRTC** for camera streaming. Start MJPEG (simple), upgrade later.
- **Local LLM** for offline routing: which Ollama model fits this Jetson (8 GB RAM shared with GPU)?

## How to rebuild this file

```powershell
# from the PC:
ssh zip-jetson 'bash -s' < some-inventory-script.sh
```
A canonical inventory script lives at `C:\Zip\scripts\jetson-inventory.sh` (TBD).
