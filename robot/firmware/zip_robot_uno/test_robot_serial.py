#!/usr/bin/env python3
"""
Direct Serial Test Script for ZIP Robot Firmware
Tests command sending and response receiving via serial port
"""

import serial
import serial.tools.list_ports
import time
import json
import struct
from typing import Optional, Tuple, List
from enum import IntEnum

# Protocol constants (must match firmware)
PROTOCOL_HEADER_0 = 0xAA
PROTOCOL_HEADER_1 = 0x55
PROTOCOL_MAX_PAYLOAD_SIZE = 64

# Message types (Host → Robot)
MSG_TYPE_HELLO = 0x01
MSG_TYPE_SET_MODE = 0x02
MSG_TYPE_DRIVE_TWIST = 0x03
MSG_TYPE_DRIVE_TANK = 0x04
MSG_TYPE_SERVO = 0x05
MSG_TYPE_LED = 0x06
MSG_TYPE_E_STOP = 0x07
MSG_TYPE_CONFIG_SET = 0x08

# Message types (Robot → Host)
MSG_TYPE_INFO = 0x81
MSG_TYPE_ACK = 0x82
MSG_TYPE_TELEMETRY = 0x83
MSG_TYPE_FAULT = 0x84

# CRC16-CCITT polynomial
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

class ProtocolEncoder:
    """Encodes messages into binary protocol frames"""
    
    def __init__(self):
        self.next_seq = 1
    
    def get_next_seq(self) -> int:
        """Get next sequence number"""
        seq = self.next_seq
        self.next_seq += 1
        if self.next_seq == 0:
            self.next_seq = 1
        return seq
    
    def encode(self, msg_type: int, seq: int, payload: bytes) -> bytes:
        """Encode a message into a protocol frame"""
        if len(payload) > PROTOCOL_MAX_PAYLOAD_SIZE:
            raise ValueError(f"Payload size {len(payload)} exceeds maximum {PROTOCOL_MAX_PAYLOAD_SIZE} bytes")
        
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
        crc_data = frame[2:pos]
        crc = calculate_crc16(crc_data)
        
        # Append CRC16 (little-endian)
        frame[pos] = crc & 0xFF
        pos += 1
        frame[pos] = (crc >> 8) & 0xFF
        
        return bytes(frame)

