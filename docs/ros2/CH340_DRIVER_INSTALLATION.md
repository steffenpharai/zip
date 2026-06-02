# CH340 Driver Installation for Jetson Orin Nano

## Problem

The CH340 USB-to-Serial converter (used by many Arduino clones) is not detected on Jetson Orin Nano by default. The device appears in `lsusb` but no `/dev/ttyUSB*` device is created.

## Root Cause

The CH340/CH341 driver (`CONFIG_USB_SERIAL_CH341`) is not enabled in the Jetson kernel by default.

## Solution: Install CH341SER Driver

### Step 1: Install Build Dependencies

```bash
sudo apt-get update
sudo apt-get install -y build-essential linux-headers-$(uname -r)
```

### Step 2: Clone and Build Driver

```bash
cd /tmp
git clone https://github.com/juliagoda/CH341SER.git
cd CH341SER
sudo make clean
sudo make
```

### Step 3: Load Driver

```bash
sudo make load
```

### Step 4: Verify Device

```bash
ls -la /dev/ttyUSB*
# Should show /dev/ttyUSB0
```

### Step 5: Disable brltty (Braille Terminal Service)

The brltty service can interfere with serial device detection:

```bash
sudo systemctl stop brltty.service
sudo systemctl disable brltty.service
sudo systemctl stop brltty-udev.service
sudo systemctl mask brltty-udev.service
```

### Step 6: Install Driver Permanently

```bash
# Copy driver to kernel modules directory
sudo cp /tmp/CH341SER/ch34x.ko /lib/modules/$(uname -r)/kernel/drivers/usb/serial/
sudo depmod -a

# Auto-load on boot
echo "ch34x" | sudo tee /etc/modules-load.d/ch34x.conf
```

### Step 7: Create udev Rule for Permissions

```bash
echo 'SUBSYSTEM=="tty", ATTRS{idVendor}=="1a86", ATTRS{idProduct}=="7523", MODE="0666", GROUP="dialout", SYMLINK+="arduino"' | sudo tee /etc/udev/rules.d/99-ch340.rules
sudo udevadm control --reload-rules
sudo udevadm trigger
```

### Step 8: Add User to dialout Group

```bash
sudo usermod -a -G dialout $USER
# Log out and log back in for changes to take effect
```

## Verification

After installation, verify the driver is working:

```bash
# Check if module is loaded
lsmod | grep ch34

# Check if device exists
ls -la /dev/ttyUSB*

# Test with Python
python3 -c "import serial.tools.list_ports; print([p.device for p in serial.tools.list_ports.comports()])"
```

## Troubleshooting

**Device still not found after installation:**
1. Unplug and replug the USB cable
2. Check `dmesg | tail -20` for error messages
3. Verify driver is loaded: `lsmod | grep ch34`
4. Check permissions: `ls -l /dev/ttyUSB*`

**Permission denied errors:**
- Ensure user is in dialout group: `groups | grep dialout`
- Check udev rule: `cat /etc/udev/rules.d/99-ch340.rules`
- Reload udev: `sudo udevadm control --reload-rules && sudo udevadm trigger`

**Driver not loading on boot:**
- Check module is in autoload: `cat /etc/modules-load.d/ch34x.conf`
- Verify driver file exists: `ls -l /lib/modules/$(uname -r)/kernel/drivers/usb/serial/ch34x.ko`
- Check dependencies: `sudo depmod -a`

## References

- CH341SER Repository: https://github.com/juliagoda/CH341SER
- NVIDIA Jetson Forums: https://forums.developer.nvidia.com/t/orin-nano-wont-detect-arduino-dev-ttyusb-or-dev-ttyacm/284955
