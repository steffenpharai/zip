#!/usr/bin/env python3
"""Monitor serial output to see what robot is doing"""

import serial
import time

def main():
    port = 'COM5'
    print(f"Monitoring {port}... (Press Ctrl+C to stop)")
    print("=" * 60)
    
    try:
        ser = serial.Serial(port, 115200, timeout=1)
        time.sleep(2)
        
        # Flush buffer
        if ser.in_waiting > 0:
            ser.read(ser.in_waiting)
        
        print("Reading serial output...\n")
        
        start_time = time.time()
        while time.time() - start_time < 10:  # Monitor for 10 seconds
            if ser.in_waiting > 0:
                try:
                    data = ser.read(ser.in_waiting)
                    text = data.decode('utf-8', errors='replace')
                    print(text, end='', flush=True)
                except:
                    # Show hex for non-text data
                    hex_str = ' '.join(f'{b:02X}' for b in data)
                    print(f"[HEX] {hex_str}")
            else:
                time.sleep(0.1)
        
        print("\n\nMonitoring complete.")
        ser.close()
        
    except KeyboardInterrupt:
        print("\n\nStopped by user.")
        if 'ser' in locals():
            ser.close()
    except Exception as e:
        print(f"Error: {e}")

if __name__ == '__main__':
    main()