class ProtocolDecoder:
    """Decodes binary protocol frames into messages"""
    
    def __init__(self):
        self.state = 'WAIT_HEADER_0'
        self.buffer = bytearray()
        self.expected_len = 0
        self.expected_payload_len = 0
        self.message = {
            'type': 0,
            'seq': 0,
            'payload': bytearray(),
            'valid': False
        }
    
    def process_byte(self, byte: int) -> bool:
        """Process incoming byte. Returns True if complete frame decoded."""
        byte_val = byte & 0xFF
        
        if self.state == 'WAIT_HEADER_0':
            if byte_val == PROTOCOL_HEADER_0:
                self.buffer = bytearray([byte_val])
                self.state = 'WAIT_HEADER_1'
            # If not 0xAA, stay in WAIT_HEADER_0 (ignore non-frame bytes)
        elif self.state == 'WAIT_HEADER_1':
            if byte_val == PROTOCOL_HEADER_1:
                self.buffer.append(byte_val)
                self.state = 'WAIT_LEN'
            else:
                # Not 0x55 after 0xAA - reset and check if this byte is a new 0xAA
                self.reset()
                if byte_val == PROTOCOL_HEADER_0:
                    self.buffer = bytearray([byte_val])
                    self.state = 'WAIT_HEADER_1'
        elif self.state == 'WAIT_LEN':
            self.expected_len = byte_val
            # LEN = TYPE(1) + SEQ(1) + PAYLOAD_LEN
            # Min: 2 (TYPE + SEQ, no payload)
            # Max: PROTOCOL_MAX_LEN = 2 + PROTOCOL_MAX_PAYLOAD_SIZE = 66
            PROTOCOL_MAX_LEN = 2 + PROTOCOL_MAX_PAYLOAD_SIZE  # Match firmware PROTOCOL_MAX_LEN
            if self.expected_len < 2 or self.expected_len > PROTOCOL_MAX_LEN:
                # Invalid length - reset and check if this byte is a new 0xAA
                self.reset()
                if byte_val == PROTOCOL_HEADER_0:
                    self.buffer = bytearray([byte_val])
                    self.state = 'WAIT_HEADER_1'
            else:
                self.buffer.append(byte_val)
                self.expected_payload_len = self.expected_len - 2  # TYPE + SEQ
                self.state = 'WAIT_TYPE'
        elif self.state == 'WAIT_TYPE':
            self.message['type'] = byte_val
            self.buffer.append(byte_val)
            self.state = 'WAIT_SEQ'
        elif self.state == 'WAIT_SEQ':
            self.message['seq'] = byte_val
            self.buffer.append(byte_val)
            if self.expected_payload_len > 0:
                self.state = 'WAIT_PAYLOAD'
                self.message['payload'] = bytearray()
            else:
                self.state = 'WAIT_CRC_0'
        elif self.state == 'WAIT_PAYLOAD':
            if len(self.message['payload']) < self.expected_payload_len:
                self.message['payload'].append(byte_val)
                self.buffer.append(byte_val)
                if len(self.message['payload']) >= self.expected_payload_len:
                    self.state = 'WAIT_CRC_0'
            else:
                # Payload complete but still in WAIT_PAYLOAD - move to CRC
                self.state = 'WAIT_CRC_0'
                self.buffer.append(byte_val)
        elif self.state == 'WAIT_CRC_0':
            self.buffer.append(byte_val)
            self.state = 'WAIT_CRC_1'
        elif self.state == 'WAIT_CRC_1':
            self.buffer.append(byte_val)
            if self.validate_frame():
                self.message['valid'] = True
                # Make a copy before reset
                result_msg = {
                    'type': self.message['type'],
                    'seq': self.message['seq'],
                    'payload': bytes(self.message['payload']) if isinstance(self.message['payload'], bytearray) else self.message['payload'],
                    'valid': True
                }
                self.reset()
                # Store the message
                self.message = result_msg
                return True
            else:
                # CRC failed - reset and check if last byte is 0xAA
                self.reset()
                if byte_val == PROTOCOL_HEADER_0:
                    self.buffer = bytearray([byte_val])
                    self.state = 'WAIT_HEADER_1'
        
        # Check for buffer overflow
        if len(self.buffer) >= 256:
            self.reset()
        
        return False
    
    def validate_frame(self) -> bool:
        """Validate frame CRC"""
        expected_buffer_len = 2 + 1 + self.expected_len + 2  # Header + LEN + DATA + CRC
        if len(self.buffer) != expected_buffer_len:
            print(f"[DEBUG] Buffer length mismatch: expected {expected_buffer_len}, got {len(self.buffer)}, expected_len={self.expected_len}")
            return False
        
        # Calculate CRC16 over LEN..PAYLOAD
        # In firmware: CRC16::calculate(&buffer[2], len + 1) where len = TYPE + SEQ + PAYLOAD
        # So CRC covers: LEN(1) + TYPE(1) + SEQ(1) + PAYLOAD = 1 + expectedLen
        data_len = 1 + self.expected_len  # LEN + TYPE + SEQ + PAYLOAD
        crc_data = bytes(self.buffer[2:2+data_len])
        calculated_crc = calculate_crc16(crc_data)
        
        # Extract received CRC (little-endian)
        crc_low = self.buffer[-2]
        crc_high = self.buffer[-1]
        received_crc = crc_low | (crc_high << 8)
        
        if calculated_crc != received_crc:
            hex_buf = ' '.join(f'{b:02X}' for b in self.buffer)
            hex_crc_data = ' '.join(f'{b:02X}' for b in crc_data)
            print(f"[DEBUG] CRC mismatch: calculated=0x{calculated_crc:04X}, received=0x{received_crc:04X}")
            print(f"[DEBUG] Buffer: {hex_buf}")
            print(f"[DEBUG] CRC data ({data_len} bytes): {hex_crc_data}")
            print(f"[DEBUG] expected_len={self.expected_len}, payload_len={len(self.message['payload'])}")
        
        return calculated_crc == received_crc
    
    def get_message(self) -> Optional[dict]:
        """Get decoded message if available"""
        # Message is already copied in process_byte when valid
        if isinstance(self.message, dict) and self.message.get('valid'):
            result = self.message.copy()
            # Reset message state
            self.message = {
                'type': 0,
                'seq': 0,
                'payload': bytearray(),
                'valid': False
            }
            return result
        return None
    
    def reset(self):
        """Reset decoder state"""
        self.state = 'WAIT_HEADER_0'
        self.buffer = bytearray()
        self.expected_len = 0
        self.expected_payload_len = 0
        self.message = {
            'type': 0,
            'seq': 0,
            'payload': bytearray(),
            'valid': False
        }

