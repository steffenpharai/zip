#!/usr/bin/env python3
"""
Raw Serial Monitor - Capture all bytes from robot
"""

import serial
import time
import sys

def main():
    port = sys.argv[1] if len(sys.argv) > 1 else 'COM5'
    baud = 115200
    
    print(f"Connecting to {port} @ {baud} baud...")
    print("Press Ctrl+C to stop\n")
    
    try:
        ser = serial.Serial(port, baud, timeout=1.0)
        time.sleep(2)  # Wait for initialization
        
        print("=" * 60)
        print("Raw Serial Output (all bytes)")
        print("=" * 60)
        print()
        
        while True:
            if ser.in_waiting > 0:
                data = ser.read(ser.in_waiting)
                # Print as hex
                hex_str = ' '.join(f'{b:02X}' for b in data)
                print(f"HEX: {hex_str}")
                # Print as ASCII (if printable)
                ascii_str = ''.join(chr(b) if 32 <= b < 127 else '.' for b in data)
                print(f"ASC: {ascii_str}")
                print()
            else:
                time.sleep(0.1)
                
    except KeyboardInterrupt:
        print("\n\nStopped by user")
    except Exception as e:
        print(f"Error: {e}")
    finally:
        if 'ser' in locals() and ser.is_open:
            ser.close()

if __name__ == '__main__':
    main()

