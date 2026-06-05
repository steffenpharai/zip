#!/usr/bin/env python3
"""
Simple test - send one HELLO command and monitor response
"""

import serial
import time

# CRC16-CCITT
CRC16_POLYNOMIAL = 0x1021
CRC16_INITIAL = 0xFFFF

_crc16_table = None

def init_crc16_table():
    global _crc16_table
    if _crc16_table is not None:
        return _crc16_table
    _crc16_table = [0] * 256
    for i in range(256):
        crc = (i << 8) & 0xFFFF
        for j in range(8):
            if crc & 0x8000:
                crc = ((crc << 1) ^ CRC16_POLYNOMIAL) & 0xFFFF
            else:
                crc = (crc << 1) & 0xFFFF
        _crc16_table[i] = crc
    return _crc16_table

def calculate_crc16(data: bytes) -> int:
    table = init_crc16_table()
    crc = CRC16_INITIAL
    for byte in data:
        index = ((crc >> 8) ^ byte) & 0xFF
        crc = ((crc << 8) ^ table[index]) & 0xFFFF
    return crc

def encode_frame(msg_type: int, seq: int, payload: bytes) -> bytes:
    data_len = 1 + 1 + len(payload)
    frame = bytearray(2 + 1 + data_len + 2)
    pos = 0
    
    frame[pos] = 0xAA
    pos += 1
    frame[pos] = 0x55
    pos += 1
    frame[pos] = data_len
    pos += 1
    frame[pos] = msg_type
    pos += 1
    frame[pos] = seq
    pos += 1
    frame[pos:pos+len(payload)] = payload
    pos += len(payload)
    
    crc_data = bytes(frame[2:pos])
    crc = calculate_crc16(crc_data)
    frame[pos] = crc & 0xFF
    pos += 1
    frame[pos] = (crc >> 8) & 0xFF
    
    return bytes(frame)

port = 'COM5'
baud = 115200

print(f"Connecting to {port} @ {baud}...")
ser = serial.Serial(port, baud, timeout=1.0)

# Wait for boot
print("Waiting 4 seconds for boot...")
time.sleep(4)
if ser.in_waiting > 0:
    boot_data = ser.read(ser.in_waiting)
    print(f"Flushed {len(boot_data)} boot bytes")

# Clear any remaining data
time.sleep(0.5)
if ser.in_waiting > 0:
    extra = ser.read(ser.in_waiting)
    print(f"Flushed {len(extra)} extra bytes")

print("\n=== Sending HELLO ===")
frame = encode_frame(0x01, 1, b'{}')
print(f"Frame: {' '.join(f'{b:02X}' for b in frame)}")

# Send with explicit flush
ser.write(frame)
ser.flush()
time.sleep(0.1)  # Small delay

print("\n=== Monitoring (10 seconds) ===")
start = time.time()
buffer = b''
while time.time() - start < 10.0:
    if ser.in_waiting > 0:
        data = ser.read(ser.in_waiting)
        buffer += data
        # Print immediately
        try:
            text = data.decode('utf-8', errors='ignore')
            if text.strip():
                print(f"  {text.strip()}")
        except:
            pass
    
    # Check for complete lines
    if b'\n' in buffer:
        lines = buffer.split(b'\n')
        buffer = lines[-1]
        for line in lines[:-1]:
            line_str = line.decode('utf-8', errors='ignore').strip()
            if 'CMD:' in line_str:
                print(f"\n*** FOUND: {line_str} ***\n")
            elif line_str:
                print(f"  {line_str}")
    
    time.sleep(0.05)

# Check for binary data
if ser.in_waiting > 0:
    binary = ser.read(ser.in_waiting)
    print(f"\nBinary data: {' '.join(f'{b:02X}' for b in binary)}")

ser.close()
print("\nDone")
