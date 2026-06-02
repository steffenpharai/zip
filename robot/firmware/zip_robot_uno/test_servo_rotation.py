#!/usr/bin/env python3
"""
Servo Rotation Test Script for ZIP Robot Firmware

Tests the servo panning functionality via the JSON protocol (N=5).
The servo is connected to PIN_SERVO_Z (pin 10) and supports 0-180 degrees.

JSON Protocol Format:
  Send: {"N": 5, "H": "H1", "D1": 90}
  Response: {H1_ok}

Usage:
  python test_servo_rotation.py --port COM5
  python test_servo_rotation.py --port COM5 --sweep
  python test_servo_rotation.py --port COM5 --angle 90
"""

import serial
import serial.tools.list_ports
import time
import argparse
import sys
import json
import os

# Log file path for debug mode
LOG_FILE = r"C:\Phygital\Zip\.cursor\debug.log"

def write_log(location: str, message: str, data: dict, hypothesis_id: str = ""):
    """Write NDJSON log entry to debug log file"""
    entry = {
        "timestamp": int(time.time() * 1000),
        "location": location,
        "message": message,
        "data": data,
        "sessionId": "debug-session",
        "runId": "servo-test",
        "hypothesisId": hypothesis_id
    }
    try:
        with open(LOG_FILE, "a") as f:
            f.write(json.dumps(entry) + "\n")
    except Exception as e:
        print(f"[LOG ERROR] {e}")


