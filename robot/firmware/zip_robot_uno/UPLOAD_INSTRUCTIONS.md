# Firmware Upload Instructions

## Status
✅ **Firmware compiled successfully!**
- RAM usage: 78.4% (1606/2048 bytes)
- Flash usage: 68.3% (22024/32256 bytes)
- All fixes applied and compiled

## Upload Failed - Manual Steps Required

The automatic upload failed because the Arduino bootloader needs to be synchronized. Follow these steps:

### Option 1: Manual Reset Method (Recommended)

1. **Close any programs using COM5** (bridge service, Serial Monitor, etc.)

2. **Press the RESET button on the Arduino** (physical button on the board)

3. **Immediately after pressing reset**, run:
   ```bash
   python -m platformio run -t upload
   ```

4. If it still fails, try pressing reset again right before the upload starts

### Option 2: Use Arduino IDE

1. Open Arduino IDE
2. Select: **Tools > Board > Arduino Uno**
3. Select: **Tools > Port > COM5**
4. Open the main sketch file: `src/main.cpp`
5. Click **Upload** button
6. Press RESET button on Arduino if prompted

### Option 3: Check COM Port

1. Verify COM5 is correct:
   - Open Device Manager
   - Check "Ports (COM & LPT)"
   - Verify Arduino is on COM5

2. If different port, update `platformio.ini`:
   ```ini
   upload_port = COM5  ; Change to your port
   ```

## After Successful Upload

1. **Restart bridge service:**
   ```bash
   cd robot/bridge/zip-robot-bridge
   node dist/index.js
   ```

2. **Test connection:**
   - Send HELLO command
   - Check for protocol frames: `[SerialManager] Protocol frame detected`
   - Check for decoded messages: `[SerialManager] ✅ Decoded message`

3. **Expected results:**
   - ✅ No more reset loop
   - ✅ Telemetry sent every 100ms
   - ✅ Commands receive ACKs
   - ✅ Robot responds to all commands

## Troubleshooting

If upload continues to fail:
- Try a different USB cable
- Try a different USB port
- Unplug and replug Arduino
- Check Arduino board is powered (LED should be on)
- Try uploading a simple blink sketch first to verify connection

