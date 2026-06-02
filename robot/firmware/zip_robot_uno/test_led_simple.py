#!/usr/bin/env python3
"""Simple LED test - verify robot is responding"""

import serial
import time
import json

# Protocol constants
PROTOCOL_HEADER_0 = 0xAA
PROTOCOL_HEADER_1 = 0x55

def calculate_crc16(data: bytes) -> int:
    """Calculate CRC16-CCITT"""
    crc = 0xFFFF
    for byte in data:
        crc ^= (byte << 8)
        for _ in range(8):
            if crc & 0x8000:
                crc = ((crc << 1) ^ 0x1021) & 0xFFFF
            else:
                crc = (crc << 1) & 0xFFFF
    return crc

def encode_frame(msg_type: int, seq: int, payload: bytes) -> bytes:
    """Encode protocol frame"""
    data_len = 1 + 1 + len(payload)  # TYPE + SEQ + PAYLOAD
    frame = bytearray()
    frame.append(PROTOCOL_HEADER_0)
    frame.append(PROTOCOL_HEADER_1)
    frame.append(data_len)
    frame.append(msg_type)
    frame.append(seq)
    frame.extend(payload)
    
    crc_data = bytes(frame[2:])
    crc = calculate_crc16(crc_data)
    frame.append(crc & 0xFF)
    frame.append((crc >> 8) & 0xFF)
    
    return bytes(frame)

def main():
    port = 'COM5'
    print(f"Connecting to {port}...")
    
    try:
        ser = serial.Serial(port, 115200, timeout=2)
        time.sleep(2)  # Wait for connection
        
        # Flush any existing data
        if ser.in_waiting > 0:
            ser.read(ser.in_waiting)
        
        print("\n1. Setting mode to MANUAL (mode 1)...")
        mode_payload = json.dumps({'mode': 1}).encode('utf-8')
        mode_frame = encode_frame(0x02, 1, mode_payload)
        ser.write(mode_frame)
        ser.flush()
        time.sleep(0.5)
        
        print("2. Setting LED to RED...")
        led_payload = json.dumps({'r': 255, 'g': 0, 'b': 0, 'brightness': 255}).encode('utf-8')
        led_frame = encode_frame(0x06, 2, led_payload)
        ser.write(led_frame)
        ser.flush()
        time.sleep(1)
        
        print("3. Setting LED to GREEN...")
        led_payload = json.dumps({'r': 0, 'g': 255, 'b': 0, 'brightness': 255}).encode('utf-8')
        led_frame = encode_frame(0x06, 3, led_payload)
        ser.write(led_frame)
        ser.flush()
        time.sleep(1)
        
        print("4. Setting LED to BLUE...")
        led_payload = json.dumps({'r': 0, 'g': 0, 'b': 255, 'brightness': 255}).encode('utf-8')
        led_frame = encode_frame(0x06, 4, led_payload)
        ser.write(led_frame)
        ser.flush()
        time.sleep(1)
        
        print("5. Setting LED to CYAN...")
        led_payload = json.dumps({'r': 39, 'g': 180, 'b': 205, 'brightness': 255}).encode('utf-8')
        led_frame = encode_frame(0x06, 5, led_payload)
        ser.write(led_frame)
        ser.flush()
        time.sleep(1)
        
        print("\nLED test complete!")
        ser.close()
        
    except Exception as e:
        print(f"Error: {e}")

if __name__ == '__main__':
    main()