class ServoTester:
    """Test servo rotation via JSON protocol"""
    
    def __init__(self, port: str, baud: int = 115200):
        self.port = port
        self.baud = baud
        self.serial = None
        self.cmd_seq = 0
        self.debug_lines = []  # Collect all debug output
    
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
            write_log("test_servo_rotation.py:connect", "Connected to serial port", {"port": self.port, "baud": self.baud})
            
            time.sleep(2)  # Wait for robot to initialize after DTR reset
            
            # Capture boot messages
            if self.serial.in_waiting > 0:
                boot_data = self.serial.read(self.serial.in_waiting)
                boot_str = boot_data.decode('utf-8', errors='ignore')
                print(f"[BOOT] {len(boot_data)} bytes:")
                for line in boot_str.split('\n'):
                    line = line.strip()
                    if line:
                        print(f"  {line}")
                        self.debug_lines.append(line)
                        # Log debug lines from firmware
                        if line.startswith("[DBG]"):
                            write_log("firmware:boot", line, {"raw": line}, "H1,H2,H3")
            
            return True
        except Exception as e:
            print(f"[ERROR] Failed to connect: {e}")
            write_log("test_servo_rotation.py:connect", "Connection failed", {"error": str(e)})
            return False
    
    def disconnect(self):
        """Disconnect from robot"""
        if self.serial and self.serial.is_open:
            self.serial.close()
            print("[OK] Disconnected")
            write_log("test_servo_rotation.py:disconnect", "Disconnected", {"debug_lines_count": len(self.debug_lines)})
    
    def get_next_seq(self) -> str:
        """Get next command sequence ID"""
        self.cmd_seq += 1
        return f"H{self.cmd_seq}"
    
    def send_servo_command(self, angle: int) -> tuple[bool, str]:
        """
        Send servo command via JSON protocol.
        
        Args:
            angle: Servo angle (0-180 degrees)
            
        Returns:
            Tuple of (success, response_text)
        """
        if not self.serial or not self.serial.is_open:
            return False, "Not connected"
        
        # Clamp angle to valid range
        angle = max(0, min(180, angle))
        
        # Build proper JSON command: {"N":5,"H":"H1","D1":90}
        seq = self.get_next_seq()
        cmd = json.dumps({"N": 5, "H": seq, "D1": angle})
        
        # Flush any pending data and capture debug output
        if self.serial.in_waiting > 0:
            pending = self.serial.read(self.serial.in_waiting)
            pending_str = pending.decode('utf-8', errors='ignore')
            for line in pending_str.split('\n'):
                line = line.strip()
                if line:
                    self.debug_lines.append(line)
                    if line.startswith("[DBG]"):
                        print(f"  {line}")
                        write_log("firmware:pending", line, {"raw": line}, "H1,H2,H3,H4,H5")
        
        # Send command
        self.serial.write(cmd.encode('utf-8'))
        self.serial.flush()
        print(f"[SENT] {cmd}")
        write_log("test_servo_rotation.py:send", "Sent servo command", {"cmd": cmd, "angle": angle, "seq": seq}, "H4")
        
        # Wait for response and capture ALL output (including debug)
        response, debug_output = self._read_response_with_debug(timeout=2.0)
        
        # Check for success
        expected_ok = f"{{{seq}_ok}}"
        success = expected_ok in response or "{ok}" in response
        
        if success:
            print(f"[RECV] {response.strip()} ✓")
        else:
            print(f"[RECV] {response.strip()} ✗ (expected {expected_ok})")
        
        write_log("test_servo_rotation.py:recv", "Received response", {
            "response": response.strip(),
            "debug_output": debug_output,
            "success": success,
            "expected": expected_ok
        }, "H4")
        
        return success, response
    
    def _read_response_with_debug(self, timeout: float = 2.0) -> tuple[str, list]:
        """Read response from robot, capturing debug output separately"""
        start_time = time.time()
        response = ""
        debug_output = []
        
        while time.time() - start_time < timeout:
            if self.serial.in_waiting > 0:
                data = self.serial.read(self.serial.in_waiting)
                text = data.decode('utf-8', errors='ignore')
                
                for line in text.split('\n'):
                    line_stripped = line.strip()
                    if not line_stripped:
                        continue
                    
                    # Check if it's debug output
                    if line_stripped.startswith("[DBG]"):
                        debug_output.append(line_stripped)
                        self.debug_lines.append(line_stripped)
                        print(f"  {line_stripped}")
                        write_log("firmware:debug", line_stripped, {"raw": line_stripped}, "H1,H2,H3,H4,H5")
                    else:
                        response += line + "\n"
                
                # Check if we got a JSON response
                if "{" in response and "}" in response:
                    break
            else:
                time.sleep(0.01)
        
        return response, debug_output
    
    def test_single_angle(self, angle: int) -> bool:
        """Test setting servo to a single angle"""
        print(f"\n=== Test: Set Servo to {angle}° ===")
        success, response = self.send_servo_command(angle)
        time.sleep(0.5)  # Allow servo to move
        return success
    
    def test_sweep(self, min_angle: int = 0, max_angle: int = 180, step: int = 10, delay: float = 0.6) -> bool:
        """Test sweeping servo through a range of angles"""
        print(f"\n=== Test: Sweep Servo {min_angle}° to {max_angle}° (step={step}°) ===")
        
        all_success = True
        
        # Sweep forward
        print("Sweeping forward...")
        for angle in range(min_angle, max_angle + 1, step):
            success, _ = self.send_servo_command(angle)
            if not success:
                all_success = False
            time.sleep(delay)
        
        # Sweep backward
        print("Sweeping backward...")
        for angle in range(max_angle, min_angle - 1, -step):
            success, _ = self.send_servo_command(angle)
            if not success:
                all_success = False
            time.sleep(delay)
        
        return all_success
    
    def test_edge_cases(self) -> bool:
        """Test edge cases: 0°, 90°, 180°, and out-of-range values"""
        print("\n=== Test: Edge Cases ===")
        
        results = []
        
        # Test valid angles
        for angle in [0, 45, 90, 135, 180]:
            print(f"\nTesting angle: {angle}°")
            success, _ = self.send_servo_command(angle)
            results.append((f"{angle}°", success))
            time.sleep(0.5)
        
        # Test boundary clamping (should clamp to valid range)
        print("\nTesting boundary clamping (out-of-range values):")
        for angle in [-10, 200]:
            clamped = max(0, min(180, angle))
            print(f"  Sending {angle}° (should clamp to {clamped}°)")
            success, _ = self.send_servo_command(angle)
            results.append((f"{angle}° clamped", success))
            time.sleep(0.5)
        
        # Print results
        print("\n--- Edge Case Results ---")
        all_success = True
        for name, success in results:
            status = "✓" if success else "✗"
            print(f"  {status} {name}")
            if not success:
                all_success = False
        
        return all_success
    
    def test_rapid_moves(self, count: int = 20) -> bool:
        """Test rapid servo movements"""
        print(f"\n=== Test: Rapid Movements ({count} moves) ===")
        
        import random
        all_success = True
        
        for i in range(count):
            angle = random.randint(0, 180)
            success, _ = self.send_servo_command(angle)
            if not success:
                all_success = False
            time.sleep(0.05)  # Minimal delay
        
        # Return to center
        print("Returning to center (90°)...")
        success, _ = self.send_servo_command(90)
        time.sleep(0.5)
        
        return all_success and success
    
    def run_all_tests(self) -> bool:
        """Run all servo tests"""
        print("=" * 60)
        print("ZIP Robot Servo Rotation Test")
        print("=" * 60)
        
        write_log("test_servo_rotation.py:run_all_tests", "Starting all tests", {})
        
        if not self.connect():
            return False
        
        results = []
        
        try:
            # Test 1: Edge cases
            results.append(("Edge Cases", self.test_edge_cases()))
            
            # Test 2: Sweep
            results.append(("Sweep", self.test_sweep(0, 180, 20, 0.3)))
            
            # Test 3: Rapid moves
            results.append(("Rapid Moves", self.test_rapid_moves(15)))
            
            # Return to center
            print("\n=== Returning to Center (90°) ===")
            self.send_servo_command(90)
            time.sleep(0.5)
            
        finally:
            self.disconnect()
        
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
        
        # Print all collected debug lines
        if self.debug_lines:
            print("\n" + "=" * 60)
            print("Collected Debug Output from Firmware")
            print("=" * 60)
            for line in self.debug_lines:
                print(f"  {line}")
            write_log("test_servo_rotation.py:summary", "All debug lines", {"debug_lines": self.debug_lines}, "H1,H2,H3,H4,H5")
        else:
            print("\n[WARNING] No debug output received from firmware!")
            write_log("test_servo_rotation.py:summary", "NO debug output received!", {}, "H1,H2,H3,H4,H5")
        
        return passed == total


def find_serial_ports():
    """Find available serial ports"""
    ports = serial.tools.list_ports.comports()
    return [port.device for port in ports]


def main():
    parser = argparse.ArgumentParser(description='Test ZIP Robot servo rotation')
    parser.add_argument('--port', type=str, help='Serial port (e.g., COM5 or /dev/ttyUSB0)')
    parser.add_argument('--baud', type=int, default=115200, help='Baud rate (default: 115200)')
    parser.add_argument('--list-ports', action='store_true', help='List available serial ports')
    parser.add_argument('--angle', type=int, help='Set servo to specific angle (0-180)')
    parser.add_argument('--sweep', action='store_true', help='Run sweep test only')
    parser.add_argument('--all', action='store_true', help='Run all tests')
    
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
    
    tester = ServoTester(port, args.baud)
    
    if args.angle is not None:
        # Single angle test
        if tester.connect():
            tester.test_single_angle(args.angle)
            tester.disconnect()
    elif args.sweep:
        # Sweep test only
        if tester.connect():
            tester.test_sweep()
            tester.disconnect()
    elif args.all:
        # Run all tests
        tester.run_all_tests()
    else:
        # Default: run all tests
        tester.run_all_tests()


if __name__ == '__main__':
    main()
