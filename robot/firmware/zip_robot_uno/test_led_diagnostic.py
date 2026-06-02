#!/usr/bin/env python3
"""LED Diagnostic Test - Check if robot is receiving and processing commands"""

import serial
import time
import json

# Protocol constants
PROTOCOL_HEADER_0 = 0xAA
PROTOCOL_HEADER_1 = 0x55
MSG_TYPE_HELLO = 0x01
MSG_TYPE_SET_MODE = 0x02
MSG_TYPE_LED = 0x06
MSG_TYPE_ACK = 0x82
MSG_TYPE_INFO = 0x81

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
    data_len = 1 + 1 + len(payload)
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

def decode_frame(data: bytes) -> dict:
    """Try to decode a frame from raw bytes"""
    if len(data) < 5:
        return None
    if data[0] != PROTOCOL_HEADER_0 or data[1] != PROTOCOL_HEADER_1:
        return None
    
    length = data[2]
    msg_type = data[3]
    seq = data[4]
    
    if len(data) < 5 + length + 2:  # Header(2) + LEN(1) + DATA + CRC(2)
        return None
    
    payload = data[5:5+length-2]  # LEN includes TYPE+SEQ, so payload is LEN-2
    
    # Verify CRC
    crc_data = data[2:2+length+1]  # LEN through end of payload
    calculated_crc = calculate_crc16(crc_data)
    received_crc = data[5+length-2] | (data[5+length-1] << 8)
    
    if calculated_crc != received_crc:
        return None
    
    return {
        'type': msg_type,
        'seq': seq,
        'payload': payload
    }

def read_responses(ser, timeout=2.0):
    """Read and decode responses from robot"""
    start_time = time.time()
    responses = []
    buffer = bytearray()
    
    while time.time() - start_time < timeout:
        if ser.in_waiting > 0:
            byte = ser.read(1)[0]
            buffer.append(byte)
            
            # Look for frame start
            if len(buffer) >= 2 and buffer[-2] == PROTOCOL_HEADER_0 and buffer[-1] == PROTOCOL_HEADER_1:
                # Potential frame start, try to read complete frame
                if len(buffer) >= 3:
                    expected_len = buffer[2]
                    frame_len = 2 + 1 + expected_len + 2  # Header + LEN + DATA + CRC
                    
                    # Read remaining bytes if needed
                    while len(buffer) < frame_len and (time.time() - start_time) < timeout:
                        if ser.in_waiting > 0:
                            buffer.append(ser.read(1)[0])
                        else:
                            time.sleep(0.01)
                    
                    if len(buffer) >= frame_len:
                        frame = bytes(buffer[:frame_len])
                        decoded = decode_frame(frame)
                        if decoded:
                            responses.append(decoded)
                            try:
                                payload_json = json.loads(decoded['payload'].decode('utf-8'))
                                print(f"  ← Received: type=0x{decoded['type']:02X}, seq={decoded['seq']}, payload={payload_json}")
                            except:
                                print(f"  ← Received: type=0x{decoded['type']:02X}, seq={decoded['seq']}, payload={decoded['payload']}")
                        buffer = buffer[frame_len:]
        else:
            time.sleep(0.01)
    
    return responses

def main():
    port = 'COM5'
    print(f"Connecting to {port}...")
    
    try:
        ser = serial.Serial(port, 115200, timeout=2)
        time.sleep(2)
        
        # Flush buffer
        if ser.in_waiting > 0:
            ser.read(ser.in_waiting)
        
        print("\n=== Test 1: HELLO ===")
        hello_payload = b'{}'
        hello_frame = encode_frame(MSG_TYPE_HELLO, 1, hello_payload)
        print(f"  → Sending HELLO (seq=1)")
        ser.write(hello_frame)
        ser.flush()
        responses = read_responses(ser, 2.0)
        time.sleep(0.5)
        
        print("\n=== Test 2: SET_MODE to MANUAL ===")
        mode_payload = json.dumps({'mode': 1}).encode('utf-8')
        mode_frame = encode_frame(MSG_TYPE_SET_MODE, 2, mode_payload)
        print(f"  → Sending SET_MODE (mode=1, seq=2)")
        ser.write(mode_frame)
        ser.flush()
        responses = read_responses(ser, 2.0)
        time.sleep(0.5)
        
        print("\n=== Test 3: LED RED ===")
        led_payload = json.dumps({'r': 255, 'g': 0, 'b': 0, 'brightness': 255}).encode('utf-8')
        led_frame = encode_frame(MSG_TYPE_LED, 3, led_payload)
        print(f"  → Sending LED RED (seq=3)")
        ser.write(led_frame)
        ser.flush()
        responses = read_responses(ser, 2.0)
        time.sleep(1)
        
        print("\n=== Test 4: LED GREEN ===")
        led_payload = json.dumps({'r': 0, 'g': 255, 'b': 0, 'brightness': 255}).encode('utf-8')
        led_frame = encode_frame(MSG_TYPE_LED, 4, led_payload)
        print(f"  → Sending LED GREEN (seq=4)")
        ser.write(led_frame)
        ser.flush()
        responses = read_responses(ser, 2.0)
        time.sleep(1)
        
        print("\n=== Test 5: LED BLUE ===")
        led_payload = json.dumps({'r': 0, 'g': 0, 'b': 255, 'brightness': 255}).encode('utf-8')
        led_frame = encode_frame(MSG_TYPE_LED, 5, led_payload)
        print(f"  → Sending LED BLUE (seq=5)")
        ser.write(led_frame)
        ser.flush()
        responses = read_responses(ser, 2.0)
        time.sleep(1)
        
        print("\n=== Summary ===")
        print("If you see ACK responses above, the robot is receiving commands.")
        print("If LEDs don't change, the issue may be:")
        print("  1. LED hardware connection")
        print("  2. Robot in wrong mode")
        print("  3. LED driver not initialized")
        
        ser.close()
        
    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == '__main__':
    main()

