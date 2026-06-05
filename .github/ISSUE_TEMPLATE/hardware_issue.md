---
name: Hardware issue
about: A problem with physical hardware (chassis, Jetson, ESP32, cameras, wiring)
title: '[HW] '
labels: hardware
assignees: ''
---

## What's the hardware symptom

Describe what's happening physically. Photos / videos very welcome.

## Component affected

- [ ] UNO board / Elegoo shield (specify which sensor / motor / pin)
- [ ] Jetson Orin Nano Super (power, USB-C, fan, GPU)
- [ ] ESP32-S3 camera module
- [ ] Logitech C615 bow camera
- [ ] MPU6050 IMU
- [ ] Ultrasonic / line sensors / servo / battery
- [ ] Cabling / connectors
- [ ] Mount / chassis

## Conditions

- When did this start happening?
- Did anything change recently (firmware reflash, cable swap, battery
  swap, chassis bump)?
- Reproducible or intermittent?

## Diagnostic data

If applicable:

- Battery voltage (HUD telemetry or N=23 query)
- UNO diagnostics (N=120 reply)
- Jetson `dmesg` tail
- Jetson `tegrastats` output during the issue
- ESP32 `/health` JSON
- USB device list (`lsusb` on Linux, Device Manager on Windows)

## Have you checked

- [ ] [`docs/HARDWARE.md`](../../docs/HARDWARE.md) — wiring + pinouts
- [ ] [`docs/KNOWN_ISSUES.md`](../../docs/KNOWN_ISSUES.md) — known hardware gotchas
      (CH340/brltty, GPIO0 latch, etc.)
- [ ] Cables seated and not damaged
- [ ] Battery charged (if applicable)
