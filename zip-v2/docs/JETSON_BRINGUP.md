# Jetson Orin Nano Super — Bringup Checklist (Phase 1)

This is the agenda for when the Jetson is connected. It runs from "Jetson
just got powered on" to "ready to develop Phase 2 services on it." Every
item produces a recorded answer that goes into `docs/v2/JETSON_FACTS.md`
once known, so future-us doesn't need to re-derive anything.

---

## Goal of Phase 1

By the end of Phase 1:

1. We know exactly what JetPack version / CUDA / TensorRT / Python / disk
   layout the Jetson has.
2. We can SSH from this PC to the Jetson reliably without prompts.
3. We have a clean dev workflow: edit on PC → push to Jetson → run there →
   see output on PC.
4. The Jetson can talk to the UNO over UART with the same JSON protocol
   that worked on this PC (`{"N":0,"H":"ping"}` → `{hello_ok}`).
5. We can stream telemetry from UNO → Jetson → PC client.

That's the smallest "the Jetson is alive in our system" milestone.

---

## Connectivity options (pick one; we'll match to what's easiest for you)

| Option | Pros | Cons |
|---|---|---|
| **Wi-Fi to your home AP** (Recommended if Jetson has a Wi-Fi module) | Same network as PC, internet for `apt`, works anywhere | Slower than Ethernet, depends on AP |
| **Ethernet straight to PC** | Fastest, no dependencies on AP | PC needs to share its internet to Jetson, or Jetson goes offline for apt |
| **Ethernet to your home switch/router** | Fast, gets internet, gets LAN | Need a cable run to where the Jetson lives |
| **USB-C OTG/networking** | One cable from Jetson to PC, simple | Doesn't give Jetson internet directly |
| **HDMI + keyboard locally** | Useful for first-boot if other paths fail | Slow workflow, only for bringup |

Recommendation: **Wi-Fi to home AP** if Jetson has a Wi-Fi module installed; otherwise **Ethernet to your home router** as the default development network.

---

## Bringup steps (in order)

### Step 1 — First boot and identity

Connect Jetson to power + display (or headless if you've already set up
auto-login). On first run, capture:

- [ ] Hostname (default is `nano` or `jetson`; rename if desired — we'll
      use `zip-jetson` in docs)
- [ ] User account name + password
- [ ] IP address(es) on each network interface (`ip -br a`)
- [ ] JetPack version (`cat /etc/nv_tegra_release`)

### Step 2 — Confirm software stack

From the PC over SSH (or locally on Jetson with display):

```bash
# What we need to know:
uname -a                              # kernel + arch
cat /etc/nv_tegra_release             # JetPack
nvcc --version                         # CUDA version
python3 --version                      # Python
pip3 list | head -30                   # what's already installed
dpkg -l | grep -E 'tensorrt|cudnn'    # TensorRT + cuDNN
ls /usr/src/jetson_multimedia_api      # GStreamer + multimedia SDK
df -h                                  # disk layout
free -h                                # RAM (LPDDR5 shared; should show ~7-8 GB)
```

Record results in `docs/v2/JETSON_FACTS.md`.

### Step 3 — SSH from PC, key-based

On the PC:

```powershell
ssh-keygen -t ed25519 -C zip-jetson-dev   # if no key yet
ssh-copy-id -i ~/.ssh/id_ed25519.pub <jetson-user>@<jetson-ip>
ssh <jetson-user>@<jetson-ip>
```

Add to `~/.ssh/config`:

```
Host zip-jetson
    HostName <jetson-ip>
    User <jetson-user>
    IdentityFile ~/.ssh/id_ed25519
    ServerAliveInterval 30
```

Then `ssh zip-jetson` works from any terminal.

### Step 4 — Dev workflow (PC ↔ Jetson)

Pick one, document the choice:

| Option | Sync direction | Tooling |
|---|---|---|
| **`rsync` push from PC** | edit on PC → push → run on Jetson | bash one-liner; lowest friction |
| **`sshfs` mount Jetson on PC** | edit on PC files mounted from Jetson, run via SSH | nice UX, can be slow |
| **VS Code Remote-SSH** | edit Jetson files directly through VS Code | richest dev UX, requires VS Code |
| **Git on both** | push to GitHub, pull on Jetson | clean but slow iteration |

Recommendation for V2: **VS Code Remote-SSH** for live editing + **rsync
push** for releasing tagged code. Both, not one.

### Step 5 — Connect Jetson to UNO (UART proof)

Two paths, pick one:

**Path A — Via shield CH340 (same path we used from PC).** Move the
shield's USB-B cable from PC to Jetson. Shield switch stays in UPLOAD.
Jetson sees the CH340 as `/dev/ttyUSB0`.

**Path B — Direct UART pins from Jetson GPIO to UNO RX/TX.** Saves a USB
port but needs jumper wires.

Recommendation: **Path A** for Phase 1 (zero new wiring). Move to direct
UART later if we want the USB port free.

Test from Jetson (Python):

```python
import serial
s = serial.Serial('/dev/ttyUSB0', 115200, timeout=2)
s.write(b'{"N":0,"H":"ping"}\n')
print(s.read_until(b'}'))   # expect b'{hello_ok}'
```

Pass criterion: `{hello_ok}` comes back. Then test `N=23` (battery) and
`N=21` (ultrasonic).

### Step 6 — Decide camera

Inventory what we have:

- [ ] Any USB UVC webcam already in the house?
- [ ] Any CSI camera modules for Jetson? (Raspberry Pi v2 camera works
      with adapter; Arducam IMX477 etc.)
- [ ] Any RGBD camera (Intel RealSense, Orbbec)?

If nothing → buy one. Default recommendation: **Logitech C920** ($60-80,
UVC, works instantly with `v4l2`) for V1; **Intel RealSense D435i** ($300,
RGBD + IMU) for V2 if SLAM gets serious.

### Step 7 — TensorRT engine builds (preview)

Just to know what we're getting into:

```bash
pip3 install ultralytics
yolo export model=yolo11n.pt format=engine half=True device=0
# wait ~3-5 minutes; produces yolo11n.engine
```

Confirms TensorRT path works on this Jetson. We'll re-build the engines
properly in Phase 3.

### Step 8 — systemd service skeleton

Put a placeholder unit on the Jetson:

```
/etc/systemd/system/zip-uno-link.service
```

(Content TBD — Phase 2 work, but having the directory structure ready
helps.)

### Step 9 — Audit + document

Write `docs/v2/JETSON_FACTS.md` with everything we learned. Subsequent
phases reference it; we never re-discover.

---

## What we DON'T do in Phase 1

- Don't install Python services yet (Phase 2)
- Don't worry about on-robot mounting yet (Phase 6+ or whenever it makes sense)
- Don't worry about power budget / battery yet (until mounting)
- Don't set up internet reachability (Phase 10)
- Don't try to do SLAM (Phase 7)
- Don't migrate ESP32 firmware off the chip (deprecated for V2, just leave it)

The bar for Phase 1 done is **the Jetson can drive the UNO from a Python
script and we have a dev workflow**. Everything else is later.

---

## What I need from you when the Jetson is online

1. The IP address Jetson is reachable at
2. SSH user account name (and password for the first login — we'll switch
   to key-based right after)
3. Whether the Jetson has Wi-Fi installed or you're connecting via
   Ethernet
4. Any hardware constraints I should know (e.g., NVMe? SD card only?
   pre-installed cameras?)

Drop those in chat and I'll start the investigation.
