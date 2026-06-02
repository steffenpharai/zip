# Windows Serial Port Configuration

## Overview

Accessing Windows COM ports from Docker containers on Windows is challenging because Docker Desktop runs containers in a Linux VM, and Windows COM ports are not directly accessible.

## Current Status

The robot bridge is configured to use `/dev/ttyS4` (which maps to COM5 on Windows/WSL2), but there are limitations:

- **Device exists**: `/dev/ttyS4` is accessible in the container
- **Baud rate issue**: Setting custom baud rates may fail due to WSL2 limitations
- **Loopback mode**: Enabled by default for testing without hardware

## Solutions

### Option 1: Loopback Mode (Current - For Testing)

Loopback mode simulates robot telemetry without hardware. This is enabled by default:

```yaml
LOOPBACK_MODE=true
```

**Status**: ✅ Working - Robot bridge runs in simulation mode

### Option 2: Run Robot Bridge Outside Docker (Recommended for Hardware)

For real hardware access on Windows, run the robot bridge directly on the Windows host:

1. **Install Node.js** on Windows
2. **Navigate to robot bridge directory**:
   ```bash
   cd robot/bridge/zip-robot-bridge
   ```
3. **Install dependencies**:
   ```bash
   npm install
   ```
4. **Set environment variables**:
   ```bash
   $env:ROBOT_SERIAL_PORT="COM5"
   $env:SERIAL_BAUD="115200"
   ```
5. **Run the bridge**:
   ```bash
   npm run dev
   ```

6. **Update ZIP app** to connect to Windows host:
   - Set `NEXT_PUBLIC_ROBOT_BRIDGE_WS_URL=ws://localhost:8765/robot` in `.env`
   - Or use host network mode in docker-compose

### Option 3: WSL2 USB Passthrough (Advanced)

For direct hardware access through WSL2:

1. **Install usbipd** on Windows:
   ```powershell
   winget install --id=Dorssel.usbipd-win -e
   ```

2. **Share USB device**:
   ```powershell
   usbipd list
   usbipd bind --busid <bus-id>
   ```

3. **Attach in WSL2**:
   ```bash
   sudo usbip attach -r localhost -b <bus-id>
   ```

4. **Device will appear** as `/dev/ttyUSB0` in WSL2

### Option 4: Use Docker with Host Network (Windows)

Modify docker-compose.yml to use host network mode:

```yaml
robot-bridge:
  network_mode: "host"
  # ... rest of config
```

This allows the container to access Windows COM ports directly, but only works on Linux hosts.

## Current Configuration

The docker-compose.yml is configured with:

- **SERIAL_PORT**: `/dev/ttyS4` (maps to COM5)
- **LOOPBACK_MODE**: `true` (enabled for testing)
- **Privileged mode**: Enabled for device access
- **Device mapping**: `/dev/ttyS4:/dev/ttyS4`

## Troubleshooting

### Check Device Exists

```bash
docker-compose exec robot-bridge ls -la /dev/ttyS4
```

### Check Permissions

```bash
docker-compose exec robot-bridge id
# Should show dialout group membership
```

### Test Serial Port Access

```bash
docker-compose exec robot-bridge stty -F /dev/ttyS4 115200
```

### Verify Health

```bash
curl http://localhost:8766/health
```

## Recommendation

For **development and testing**: Use loopback mode (current setup)

For **production with hardware**: Run robot bridge outside Docker on Windows host, or use WSL2 USB passthrough

## Next Steps

1. ✅ Loopback mode working - robot bridge functional for testing
2. ⚠️ Real hardware access requires running bridge outside Docker or USB passthrough
3. 📝 Document the limitation in main README

