# Changelog

ZIP V2 — every commit is in git; this file calls out only the notable
shipped milestones. V1 history is preserved at
[steffenpharai/Zip](https://github.com/steffenpharai/Zip).

## [V2 / Phase 3.5 — Drive latency squeeze] — 2026-06-02

End-to-end **keydown → motor at full speed** cut from ~300 ms to ~70 ms.

- HUD `useDriveInput` dispatches `onAxesChange` synchronously inside the
  keydown handler — first setpoint leaves in the same DOM task as the
  key press, no rAF or React render wait.
- HUD `useDriveTick` switched from a 50 ms `setInterval` to a rAF poll
  for the backup re-send path.
- UNO firmware ramp limiter: `RAMP_ACCEL_STEP_OK` 12 → 30 PWM/step.
- UNO firmware loop rate: `TASK_CONTROL_LOOP_HZ` 50 → 100 Hz (combined
  with the ramp bump, the practical ramp is 600 PWM/s → 3000 PWM/s).
- UNO firmware `KICKSTART_BOOST` 25 → 40 to break static friction
  immediately on the first setpoint after a stop.
- UART baud 115200 → 500000 on both UNO firmware and the Jetson
  `zip-brain` systemd env. 50-byte setpoint: 4.5 ms → 1.0 ms on the
  wire. (The original commit targeted 460800, which the ATmega328P @
  16 MHz cannot produce — UBRR=3 actually yields 500000 baud, an 8.5%
  delta well past UART tolerance. Plus two `#define` shadow bugs in
  `config.h` silently overrode the `-DSERIAL_BAUD=` and
  `-DTASK_CONTROL_LOOP_HZ=` build flags back to V1 defaults. Both
  fixed here: guards added, target baud realigned to an achievable
  exact UBRR value.)

## [V2 / Phase 3.3 — ESP32-S3 OV2640 as second camera] — 2026-06-02

- New firmware `robot/firmware/zip_esp32_cam_sta/`: STA-mode, joins
  home Wi-Fi, mDNS `zip-esp32-cam.local`, MJPEG via ESP-IDF
  `esp_http_server` on `:81/stream`. Replaces the V1 `zip_esp32_cam`
  AP-mode firmware for V2 use.
- Camera secrets go in gitignored `secrets.h`; template in
  `secrets.example.h`.
- Jetson `zip-brain` gained an HTTP proxy camera kind; `/cam/aft`
  proxies the ESP32 stream. Brain now exposes the camera list on
  `/cam/list`.
- HUD camera tile uses real `<img src>` for both cameras, with live /
  buffering indicators and error-driven cache-bust reconnect.
- Several HUD/brain bugs fixed along the way; details in
  [`docs/v2/KNOWN_ISSUES.md`](./docs/v2/KNOWN_ISSUES.md).

## [V2 / Phase 3.1+3.2 — Logitech C615 streaming + HUD] — 2026-06-02

- Jetson `zip-brain` module `camera.py`: GStreamer
  `v4l2src ! multipartmux ! fdsink` per active client, zero-transcode
  MJPEG passthrough. Endpoint `/cam/bow`.
- HUD `CameraFeed` switched from placeholder bezel to real multipart
  MJPEG rendering.
- Jetson camera registry env-driven (`ZIP_CAM_BOW_DEVICE` etc.) so a
  systemd unit can override defaults without touching code.

## [V2 / Phase 2 — Brain service + HUD] — 2026-06-02

- New repo `zip-brain` (cloned to `/jetson` here, gitignored by outer
  repo). Module layout: `bus`, `uno_link`, `motion` (gateway),
  `control_plane` (FastAPI + WebSocket). systemd unit, deploy.sh.
- WS protocol locked in (see [`docs/v2/PROTOCOLS.md`](./docs/v2/PROTOCOLS.md)).
- Sticky bus topics — `uno.status` and `telemetry.sample` replay last
  value to new subscribers, so freshly-connected HUDs aren't blank.
- New `app/v2/` HUD: cockpit-style layout with mission bar, telemetry
  panel (battery arc gauge, ultrasonic ranging bar, motor twin-rail),
  3D world viewport (R3F + Bloom + Vignette), drive panel (virtual
  joystick + WASD glyph + macros + rose-octagon E-STOP), bottom event
  log + UART console.
- Latency baseline established: ~300 ms keydown → motor (improved in
  3.5).

## [V2 / Phase 1 — Jetson bringup] — 2026-06-02

- Jetson Orin Nano Super flashed with JetPack 6.2.1, brought up over
  USB-C; characterised in [`docs/v2/JETSON_FACTS.md`](./docs/v2/JETSON_FACTS.md).
- Set up SSH key auth from PC; alias `zip-jetson` in `~/.ssh/config`.
- Two hardware gotchas discovered: L4T kernel doesn't ship
  `ch341.ko` (we built it from upstream source against the installed
  headers) and `brltty` udev rule eats CH340 devices.
- Jetson ↔ UNO UART exchange verified end-to-end via Python pyserial
  on the Jetson — same JSON protocol the PC used in V1.

## [V2 / Phase 0 — Firmware baseline] — 2026-06-02

- V1 firmware on both chips rebuilt cleanly through PlatformIO and
  re-uploaded; protocol verified via JSON ping/battery/ultrasonic
  cycle.
- Both repos initialised (PC-side `zip-v2`, Jetson `zip-brain`).
- Architecture decided: three-tier (UNO / Jetson / clients), Jetson
  owns intent, PC is observability only.