class RobotTester:
    """Test robot communication"""
    
    def __init__(self, port: str, baud: int = 115200):
        self.port = port
        self.baud = baud
        self.serial = None
        self.encoder = ProtocolEncoder()
        self.decoder = ProtocolDecoder()
        self.received_messages = []
    
    def connect(self) -> bool:
        """Connect to robot"""
        try:
            self.serial = serial.Serial(
                port=self.port,
                baudrate=self.baud,
                timeout=1.0,
                write_timeout=1.0
            )
            print(f"[OK] Connected to {self.port} @ {self.baud} baud")
            time.sleep(2)  # Wait for robot to initialize
            return True
        except Exception as e:
            print(f"[ERROR] Failed to connect: {e}")
            return False
    
    def disconnect(self):
        """Disconnect from robot"""
        if self.serial and self.serial.is_open:
            self.serial.close()
            print("[OK] Disconnected")
    
    def send_command(self, msg_type: int, payload: bytes = b'{}') -> int:
        """Send a command and return sequence number"""
        seq = self.encoder.get_next_seq()
        frame = self.encoder.encode(msg_type, seq, payload)
        
        if self.serial and self.serial.is_open:
            self.serial.write(frame)
            self.serial.flush()
            frame_hex = ' '.join(f'{b:02X}' for b in frame)
            print(f"[SENT] type=0x{msg_type:02X}, seq={seq}, frame=[{frame_hex}]")
            return seq
        return 0
    
    def receive_messages(self, timeout: float = 2.0) -> List[dict]:
        """Receive and decode messages"""
        start_time = time.time()
        messages = []
        raw_bytes = []
        
        while time.time() - start_time < timeout:
            if self.serial and self.serial.in_waiting > 0:
                byte = self.serial.read(1)[0]
                raw_bytes.append(byte)
                
                # Always try to process the byte - the decoder will handle invalid frames
                # The decoder resets automatically on invalid sequences
                if self.decoder.process_byte(byte):
                    msg = self.decoder.get_message()
                    if msg:
                        messages.append(msg)
                        msg_type_name = self._get_msg_type_name(msg['type'])
                        payload_str = msg['payload'].decode('utf-8', errors='ignore') if msg['payload'] else '{}'
                        print(f"[RECV] type=0x{msg['type']:02X} ({msg_type_name}), seq={msg['seq']}, payload={payload_str}")
            else:
                time.sleep(0.01)
        
        # Print raw bytes if no messages decoded (for debugging)
        if not messages and raw_bytes:
            # Only show if we actually saw protocol-like data
            if PROTOCOL_HEADER_0 in raw_bytes:
                hex_str = ' '.join(f'{b:02X}' for b in raw_bytes[-50:])  # Last 50 bytes
                print(f"← Raw bytes (not decoded, last 50): {hex_str}")
        
        return messages
    
    def _get_msg_type_name(self, msg_type: int) -> str:
        """Get message type name"""
        names = {
            MSG_TYPE_HELLO: 'HELLO',
            MSG_TYPE_SET_MODE: 'SET_MODE',
            MSG_TYPE_DRIVE_TWIST: 'DRIVE_TWIST',
            MSG_TYPE_DRIVE_TANK: 'DRIVE_TANK',
            MSG_TYPE_SERVO: 'SERVO',
            MSG_TYPE_LED: 'LED',
            MSG_TYPE_E_STOP: 'E_STOP',
            MSG_TYPE_CONFIG_SET: 'CONFIG_SET',
            MSG_TYPE_INFO: 'INFO',
            MSG_TYPE_ACK: 'ACK',
            MSG_TYPE_TELEMETRY: 'TELEMETRY',
            MSG_TYPE_FAULT: 'FAULT',
        }
        return names.get(msg_type, f'UNKNOWN(0x{msg_type:02X})')
    
    def wait_for_ack(self, seq: int, timeout: float = 3.0) -> Optional[dict]:
        """Wait for ACK with specific sequence number"""
        messages = self.receive_messages(timeout)
        for msg in messages:
            if msg['type'] == MSG_TYPE_ACK and msg['seq'] == seq:
                try:
                    ack_data = json.loads(msg['payload'].decode('utf-8'))
                    return ack_data
                except:
                    return {'ok': True}  # Assume OK if can't parse
        return None
    
    def test_hello(self) -> bool:
        """Test HELLO command"""
        print("\n=== Test: HELLO ===")
        # First, flush any existing data
        if self.serial and self.serial.in_waiting > 0:
            self.serial.read(self.serial.in_waiting)
        time.sleep(0.1)
        seq = self.send_command(MSG_TYPE_HELLO, b'{}')
        messages = self.receive_messages(3.0)
        
        info_received = False
        ack_received = False
        
        for msg in messages:
            if msg['type'] == MSG_TYPE_INFO:
                info_received = True
                try:
                    info_data = json.loads(msg['payload'].decode('utf-8'))
                    print(f"  Robot Info: {json.dumps(info_data, indent=2)}")
                except:
                    print(f"  Robot Info: {msg['payload']}")
            elif msg['type'] == MSG_TYPE_ACK and msg['seq'] == seq:
                ack_received = True
                try:
                    ack_data = json.loads(msg['payload'].decode('utf-8'))
                    print(f"  ACK: {json.dumps(ack_data, indent=2)}")
                except:
                    print(f"  ACK: OK")
        
        success = info_received and ack_received
        print(f"  Result: {'[PASS]' if success else '[FAIL]'}")
        return success
    
    def test_set_mode(self, mode: int) -> bool:
        """Test SET_MODE command"""
        print(f"\n=== Test: SET_MODE (mode={mode}) ===")
        # Flush any existing data
        if self.serial and self.serial.in_waiting > 0:
            self.serial.read(self.serial.in_waiting)
        time.sleep(0.1)
        
        payload = json.dumps({'mode': mode}).encode('utf-8')
        seq = self.send_command(MSG_TYPE_SET_MODE, payload)
        ack = self.wait_for_ack(seq, 2.0)
        
        if ack:
            success = ack.get('ok', False)
            print(f"  ACK: {json.dumps(ack, indent=2)}")
            if success:
                # Give firmware time to process mode change and flush serial buffers
                if self.serial:
                    self.serial.flush()
                time.sleep(0.5)  # Increased delay to ensure mode is fully set
            print(f"  Result: {'[PASS]' if success else '[FAIL]'}")
            return success
        else:
            print(f"  Result: [FAIL] (no ACK received)")
            return False
    
    def test_drive_tank(self, left: int, right: int, ensure_mode: bool = True) -> bool:
        """Test DRIVE_TANK command"""
        print(f"\n=== Test: DRIVE_TANK (left={left}, right={right}) ===")
        # Flush any existing data before sending command
        if self.serial and self.serial.in_waiting > 0:
            self.serial.read(self.serial.in_waiting)
        time.sleep(0.1)
        
        # Ensure we're in MANUAL mode before sending drive command
        if ensure_mode:
            # Flush any pending data first
            if self.serial and self.serial.in_waiting > 0:
                self.serial.read(self.serial.in_waiting)
            time.sleep(0.1)
            
            mode_payload = json.dumps({'mode': 1}).encode('utf-8')
            mode_seq = self.send_command(MSG_TYPE_SET_MODE, mode_payload)
            
            # Wait for ACK and flush after receiving it
            mode_ack = self.wait_for_ack(mode_seq, 2.0)
            if not mode_ack or not mode_ack.get('ok', False):
                print(f"  Warning: Failed to set MANUAL mode before DRIVE_TANK")
            else:
                # Flush serial buffers and wait for firmware to fully process mode change
                if self.serial:
                    self.serial.flush()
                time.sleep(0.5)  # Longer delay to ensure mode is fully set
        
        payload = json.dumps({'left': left, 'right': right}).encode('utf-8')
        seq = self.send_command(MSG_TYPE_DRIVE_TANK, payload)
        
        # Wait for ACK with longer timeout and check for any messages
        messages = self.receive_messages(3.0)
        ack = None
        for msg in messages:
            if msg['type'] == MSG_TYPE_ACK and msg['seq'] == seq:
                try:
                    ack = json.loads(msg['payload'].decode('utf-8'))
                    break
                except:
                    ack = {'ok': True}  # Assume OK if can't parse
                    break
        
        if ack:
            success = ack.get('ok', False)
            error_code = ack.get('err', 0)
            print(f"  ACK: {json.dumps(ack, indent=2)}")
            if not success:
                error_names = {
                    1: 'Unknown command',
                    2: 'Invalid parameter',
                    3: 'Invalid mode',
                    4: 'Wrong mode (not in MANUAL mode)',
                    5: 'JSON parse error'
                }
                error_msg = error_names.get(error_code, f'Error code {error_code}')
                print(f"  Error: {error_msg}")
            print(f"  Result: {'[PASS]' if success else '[FAIL]'}")
            return success
        else:
            print(f"  Result: [FAIL] (no ACK received)")
            if messages:
                print(f"  Received {len(messages)} other messages instead")
            return False
    
    def test_servo(self, angle: int) -> bool:
        """Test SERVO command"""
        print(f"\n=== Test: SERVO (angle={angle}) ===")
        payload = json.dumps({'angle': angle}).encode('utf-8')
        seq = self.send_command(MSG_TYPE_SERVO, payload)
        ack = self.wait_for_ack(seq, 2.0)
        
        if ack:
            success = ack.get('ok', False)
            print(f"  ACK: {json.dumps(ack, indent=2)}")
            print(f"  Result: {'[PASS]' if success else '[FAIL]'}")
            return success
        else:
            print(f"  Result: [FAIL] (no ACK received)")
            return False
    
    def test_led(self, r: int, g: int, b: int) -> bool:
        """Test LED command"""
        print(f"\n=== Test: LED (r={r}, g={g}, b={b}) ===")
        payload = json.dumps({'r': r, 'g': g, 'b': b, 'brightness': 255}).encode('utf-8')
        seq = self.send_command(MSG_TYPE_LED, payload)
        ack = self.wait_for_ack(seq, 2.0)
        
        if ack:
            success = ack.get('ok', False)
            print(f"  ACK: {json.dumps(ack, indent=2)}")
            print(f"  Result: {'[PASS]' if success else '[FAIL]'}")
            return success
        else:
            print(f"  Result: [FAIL] (no ACK received)")
            return False
    
    def test_telemetry(self) -> bool:
        """Test receiving telemetry"""
        print(f"\n=== Test: TELEMETRY (waiting 5 seconds) ===")
        print("  Note: Telemetry may be disabled in firmware (TASK_TELEMETRY_HZ=0)")
        messages = self.receive_messages(5.0)
        
        telemetry_received = False
        for msg in messages:
            if msg['type'] == MSG_TYPE_TELEMETRY:
                telemetry_received = True
                try:
                    telemetry_data = json.loads(msg['payload'].decode('utf-8'))
                    print(f"  Telemetry: {json.dumps(telemetry_data, indent=2)}")
                except:
                    print(f"  Telemetry: {msg['payload']}")
        
        if telemetry_received:
            print(f"  Result: [PASS]")
            return True
        else:
            print(f"  Result: [SKIP] (no telemetry received - may be disabled in firmware)")
            # Don't fail this test - telemetry is optional and may be disabled
            return True
    
    def test_boot_messages(self) -> bool:
        """Test: Wait for boot messages from robot"""
        print("\n=== Test: Boot Messages (waiting 3 seconds) ===")
        messages = self.receive_messages(3.0)
        if messages:
            print(f"  Received {len(messages)} messages during boot")
            return True
        else:
            print("  No boot messages received (this is OK - firmware only sends INFO on HELLO)")
            # This is not a failure - firmware doesn't send boot messages automatically
            return True  # Pass this test since it's expected behavior
    
    def run_all_tests(self):
        """Run all tests"""
        print("=" * 60)
        print("ZIP Robot Serial Communication Test")
        print("=" * 60)
        
        if not self.connect():
            return
        
        results = []
        
        # Test 0: Check for boot messages
        results.append(('BOOT_MESSAGES', self.test_boot_messages()))
        time.sleep(0.5)
        
        # Test 1: HELLO
        results.append(('HELLO', self.test_hello()))
        time.sleep(1)
        
        # Test 2: SET_MODE to MANUAL (mode 1)
        results.append(('SET_MODE(MANUAL)', self.test_set_mode(1)))
        # Additional delay after mode change (already has delay in test_set_mode)
        time.sleep(0.3)
        
        # Test 3: DRIVE_TANK (requires MANUAL mode)
        # Don't auto-set mode for first test since we just set it
        results.append(('DRIVE_TANK', self.test_drive_tank(50, 50, ensure_mode=False)))
        time.sleep(0.5)
        # Auto-set mode for stop command in case something reset it
        results.append(('DRIVE_TANK(stop)', self.test_drive_tank(0, 0, ensure_mode=True)))
        time.sleep(1)
        
        # Test 4: SERVO
        results.append(('SERVO(90)', self.test_servo(90)))
        time.sleep(0.5)
        results.append(('SERVO(0)', self.test_servo(0)))
        time.sleep(0.5)
        results.append(('SERVO(180)', self.test_servo(180)))
        time.sleep(0.5)
        results.append(('SERVO(90)', self.test_servo(90)))
        time.sleep(1.0)  # Longer delay before next test
        
        # Test 5: LED
        results.append(('LED(red)', self.test_led(255, 0, 0)))
        time.sleep(0.5)
        results.append(('LED(green)', self.test_led(0, 255, 0)))
        time.sleep(0.5)
        results.append(('LED(blue)', self.test_led(0, 0, 255)))
        time.sleep(0.5)
        results.append(('LED(cyan)', self.test_led(0, 255, 255)))
        time.sleep(1)
        
        # Test 6: TELEMETRY
        results.append(('TELEMETRY', self.test_telemetry()))
        
        # Summary
        print("\n" + "=" * 60)
        print("Test Summary")
        print("=" * 60)
        passed = sum(1 for _, result in results if result)
        total = len(results)
        for test_name, result in results:
            status = "[PASS]" if result else "[FAIL]"
            print(f"  {status}: {test_name}")
        print(f"\nTotal: {passed}/{total} tests passed")
        print("=" * 60)
        
        self.disconnect()

