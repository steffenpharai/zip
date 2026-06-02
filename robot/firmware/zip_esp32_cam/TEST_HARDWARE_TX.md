# Hardware Smoke Test - TX Pin Toggle

## Purpose

This test verifies the **physical connection** between the ESP32 and Arduino by toggling the TX pin (GPIO43) at 500ms intervals. This is a hardware-level diagnostic that bypasses all UART/software logic.

## What This Test Does

- Sets GPIO40 (UART TX pin) as a digital output - VERIFIED
- Toggles the pin HIGH/LOW every 500ms
- Outputs debug messages via Serial (USB)

## How to Use

### Step 1: Build and Flash the Test

**Option A: Using the build script (Windows)**
```bash
cd robot/firmware/zip_esp32_cam
scripts\flash_hwtest.bat
```

**Option B: Manual PlatformIO command**
```bash
cd robot/firmware/zip_esp32_cam
pio run -e esp32cam_hwtest -t upload
```

### Step 2: Observe Arduino RX LED

**With Arduino powered on and connected via shield:**

1. Watch the Arduino's **RX LED** (usually labeled "RX" or "L" on the board)
2. The LED should **blink every 500ms** if the physical connection is working

### Step 3: Interpret Results

#### ✅ **RX LED Blinks**
- **Meaning**: Physical connection is **OK**
- **Conclusion**: The issue is **software/UART configuration**, not hardware
- **Next Step**: Return to main firmware and investigate UART peripheral configuration

#### ❌ **RX LED Does NOT Blink**
- **Meaning**: Physical connection is **broken**
- **Possible Causes**:
  1. **Shield switch** not in "CAM" position
  2. **P8 header** not properly seated (check both sides)
  3. **Cold solder joint** on shield UART connector
  4. **Broken trace** on shield PCB
  5. **Arduino not powered** or in reset state

- **Next Steps**:
  1. Verify shield switch is in "CAM" position
  2. Reseat P8 header connector
  3. Check Arduino power LED
  4. Test with multimeter: continuity between ESP32 GPIO43 and Arduino D0 (RX)

## Serial Monitor Output

You should see output like this:

```
========================================
ESP32 Hardware Smoke Test - TX Pin
========================================
Toggling GPIO40 (UART TX) every 500ms
Observe Arduino RX LED - it should blink
========================================

TX: HIGH
TX: LOW
TX: HIGH
TX: LOW
...
```

## Returning to Normal Firmware

After testing, flash the normal firmware:

```bash
pio run -e esp32cam -t upload
```

## Technical Details

- **Test Pin**: GPIO40 (UART_TX_GPIO from board config) - VERIFIED
- **Toggle Rate**: 500ms HIGH, 500ms LOW (1Hz)
- **No UART**: This test does NOT use Serial1/UART - it's pure GPIO toggling
- **No WiFi**: Minimal firmware, no network services

## Why This Works

The Arduino's RX LED is directly connected to the UART RX pin (D0). When the ESP32 toggles GPIO40 (which connects to Arduino D0 via the shield), the Arduino's hardware UART receiver sees the voltage changes and lights the RX LED, even if the Arduino firmware isn't processing the data.

This proves the **physical path** is intact, regardless of baud rate, UART configuration, or firmware state.

