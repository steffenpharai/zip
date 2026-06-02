# Quick Hardware Test Guide

## Problem
No RX LED activity on Arduino when ESP32 sends commands.

## Solution
Flash the hardware smoke test to verify physical connection.

## Steps

1. **Flash the test firmware:**
   ```bash
   cd robot/firmware/zip_esp32_cam
   pio run -e esp32cam_hwtest -t upload
   ```
   
   Or use the script:
   ```bash
   scripts\flash_hwtest.bat
   ```

2. **Watch Arduino RX LED:**
   - The LED should **blink every 500ms** if connection is OK
   - If it doesn't blink, there's a physical connection problem

3. **Interpret results:**
   - ✅ **LED blinks** → Wiring OK, check UART software config
   - ❌ **LED doesn't blink** → Check:
     - Shield switch in "CAM" position?
     - P8 header properly seated?
     - Arduino powered on?
     - Shield UART connector soldered correctly?

4. **Return to normal firmware:**
   ```bash
   pio run -e esp32cam -t upload
   ```

## What the Test Does

The test toggles GPIO40 (TX pin) HIGH/LOW every 500ms using pure digital I/O - no UART involved. This proves the physical path works regardless of baud rate or UART configuration.

## Technical Details

- **Pin**: GPIO40 (UART_TX_GPIO) - VERIFIED
- **Method**: `digitalWrite()` - pure GPIO, not Serial1
- **Rate**: 500ms HIGH, 500ms LOW (1Hz toggle)
- **Why it works**: Arduino RX LED is hardware-connected to UART RX pin, so any voltage change lights it

