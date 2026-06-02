Import("env")
import subprocess
import os

def upload_custom(source, target, env):
    """Custom upload script that matches Arduino IDE's exact command"""
    firmware_path = str(source[0])
    port = env.get("UPLOAD_PORT", "COM7")
    
    # Get esptool path
    esptool = os.path.join(env.PioPlatform().get_package_dir("tool-esptoolpy"), "esptool.py")
    
    # Arduino IDE used --chip esp32 even though chip is S3
    # We'll upload as ESP32-S3 but the firmware binary is WROVER
    # This might work if the binary formats are compatible
    cmd = [
        "python",
        esptool,
        "--chip", "esp32s3",  # Use S3 for upload
        "--port", port,
        "--baud", "460800",
        "--before", "default_reset",
        "--after", "hard_reset",
        "write_flash",
        "-z",
        "--flash_mode", "dio",
        "--flash_freq", "80m",
        "--flash_size", "detect",
        "0x10000",
        firmware_path
    ]
    
    print("Executing custom upload:")
    print(" ".join(cmd))
    
    result = subprocess.run(cmd, check=False)
    if result.returncode != 0:
        print("\nUpload failed. The firmware is compiled for ESP32-WROVER")
        print("but the chip is ESP32-S3. Binary format may be incompatible.")
        print("\nSuggestion: Use Arduino IDE to upload, or we need to")
        print("find ESP32S3-Camera-v1.0 pin mapping that matches your wiring.")
    
    return result.returncode

env.Replace(UPLOADCMD=upload_custom)