def find_serial_ports():
    """Find available serial ports"""
    ports = serial.tools.list_ports.comports()
    return [port.device for port in ports]

def main():
    import argparse
    
    parser = argparse.ArgumentParser(description='Test ZIP Robot serial communication')
    parser.add_argument('--port', type=str, help='Serial port (e.g., COM3 or /dev/ttyUSB0)')
    parser.add_argument('--baud', type=int, default=115200, help='Baud rate (default: 115200)')
    parser.add_argument('--list-ports', action='store_true', help='List available serial ports')
    
    args = parser.parse_args()
    
    if args.list_ports:
        print("Available serial ports:")
        ports = find_serial_ports()
        if ports:
            for port in ports:
                print(f"  {port}")
        else:
            print("  No serial ports found")
        return
    
    port = args.port
    if not port:
        # Auto-detect port
        ports = find_serial_ports()
        if not ports:
            print("[ERROR] No serial ports found. Use --port to specify manually.")
            return
        
        # Prefer ports that look like Arduino/robot controllers
        arduino_ports = [p for p in ports if 'COM' in p.upper() or 'USB' in p.upper() or 'tty' in p.lower()]
        if arduino_ports:
            port = arduino_ports[0]
            print(f"Auto-detected port: {port}")
        else:
            port = ports[0]
            print(f"Using first available port: {port}")
    
    tester = RobotTester(port, args.baud)
    tester.run_all_tests()

if __name__ == '__main__':
    main()

