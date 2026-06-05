---
description: Build UNO or ESP32-S3 camera firmware via PlatformIO, report size
argument-hint: uno | esp32 | both
---

The argument is which firmware to build. `uno`, `esp32`, or `both`
(default: `both`).

Use the `firmware-builder` subagent to:

1. Run `pio run -e <env>` for the selected target(s)
2. Report Flash + RAM usage as a percentage
3. Warn if RAM > 80% on UNO
4. Surface any warnings (especially `-Wmaybe-uninitialized` which
   often masks the [PIO `-D` shadow trap](../../docs/KNOWN_ISSUES.md#pio--d-shadow-trap))
5. **STOP before upload.** The agent must explicitly ask before flashing.

Mapping:
- `uno` → `cd zip-v2/firmware/uno && pio run -e uno`
- `esp32` → `cd zip-v2/firmware/esp32-cam && pio run -e esp32cam_sta`
- `both` → both, in sequence

If the ESP32 build fails because `include/secrets.h` doesn't exist,
the agent should copy from `secrets.example.h` and warn the human to
fill in their Wi-Fi credentials. **Do not** invent credentials.
