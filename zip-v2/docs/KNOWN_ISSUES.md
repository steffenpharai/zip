# ZIP V2 — Known Issues & Hardware Gotchas

Things the previous agent had to discover the hard way. If a future
behaviour matches a symptom listed here, **read this file first** before
digging in.

## L4T kernel does not ship `ch341.ko`

**Symptom:** plug the SmartCar shield (CH340 USB-serial) into the
Jetson, `lsusb` shows the device, but `/dev/ttyUSB0` does not appear.
`dmesg` says nothing useful.

**Cause:** NVIDIA's `nvidia-l4t-kernel` for JetPack 6.x ships
`usbserial`, `cp210x`, `ftdi_sio`, `option`, `usb_wwan` — but not
`ch341`.

**Fix:** build `ch341.c` from upstream Linux source against the
installed `nvidia-l4t-kernel-headers`. The recipe is in
[`DEPLOY.md` step 2](./DEPLOY.md#step-2--kernel-module--udev-fixes-on-jetson).

## `brltty` hijacks CH340 devices

**Symptom:** even with `ch341.ko` loaded, `/dev/ttyUSB0` appears
briefly then vanishes. `dmesg` shows
`usbfs: interface 0 claimed by ch341 while 'brltty' sets config #1`
and `ch341-uart: converter now disconnected from ttyUSB0`.

**Cause:** Ubuntu's `brltty` (Braille TTY) package — or its udev rule
shipped separately — claims any device with the CH340 VID/PID,
assuming it might be a Braille display.

**Fix:** rename the udev rule:

```bash
sudo mv /usr/lib/udev/rules.d/85-brltty.rules /usr/lib/udev/rules.d/85-brltty.rules.disabled
sudo mv /lib/udev/rules.d/85-brltty.rules /lib/udev/rules.d/85-brltty.rules.disabled
sudo udevadm control --reload-rules
sudo udevadm trigger --subsystem-match=usb
```

Survives reboot.

## ESP32-S3 stuck in bootloader

**Symptom:** firmware was just flashed cleanly, host reset succeeded
("Hard resetting via RTS pin..."), but esptool with `--before no_reset`
keeps finding the chip in bootloader. Serial monitor shows
`boot:0x23 (DOWNLOAD)` instead of the firmware boot banner.

**Two causes; both must be ruled out.**

### Cause A — host DTR holds GPIO0 low across resets

Windows' default USB-CDC enumeration asserts DTR. On the ESP32-S3's
native USB-Serial/JTAG, DTR=true → GPIO0 (strapping pin) low → boot mode
DOWNLOAD on the *next* reset.

**Fix:** open the serial port with `dtr=False, rts=False` *before*
calling open. If the chip is already in bootloader, the only reliable
escape is **physical RST button** on the ESP32 module.

### Cause B — SmartCar shield 4-pin connector

The Elegoo SmartCar shield has a 4-pin connector between its CH340 and
the ESP32-S3 module. When the Jetson holds `/dev/ttyUSB0` open for the
UNO, the CH340's DTR is asserted; this routes through the 4-pin
connector to ESP32 GPIO0 and pins it low.

**Fix:** unplug the 4-pin connector. The Jetson and ESP32 communicate
over Wi-Fi anyway; the shield's CH340 only needs to talk to the UNO.

This combo (A + B) was the entire reason Phase 3.3 took an afternoon
instead of an hour.

## `ARDUINO_USB_CDC_ON_BOOT=1` blocks `Serial.print` until host signals DTR

**Symptom:** ESP32-S3 STA firmware appears to be running (Wi-Fi
connects, mDNS works, HTTP endpoints respond), but `Serial.print()`
output never reaches the host.

**Cause:** with USB CDC on boot, `Serial` = USB-CDC. The Arduino-ESP32
core blocks `Serial.write()` until the host signals it's listening (via
DTR=true). If we open the serial port with `dtr=False` (to avoid the
bootloader trap above), the chip's print buffer fills and stalls.

**Fix:** in `setup()`, call `Serial.setTxTimeoutMs(0)` so the chip
discards print data instead of blocking when no host is listening. The
current `zip_esp32_cam_sta/src/main.cpp` does this.

## ESP32-S3 USB-Serial/JTAG `read_flash` regression

