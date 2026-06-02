#!/usr/bin/env python3
"""
Test if robot receives commands - monitor serial for debug output
"""

import serial
import time

# Protocol constants
PROTOCOL_HEADER_0 = 0xAA
PROTOCOL_HEADER_1 = 0x55
MSG_TYPE_HELLO = 0x01

# CRC16-CCITT
CRC16_POLYNOMIAL = 0x1021
CRC16_INITIAL = 0xFFFF

# CRC16 lookup table
_crc16_table = None

def init_crc16_table():
    """Initialize CRC16 lookup table"""
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
    """Calculate CRC16-CCITT for data"""
    table = init_crc16_table()
    crc = CRC16_INITIAL
    
    for byte in data:
        index = ((crc >> 8) ^ byte) & 0xFF
        crc = ((crc << 8) ^ table[index]) & 0xFFFF
    
    return crc

def encode_frame(msg_type: int, seq: int, payload: bytes) -> bytes:
    """Encode a message into a protocol frame"""
    # LEN = TYPE(1) + SEQ(1) + PAYLOAD_LEN
    data_len = 1 + 1 + len(payload)
    frame_size = 2 + 1 + data_len + 2  # HEADER(2) + LEN(1) + DATA + CRC16(2)
    
    frame = bytearray(frame_size)
    pos = 0
    
    # Header
    frame[pos] = PROTOCOL_HEADER_0
    pos += 1
    frame[pos] = PROTOCOL_HEADER_1
    pos += 1
    
    # Length
    frame[pos] = data_len
    pos += 1
    
    # Type and Seq
    frame[pos] = msg_type
    pos += 1
    frame[pos] = seq
    pos += 1
    
    # Payload
    frame[pos:pos+len(payload)] = payload
    pos += len(payload)
    
    # Calculate CRC16 over LEN..PAYLOAD
    crc_data = bytes(frame[2:pos])
    crc = calculate_crc16(crc_data)
    
    # Append CRC16 (little-endian)
    frame[pos] = crc & 0xFF
    pos += 1
    frame[pos] = (crc >> 8) & 0xFF
    
    return bytes(frame)

port = 'COM5'
baud = 115200

print(f"Connecting to {port} @ {baud}...")
print("NOTE: Make sure the bridge is NOT connected to this port!")
print("      If the bridge is running, stop it first.\n")

try:
    ser = serial.Serial(port, baud, timeout=1.0)
except serial.SerialException as e:
    print(f"ERROR: Could not open serial port: {e}")
    print("       The port might be in use by the bridge or another program.")
    exit(1)

# Wait for boot and flush any initial data
print("Waiting for boot messages...")
time.sleep(3)
if ser.in_waiting > 0:
    boot_data = ser.read(ser.in_waiting)
    print(f"Flushed {len(boot_data)} boot bytes")

# Wait a bit more to ensure decoder is in clean state
print("Waiting for decoder to stabilize...")
time.sleep(1)
if ser.in_waiting > 0:
    extra_data = ser.read(ser.in_waiting)
    print(f"Flushed {len(extra_data)} additional bytes")

# Send sync bytes to reset decoder state (multiple 0xAA bytes)
print("\n=== Sending sync bytes to reset decoder ===")
sync_bytes = bytes([0xAA] * 10)
ser.write(sync_bytes)
ser.flush()
print(f"Sent {len(sync_bytes)} sync bytes (0xAA)")
time.sleep(0.1)

# Send HELLO command multiple times to ensure it's received
print("\n=== Sending HELLO command (3 attempts) ===")
payload = b'{}'  # Empty JSON object
seq = 1

for attempt in range(1, 4):
    frame = encode_frame(MSG_TYPE_HELLO, seq, payload)
    ser.write(frame)
    ser.flush()
    print(f"Attempt {attempt}: Sent HELLO frame: {' '.join(f'{b:02X}' for b in frame)}")
    time.sleep(0.3)  # Slightly longer delay between attempts

# Monitor for debug output (CMD:0x01,seq=1) and any responses
print("\n=== Monitoring for command reception (8 seconds) ===")
print("Looking for: CMD:0x1,seq=1")
print("Also watching for ACK/INFO responses...")
start = time.time()
buffer = b''
found_cmd = False
found_response = False
all_output = []
while time.time() - start < 8.0:
    if ser.in_waiting > 0:
        data = ser.read(ser.in_waiting)
        buffer += data
        # Check if we have a complete line
        if b'\n' in buffer:
            lines = buffer.split(b'\n')
            buffer = lines[-1]  # Keep incomplete line
            for line in lines[:-1]:
                line_str = line.decode('utf-8', errors='ignore').strip()
                all_output.append(line_str)
                if 'CMD:' in line_str:
                    print(f"*** FOUND COMMAND DEBUG: {line_str} ***")
                    found_cmd = True
                elif line_str:  # Print other non-empty lines
                    print(f"  {line_str}")
                    if 'INFO' in line_str or 'ACK' in line_str or 'TELEMETRY' in line_str:
                        found_response = True
    else:
        time.sleep(0.1)

# Print any remaining buffer
if buffer:
    remaining = buffer.decode('utf-8', errors='ignore')
    if remaining.strip():
        print(f"Remaining buffer: {remaining}")

# Also check for binary protocol responses (ACK/INFO frames)
print("\n=== Checking for binary protocol responses ===")
print("Reading any remaining bytes...")
time.sleep(0.5)
if ser.in_waiting > 0:
    binary_data = ser.read(ser.in_waiting)
    print(f"Received {len(binary_data)} bytes (binary protocol)")
    if len(binary_data) > 0:
        hex_str = ' '.join(f'{b:02X}' for b in binary_data[:32])  # First 32 bytes
        print(f"  Hex: {hex_str}")
        if len(binary_data) > 32:
            print(f"  ... ({len(binary_data) - 32} more bytes)")
        found_response = True

ser.close()

print("\n=== Summary ===")
if found_cmd:
    print("✓ Command was received and processed by firmware")
else:
    print("✗ Command debug output NOT found")
    print("  Possible issues:")
    print("    1. Bridge is still connected to COM5 (stop it first!)")
    print("    2. Frame CRC is incorrect (but we're using proper encoder now)")
    print("    3. Firmware decoder is not processing the frame")
    print("    4. Serial port configuration mismatch")
    print("    5. Firmware might be stuck in a decoder state")

if found_response:
    print("✓ Response received from robot")
else:
    print("✗ No response received from robot")

if all_output:
    print(f"\nAll serial output received ({len(all_output)} lines):")
    for i, line in enumerate(all_output[:20], 1):  # Show first 20 lines
        print(f"  {i:2d}: {line}")
    if len(all_output) > 20:
        print(f"  ... ({len(all_output) - 20} more lines)")

print("\nDone")