**Symptom:** `esptool --stub read_flash 0 0x800000` reliably dies at
offset 0x6a000 with "Packet content transfer stopped". `--no-stub`
works but is ~1 KB/s (one hour for 4 MB).

**Cause:** known esptool 5.x bug on ESP32-S3 USB-Serial/JTAG. The
*read* path has a ~5s watchdog that fires under sustained transfer.
*Write* paths are chunked and don't hit it.

**Fix:** `pip install esptool==4.8.1` (older known-good). Or just
accept that bit-perfect flash backups via USB-JTAG aren't worth the
ceremony — the source rebuilds an equivalent binary in 15 seconds.

## ESP32 OV2640 at 20 MHz XCLK gutters Wi-Fi throughput

**Symptom:** stream from `zip_esp32_cam_sta` is ~2 fps despite the
camera being capable of 15+. CPU and PSRAM look healthy. Wi-Fi RSSI
shows -75 dBm or worse.

**Cause:** OV2640 XCLK at 20 MHz EMI-couples into the on-board Wi-Fi
antenna. The V1 firmware documented this discovery in its config
comments; we forgot.

**Fix:** set `config.xclk_freq_hz = 10000000;` in `init_camera()`. Same
camera at 10 MHz XCLK runs at 12-15 fps over Wi-Fi reliably.

## HUD spawns 90+ WebSocket clients in minutes

**Symptom:** `/health` reports `clients: 93` shortly after the HUD
loads. Camera proxies stop delivering frames. Telemetry feels laggy.
Brain CPU climbs.

**Cause:** `useServerMessageBus()` returns a `{register, feed}` object
created via object-literal syntax — fresh identity on every render. The
`useEffect` in `useParallelWsBus` includes that object in its deps
array, so it tears down and rebuilds the socket every render. React
StrictMode's double-invoke compounds the problem.

**Fix:** memoise the bus in `useServerMessageBus` so its identity is
stable; depend only on `url` in `useParallelWsBus`'s effect (read the
bus via a ref). Already fixed in `lib/v2/useServerMessages.ts`. **Don't
revert it**.

## HUD `<img src>` opens duplicate camera connections

**Symptom:** brain logs show two simultaneous GStreamer pipelines
spawning for `/cam/bow`; the second fails with `Device '/dev/video0'
is busy`; neither renders.

**Cause:** React StrictMode double-invokes the `useEffect` in
`CameraFeed`. The previous version bumped a cache-bust counter inside
that effect, producing `?t=1` and then `?t=2` — two distinct URLs, two
browser-level requests, two GStreamer subprocesses.

**Fix:** the canonical URL is the bare stream URL with no
querystring. Only bump on actual stream error. Already fixed in
`components/v2/CameraFeed.tsx`. **Don't revert it either**.

## UNO firmware compile size pressure

The ATmega328P has 2 KB SRAM and 32 KB flash. The current `zip_robot_uno`
sits at ~67% flash and 59% RAM. Adding a feature can easily push it
over. Watch the `pio run` size report — if Flash > 90% or RAM > 75%,
something has to come out.

## `gh` 2.4 on Jetson is too old for `gh auth token`

Ubuntu 22.04's apt `gh` package is version 2.4 (2022). It lacks
`gh auth token`. To extract the OAuth token, parse
`~/.config/gh/hosts.yml` directly. Already noted in
[`DEV_WORKFLOW.md`](./DEV_WORKFLOW.md).

## ESP-IDF `httpd_server` >> Arduino `WebServer.h` for MJPEG

Don't bother optimising `WebServer.h`-based streamers. It's the wrong
tool. At 640×480 / quality 12 it tops out at 2-3 fps. The canonical
Espressif example uses `esp_http_server` with chunked sends — 12-15
fps over Wi-Fi from the same hardware. `zip_esp32_cam_sta` uses
`esp_http_server`.

## Frame timing: Jetson aiohttp `iter_chunked` buffers

The default `aiohttp` `iter_chunked(64KB)` reads until it has 64 KB
before yielding. For a low-fps multipart stream, that's seconds of
buffer delay before the browser sees the first frame.

**Fix:** use `iter_any()` (yields whatever's available immediately) and
a small `read_bufsize`. Already done in `zip_brain/camera.py`.
