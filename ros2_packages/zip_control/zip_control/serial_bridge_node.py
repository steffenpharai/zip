#!/usr/bin/env python3
"""
ZIP Robot Serial Bridge Node

ROS 2 node that bridges between ROS 2 topics and Arduino firmware via serial.
Translates:
- /cmd_vel (geometry_msgs/Twist) → ELEGOO JSON N=200 setpoint commands
- Firmware responses → /ultrasonic, /battery, /line_sensors, /robot_sensors, /robot_diagnostics topics
- ROS services → Arduino commands (servo, macros, diagnostics, etc.)

Protocol: ELEGOO JSON at 115200 baud
Format: {"N":<cmd>,"H":"<tag>","D1":<val>,"D2":<val>,"T":<ttl>}
"""

import rclpy
from rclpy.node import Node
from rclpy.qos import QoSProfile, ReliabilityPolicy, DurabilityPolicy
import serial
import serial.tools.list_ports
import json
import re
import threading
import time
from typing import Optional, Dict, Any, Tuple

from geometry_msgs.msg import Twist
from sensor_msgs.msg import Imu, Range
from std_msgs.msg import Header
from zip_core.msg import BatteryStatus, RobotSensors, RobotDiagnostics
from zip_core.srv import (
    EmergencyStop, ServoControl, MacroExecute, MacroCancel,
    GetDiagnostics, DirectMotorControl, ReRunInit, SetDriveConfig
)

# ELEGOO JSON Protocol Constants
CMD_HELLO = 0
CMD_SERVO = 5
CMD_ULTRASONIC = 21
CMD_LINE_SENSOR = 22
CMD_BATTERY = 23
CMD_DIAGNOSTICS = 120
CMD_RERUN_INIT = 130
CMD_SET_DRIVE_CONFIG = 140
CMD_SETPOINT = 200
CMD_STOP = 201
CMD_MACRO_EXECUTE = 210
CMD_MACRO_CANCEL = 211
CMD_DIRECT_MOTOR = 999

# Response patterns
TOKEN_PATTERN = re.compile(r'^\{(\w+)_(\w+)\}$')
DIAGNOSTICS_PATTERN = re.compile(r'^\{([^}]+)\}$')  # Matches diagnostics format
BOOT_MARKER = 'R'
READY_MARKER = 'READY'

# Default serial settings
DEFAULT_BAUD = 115200
DEFAULT_TIMEOUT = 1.0
HANDSHAKE_TIMEOUT = 5.0
COMMAND_TIMEOUT = 2.0
SETPOINT_TTL_MS = 200  # Time-to-live for setpoint commands
SETPOINT_MAX_RATE_HZ = 30  # Maximum setpoint rate


class SerialBridgeNode(Node):
    """Serial bridge between ROS 2 and Arduino firmware"""
    
    def __init__(self):
        super().__init__('serial_bridge_node')
        
        # Parameters
        self.declare_parameter('serial_port', '')
        self.declare_parameter('baud_rate', DEFAULT_BAUD)
        self.declare_parameter('auto_detect_port', True)
        self.declare_parameter('setpoint_ttl_ms', SETPOINT_TTL_MS)
        self.declare_parameter('setpoint_max_rate_hz', float(SETPOINT_MAX_RATE_HZ))
        self.declare_parameter('sensor_poll_rate_hz', 5.0)  # Poll sensors at 5Hz
        
        # Get parameters
        self.serial_port = self.get_parameter('serial_port').get_parameter_value().string_value
        self.baud_rate = self.get_parameter('baud_rate').get_parameter_value().integer_value
        self.auto_detect = self.get_parameter('auto_detect_port').get_parameter_value().bool_value
        self.setpoint_ttl = self.get_parameter('setpoint_ttl_ms').get_parameter_value().integer_value
        self.setpoint_max_rate = self.get_parameter('setpoint_max_rate_hz').get_parameter_value().double_value
        self.sensor_poll_rate = self.get_parameter('sensor_poll_rate_hz').get_parameter_value().double_value
        
        # Serial connection
        self.serial: Optional[serial.Serial] = None
        self.serial_lock = threading.Lock()
        self.is_ready = False
        self.handshake_complete = False
        
        # State tracking
        self.last_setpoint_time = 0.0
        self.setpoint_min_interval = 1.0 / self.setpoint_max_rate
        self.pending_commands: Dict[str, Any] = {}  # Tag -> (cmd_type, callback, response_event)
        self.command_counter = 0
        self._reader_running = False
        
        # Latest sensor readings
        self.latest_line_sensors = {'left': 0, 'middle': 0, 'right': 0}
        self.latest_ultrasonic = -1.0
        self.latest_battery_voltage = 0.0
        self.latest_diagnostics: Optional[RobotDiagnostics] = None
        self.diagnostics_response_event: Optional[threading.Event] = None
        self.diagnostics_raw_response: list = []  # Store both lines
        self.diagnostics_collecting = False
        
        # QoS profiles
        qos_profile = QoSProfile(
            reliability=ReliabilityPolicy.BEST_EFFORT,
            durability=DurabilityPolicy.VOLATILE,
            depth=10
        )
        
        # Publishers
        self.ultrasonic_pub = self.create_publisher(
            Range,
            '/ultrasonic',
            qos_profile
        )
        
        self.battery_pub = self.create_publisher(
            BatteryStatus,
            '/battery',
            qos_profile
        )
        
        self.imu_pub = self.create_publisher(
            Imu,
            '/imu',
            qos_profile
        )
        
        self.robot_sensors_pub = self.create_publisher(
            RobotSensors,
            '/robot_sensors',
            qos_profile
        )
        
        self.robot_diagnostics_pub = self.create_publisher(
            RobotDiagnostics,
            '/robot_diagnostics',
            qos_profile
        )
        
        # Subscriber
        self.cmd_vel_sub = self.create_subscription(
            Twist,
            '/cmd_vel',
            self.cmd_vel_callback,
            qos_profile
        )
        
        # Service servers
        self.emergency_stop_srv = self.create_service(
            EmergencyStop,
            '/emergency_stop',
            self.emergency_stop_callback
        )
        
        self.servo_control_srv = self.create_service(
            ServoControl,
            '/servo_control',
            self.servo_control_callback
        )
        
        self.macro_execute_srv = self.create_service(
            MacroExecute,
            '/macro_execute',
            self.macro_execute_callback
        )
        
        self.macro_cancel_srv = self.create_service(
            MacroCancel,
            '/macro_cancel',
            self.macro_cancel_callback
        )
        
        self.get_diagnostics_srv = self.create_service(
            GetDiagnostics,
            '/get_diagnostics',
            self.get_diagnostics_callback
        )
        
        self.direct_motor_srv = self.create_service(
            DirectMotorControl,
            '/direct_motor_control',
            self.direct_motor_callback
        )
        
        self.rerun_init_srv = self.create_service(
            ReRunInit,
            '/rerun_init',
            self.rerun_init_callback
        )
        
        self.set_drive_config_srv = self.create_service(
            SetDriveConfig,
            '/set_drive_config',
            self.set_drive_config_callback
        )
        
        # Timers
        self.sensor_timer = self.create_timer(
            1.0 / self.sensor_poll_rate,
            self.poll_sensors
        )
        
        # Start serial connection
        self.get_logger().info('Serial bridge node starting...')
        self.connect_serial()
        
        # Start serial reader thread
        self.reader_thread = threading.Thread(target=self.serial_reader_loop, daemon=True)
        self.reader_thread.start()
        
        self.get_logger().info('Serial bridge node started')
    
    def find_serial_port(self) -> Optional[str]:
        """Auto-detect Arduino serial port"""
        ports = serial.tools.list_ports.comports()
        
        # Prefer ports that look like Arduino/robot controllers
        arduino_ports = [
            p for p in ports
            if any(keyword in (p.manufacturer or '').lower() 
                   or keyword in (p.description or '').lower()
                   for keyword in ['arduino', 'ch340', 'ftdi', 'cp210', 'usb serial'])
        ]
        
        if arduino_ports:
            port = arduino_ports[0].device
            self.get_logger().info(f'Auto-detected port: {port}')
            return port
        
        if ports:
            port = ports[0].device
            self.get_logger().info(f'Using first available port: {port}')
            return port
        
        return None
    
    def connect_serial(self):
        """Open serial connection and perform handshake"""
        # Determine port
        if not self.serial_port:
            if self.auto_detect:
                self.serial_port = self.find_serial_port()
                if not self.serial_port:
                    self.get_logger().error('No serial port found and auto-detect enabled')
                    return
            else:
                # Platform-specific defaults
                import platform
                if platform.system() == 'Windows':
                    self.serial_port = 'COM3'
                else:
                    self.serial_port = '/dev/ttyUSB0'
        
        try:
            self.get_logger().info(f'Opening serial port: {self.serial_port} @ {self.baud_rate} baud')
            self.serial = serial.Serial(
                port=self.serial_port,
                baudrate=self.baud_rate,
                timeout=DEFAULT_TIMEOUT,
                write_timeout=DEFAULT_TIMEOUT
            )
            
            # Wait for port to settle
            time.sleep(0.1)
            
            # Start handshake
            self.perform_handshake()
            
        except serial.SerialException as e:
            self.get_logger().error(f'Failed to open serial port: {e}')
            self.serial = None
    
    def perform_handshake(self):
        """Perform handshake with firmware (wait for boot marker, send hello)"""
        if not self.serial or not self.serial.is_open:
            return
        
        self.get_logger().info('Starting handshake...')
        self.handshake_complete = False
        
        # Wait for boot marker, ready marker, or INIT message
        start_time = time.time()
        boot_seen = False
        
        while time.time() - start_time < HANDSHAKE_TIMEOUT:
            if self.serial.in_waiting > 0:
                line = self.serial.readline().decode('utf-8', errors='ignore').strip()
                if line == BOOT_MARKER or READY_MARKER in line or 'INIT:' in line:
                    boot_seen = True
                    self.get_logger().info(f'Boot/ready/init marker received: {line}')
                    break
            time.sleep(0.1)
        
        if not boot_seen:
            self.get_logger().warn('Boot marker timeout, attempting hello anyway')
        
        # Small delay to let Arduino finish initialization
        time.sleep(0.5)
        
        # Send hello command up to 3 times
        for attempt in range(3):
            tag = f'h{attempt + 1}'
            cmd = self.build_command(CMD_HELLO, tag=tag)
            
            if self.send_command(cmd):
                # Wait for response - check both the tag and generic hello responses
                start_time = time.time()
                while time.time() - start_time < COMMAND_TIMEOUT:
                    if self.serial.in_waiting > 0:
                        line = self.serial.readline().decode('utf-8', errors='ignore').strip()
                        # Check for token response with our tag or any hello response
                        if self.is_token_response(line):
                            parsed = self.parse_token_response(line)
                            if parsed:
                                resp_tag, resp_value = parsed
                                # Accept response if tag matches or if it's a hello response
                                if (tag in resp_tag or resp_tag in tag or 
                                    'hello' in resp_tag.lower() or resp_value.lower() == 'ok'):
                                    if resp_value.lower() == 'ok':
                                        self.get_logger().info(f'Handshake complete - received: {line}')
                                        self.handshake_complete = True
                                        self.is_ready = True
                                        return
                    time.sleep(0.05)
                
                self.get_logger().warn(f'Hello attempt {attempt + 1} timed out')
            else:
                self.get_logger().warn(f'Failed to send hello attempt {attempt + 1}')
            
            time.sleep(0.5)
        
        self.get_logger().error('Handshake failed: max attempts exceeded')
        self.is_ready = False
    
    def build_command(self, cmd_num: int, tag: Optional[str] = None, 
                     d1: Optional[int] = None, d2: Optional[int] = None, 
                     ttl: Optional[int] = None) -> Dict[str, Any]:
        """Build ELEGOO JSON command"""
        cmd = {'N': cmd_num}
        if tag:
            cmd['H'] = tag
        if d1 is not None:
            cmd['D1'] = d1
        if d2 is not None:
            cmd['D2'] = d2
        if ttl is not None:
            cmd['T'] = ttl
        return cmd
    
    def send_command(self, cmd: Dict[str, Any]) -> bool:
        """Send command to serial port with error handling (industry standard)"""
        if not self.serial or not self.serial.is_open:
            self.get_logger().warn('Serial port not open')
            return False
        
        try:
            with self.serial_lock:
                json_str = json.dumps(cmd)
                data = (json_str + '\n').encode('utf-8')
                bytes_written = self.serial.write(data)
                self.serial.flush()  # Ensure data is sent immediately
                
                if bytes_written != len(data):
                    self.get_logger().warn(f'Partial write: {bytes_written}/{len(data)} bytes')
                    return False
                
                self.get_logger().debug(f'TX: {json_str}')
                return True
        except serial.SerialTimeoutException:
            self.get_logger().error('Serial write timeout')
            return False
        except serial.SerialException as e:
            self.get_logger().error(f'Serial exception: {e}')
            # Mark as not ready if serial error
            self.is_ready = False
            return False
        except Exception as e:
            self.get_logger().error(f'Failed to send command: {e}')
            return False
    
    def cmd_vel_callback(self, msg: Twist):
        """Handle /cmd_vel subscription - convert to setpoint command"""
        if not self.is_ready:
            return
        
        # Rate limiting
        now = time.time()
        if now - self.last_setpoint_time < self.setpoint_min_interval:
            return
        
        self.last_setpoint_time = now
        
        # Convert Twist to v, w (forward velocity and angular velocity)
        # Linear.x is forward velocity (m/s), Angular.z is yaw rate (rad/s)
        # Scale to PWM range: -255 to 255
        # Approximate scaling: 1 m/s ≈ 100 PWM, 1 rad/s ≈ 50 PWM
        v = int(msg.linear.x * 100.0)  # Forward velocity
        w = int(msg.angular.z * 50.0)  # Angular velocity
        
        # Clamp to PWM range
        v = max(-255, min(255, v))
        w = max(-255, min(255, w))
        
        # Build setpoint command (N=200)
        cmd = self.build_command(CMD_SETPOINT, d1=v, d2=w, ttl=self.setpoint_ttl)
        self.send_command(cmd)
    
    def poll_sensors(self):
        """Periodically poll sensors"""
        if not self.is_ready:
            return
        
        # Poll ultrasonic (N=21, D1=2 for distance)
        self.command_counter += 1
        tag_ultra = f'ultra{self.command_counter}'
        cmd_ultra = self.build_command(CMD_ULTRASONIC, tag=tag_ultra, d1=2)
        self.pending_commands[tag_ultra] = ('ultrasonic', None, None)
        self.send_command(cmd_ultra)
        
        # Poll battery (N=23)
        tag_batt = f'batt{self.command_counter}'
        cmd_batt = self.build_command(CMD_BATTERY, tag=tag_batt)
        self.pending_commands[tag_batt] = ('battery', None, None)
        self.send_command(cmd_batt)
        
        # Poll line sensors (N=22, D1=0,1,2 for left, middle, right)
        for i, sensor_name in enumerate(['left', 'middle', 'right']):
            tag_line = f'line{self.command_counter}_{i}'
            cmd_line = self.build_command(CMD_LINE_SENSOR, tag=tag_line, d1=i)
            self.pending_commands[tag_line] = (f'line_{sensor_name}', None, None)
            self.send_command(cmd_line)
        
        # Publish aggregated sensor message
        self.publish_robot_sensors()
    
    def is_token_response(self, line: str) -> bool:
        """Check if line is a token response like {tag_ok} or {tag_value}"""
        return bool(TOKEN_PATTERN.match(line.strip()))
    
    def parse_token_response(self, line: str) -> Optional[tuple]:
        """Parse token response: returns (tag, value) or None"""
        match = TOKEN_PATTERN.match(line.strip())
        if match:
            return (match.group(1), match.group(2))
        return None
    
    def serial_reader_loop(self):
        """Background thread to read serial responses"""
        buffer = ''
        self._reader_running = True
        
        while self._reader_running:
            if not self.serial or not self.serial.is_open:
                time.sleep(0.1)
                continue
            
            try:
                if self.serial.in_waiting > 0:
                    data = self.serial.read(self.serial.in_waiting)
                    buffer += data.decode('utf-8', errors='ignore')
                    
                    # Process complete lines
                    while '\n' in buffer:
                        line, buffer = buffer.split('\n', 1)
                        line = line.strip()
                        if line:
                            self.handle_serial_line(line)
                else:
                    time.sleep(0.01)
            except Exception as e:
                self.get_logger().error(f'Serial read error: {e}')
                time.sleep(0.1)
    
    def handle_serial_line(self, line: str):
        """Handle incoming serial line"""
        self.get_logger().debug(f'RX: {line}')
        
        # Check for boot marker
        if line == BOOT_MARKER:
            self.get_logger().info('Boot marker received - firmware reset')
            self.is_ready = False
            self.handshake_complete = False
            # Restart handshake
            threading.Thread(target=self.perform_handshake, daemon=True).start()
            return
        
        # Check for ready marker
        if READY_MARKER in line:
            self.get_logger().info('Ready marker received')
            if not self.handshake_complete:
                threading.Thread(target=self.perform_handshake, daemon=True).start()
            return
        
        # Check for diagnostics response (N=120) - special format
        # Diagnostics comes in two lines:
        # 1. {owner,lpwm,rpwm,mstate,reset,hw:<hash>,imu:<0/1>,ram:<free>,min:<min>,batt:<mV>,b:<state>,cap:<max>,db:<L>/<R>,ramp:<a>/<d>,kick:<0/1>,init:<state>}
        # 2. {stats:rx=<rx>,jd=<jd>,pe=<pe>,tx=<tx>,ms=<ms>}
        if self.diagnostics_collecting:
            # Collecting diagnostics - add this line
            self.diagnostics_raw_response.append(line)
            # Check if we have both lines (stats line indicates completion)
            if 'stats:' in line:
                # Parse complete diagnostics
                full_response = '\n'.join(self.diagnostics_raw_response)
                self.parse_diagnostics_response(full_response)
                self.diagnostics_collecting = False
                if self.diagnostics_response_event:
                    self.diagnostics_response_event.set()
            elif len(self.diagnostics_raw_response) >= 2:
                # Got two lines, assume complete
                full_response = '\n'.join(self.diagnostics_raw_response)
                self.parse_diagnostics_response(full_response)
                self.diagnostics_collecting = False
                if self.diagnostics_response_event:
                    self.diagnostics_response_event.set()
            return
        elif line.startswith('{') and ',' in line:
            # Check if this looks like diagnostics first line
            # Diagnostics has: owner character, numbers, and hw: field
            if 'hw:' in line or (len(line) > 30 and any(c in line for c in ['I', 'D', 'M', 'X']) and ',' in line):
                # Start of diagnostics - first line
                self.diagnostics_collecting = True
                self.diagnostics_raw_response = [line]
                return
        
        # Parse token responses
        if self.is_token_response(line):
            parsed = self.parse_token_response(line)
            if parsed:
                tag, value = parsed
                self.handle_token_response(tag, value)
    
    def handle_token_response(self, tag: str, value: str):
        """Handle token response from firmware"""
        # Check if this is a pending command
        # Tag might be truncated by firmware, so check prefix
        for pending_tag, (cmd_type, callback, response_event) in list(self.pending_commands.items()):
            if tag.startswith(pending_tag[:4]) or pending_tag.startswith(tag[:4]):
                # Found matching command
                del self.pending_commands[pending_tag]
                
                if cmd_type == 'ultrasonic':
                    self.publish_ultrasonic(value)
                elif cmd_type == 'battery':
                    self.publish_battery(value)
                elif cmd_type.startswith('line_'):
                    sensor_name = cmd_type.split('_', 1)[1]
                    try:
                        self.latest_line_sensors[sensor_name] = int(value)
                    except ValueError:
                        pass
                elif callback:
                    # Service callback - set result
                    callback(value)
                
                # Signal waiting thread if event exists
                if response_event:
                    response_event.set()
                break
    
    def publish_ultrasonic(self, value_str: str):
        """Publish ultrasonic sensor reading"""
        try:
            distance_cm = float(value_str)
            self.latest_ultrasonic = distance_cm
            
            msg = Range()
            msg.header = Header()
            msg.header.stamp = self.get_clock().now().to_msg()
            msg.header.frame_id = 'ultrasonic'
            msg.radiation_type = Range.ULTRASOUND
            msg.field_of_view = 0.1  # ~15 degrees
            msg.min_range = 2.0  # 2cm minimum
            msg.max_range = 400.0  # 400cm maximum
            msg.range = distance_cm / 100.0  # Convert cm to meters
            
            self.ultrasonic_pub.publish(msg)
            self.get_logger().debug(f'Published ultrasonic: {distance_cm}cm')
        except ValueError:
            self.get_logger().warn(f'Invalid ultrasonic value: {value_str}')
    
    def publish_battery(self, value_str: str):
        """Publish battery status"""
        try:
            voltage_mv = int(value_str)
            voltage_v = voltage_mv / 1000.0
            self.latest_battery_voltage = voltage_v
            
            msg = BatteryStatus()
            msg.header = Header()
            msg.header.stamp = self.get_clock().now().to_msg()
            msg.header.frame_id = 'battery'
            msg.voltage_mv = voltage_mv
            msg.voltage_v = voltage_v
            
            # Determine status (simple thresholds)
            if voltage_v < 6.0:
                msg.status = BatteryStatus.BATTERY_CRITICAL
            elif voltage_v < 7.0:
                msg.status = BatteryStatus.BATTERY_LOW
            else:
                msg.status = BatteryStatus.BATTERY_NORMAL
            
            # Estimate percentage (rough: 7.4V = 100%, 6.0V = 0%)
            if voltage_v >= 7.4:
                msg.percentage = 100.0
            elif voltage_v <= 6.0:
                msg.percentage = 0.0
            else:
                msg.percentage = ((voltage_v - 6.0) / (7.4 - 6.0)) * 100.0
            
            msg.last_reading_time = msg.header.stamp
            
            self.battery_pub.publish(msg)
            self.get_logger().debug(f'Published battery: {voltage_mv}mV ({voltage_v:.2f}V)')
        except ValueError:
            self.get_logger().warn(f'Invalid battery value: {value_str}')
    
    def publish_robot_sensors(self):
        """Publish aggregated robot sensors message"""
        msg = RobotSensors()
        msg.header = Header()
        msg.header.stamp = self.get_clock().now().to_msg()
        msg.header.frame_id = 'base_link'
        
        msg.ultrasonic_distance_cm = self.latest_ultrasonic
        msg.line_left = self.latest_line_sensors['left'] > 512  # Threshold for line detection
        msg.line_middle = self.latest_line_sensors['middle'] > 512
        msg.line_right = self.latest_line_sensors['right'] > 512
        msg.imu_available = False  # TODO: Parse from diagnostics
        msg.servo_angle = -1.0  # TODO: Track servo position
        
        self.robot_sensors_pub.publish(msg)
    
    def parse_diagnostics_response(self, response: str):
        """Parse diagnostics response (N=120)"""
        # Format: Two lines:
        # 1. {owner,lpwm,rpwm,mstate,reset,hw:<hash>,imu:<0/1>,ram:<free>,min:<min>,
        #          batt:<mV>,b:<state>,cap:<max>,db:<L>/<R>,ramp:<a>/<d>,kick:<0/1>,init:<state>}
        # 2. {stats:rx=<rx>,jd=<jd>,pe=<pe>,tx=<tx>,ms=<ms>}
        try:
            # Split into lines if multi-line
            lines = response.strip().split('\n')
            main_line = lines[0] if lines else response
            stats_line = lines[1] if len(lines) > 1 else ""
            
            # Remove braces from main line
            content = main_line.strip('{}')
            parts = content.split(',')
            
            msg = RobotDiagnostics()
            msg.header = Header()
            msg.header.stamp = self.get_clock().now().to_msg()
            msg.header.frame_id = 'base_link'
            
            # Parse basic fields
            if len(parts) > 0:
                owner = parts[0] if parts[0] else '?'
            if len(parts) > 1:
                try:
                    msg.left_motor_pwm = float(parts[1])
                except ValueError:
                    pass
            if len(parts) > 2:
                try:
                    msg.right_motor_pwm = float(parts[2])
                except ValueError:
                    pass
            if len(parts) > 3:
                try:
                    motion_state = int(parts[3])
                    msg.motion_active = motion_state > 0
                except ValueError:
                    pass
            
            # Parse key-value pairs
            for part in parts[4:]:
                if ':' in part:
                    key, value = part.split(':', 1)
                    try:
                        if key == 'imu':
                            msg.imu_available = int(value) == 1
                        elif key == 'batt':
                            voltage_mv = int(value)
                            msg.ultrasonic_distance_cm = 0.0  # Not in diagnostics
                            # Battery info already published separately
                        elif key == 'b':
                            # Battery state
                            pass
                    except (ValueError, IndexError):
                        pass
            
            msg.serial_connected = self.is_ready
            
            # Parse stats line if available
            if stats_line:
                try:
                    stats_content = stats_line.strip('{}')
                    if 'stats:' in stats_content:
                        # Extract stats values
                        stats_parts = stats_content.replace('stats:', '').split(',')
                        for stat in stats_parts:
                            if '=' in stat:
                                key, val = stat.split('=', 1)
                                try:
                                    if key == 'rx':
                                        msg.error_count += int(val)  # RX overflow
                                    elif key == 'pe':
                                        msg.error_count += int(val)  # Parse errors
                                except ValueError:
                                    pass
                except Exception:
                    pass
            
            self.latest_diagnostics = msg
            self.robot_diagnostics_pub.publish(msg)
            self.get_logger().debug(f'Parsed diagnostics: owner={owner}, state={msg.motion_active}, PWM=({msg.left_motor_pwm}, {msg.right_motor_pwm})')
            
        except Exception as e:
            self.get_logger().warn(f'Failed to parse diagnostics: {e}')
            import traceback
            self.get_logger().debug(traceback.format_exc())
    
    def send_command_and_wait(self, cmd: Dict[str, Any], timeout: float = 2.0, max_retries: int = 1) -> Optional[str]:
        """Send command and wait for response with retry logic (industry standard)"""
        if not self.is_ready:
            return None
        
        base_tag = cmd.get('H', f'cmd{self.command_counter}')
        self.command_counter += 1
        
        for attempt in range(max_retries + 1):
            # Use unique tag for each attempt to avoid conflicts
            tag = f"{base_tag}_{attempt}" if attempt > 0 else base_tag
            
            response_event = threading.Event()
            response_value = [None]  # Use list to allow modification in nested function
            
            def callback(value: str):
                response_value[0] = value
            
            self.pending_commands[tag] = ('service', callback, response_event)
            
            if not self.send_command(cmd):
                # Remove from pending
                if tag in self.pending_commands:
                    del self.pending_commands[tag]
                return None
            
            if response_event.wait(timeout):
                result = response_value[0]
                # Remove from pending
                if tag in self.pending_commands:
                    del self.pending_commands[tag]
                return result
            else:
                # Timeout - remove from pending
                if tag in self.pending_commands:
                    del self.pending_commands[tag]
                
                # Retry with exponential backoff
                if attempt < max_retries:
                    import random
                    backoff = (2 ** attempt) * 0.1 + random.uniform(0, 0.05)
                    time.sleep(backoff)
                    self.get_logger().debug(f'Command {base_tag} timeout, retrying (attempt {attempt + 1}/{max_retries})')
                    continue
        
        # All retries failed
        self.get_logger().warn(f'Command {base_tag} failed after {max_retries + 1} attempts')
        return None
    
    # Service callbacks
    def emergency_stop_callback(self, request, response):
        """Emergency stop service callback - no retries for safety"""
        if not self.is_ready:
            response.success = False
            response.message = "Serial connection not ready"
            return response
        
        cmd = self.build_command(CMD_STOP, tag='estop')
        # Emergency stop: immediate, no retries (safety critical)
        result = self.send_command_and_wait(cmd, timeout=1.0, max_retries=0)
        
        if result and result.lower() == 'ok':
            response.success = True
            response.message = "Emergency stop executed"
            self.get_logger().info("Emergency stop executed successfully")
        else:
            response.success = False
            response.message = f"Emergency stop failed: {result}"
            self.get_logger().error(f"Emergency stop failed: {result}")
        
        return response
    
    def servo_control_callback(self, request, response):
        """Servo control service callback with retry"""
        if not self.is_ready:
            response.success = False
            response.message = "Serial connection not ready"
            return response
        
        angle = max(0, min(180, int(request.angle)))
        cmd = self.build_command(CMD_SERVO, tag='servo', d1=angle)
        result = self.send_command_and_wait(cmd, timeout=1.0, max_retries=1)
        
        if result and result.lower() == 'ok':
            response.success = True
            response.message = f"Servo set to {angle} degrees"
        else:
            response.success = False
            response.message = f"Servo control failed: {result}"
        
        return response
    
    def macro_execute_callback(self, request, response):
        """Macro execute service callback with retry"""
        if not self.is_ready:
            response.success = False
            response.message = "Serial connection not ready"
            return response
        
        macro_id = max(1, min(4, int(request.macro_id)))
        intensity = max(0, min(255, int(request.intensity)))
        ttl_ms = max(1000, min(10000, int(request.ttl_ms)))
        
        cmd = self.build_command(CMD_MACRO_EXECUTE, tag='macro', d1=macro_id, d2=intensity, ttl=ttl_ms)
        result = self.send_command_and_wait(cmd, timeout=2.0, max_retries=1)
        
        if result and (result.lower() == 'ok' or result.lower() == 'true'):
            response.success = True
            response.message = f"Macro {macro_id} started"
        else:
            response.success = False
            response.message = f"Macro execute failed: {result}"
        
        return response
    
    def macro_cancel_callback(self, request, response):
        """Macro cancel service callback with retry"""
        if not self.is_ready:
            response.success = False
            response.message = "Serial connection not ready"
            return response
        
        cmd = self.build_command(CMD_MACRO_CANCEL, tag='cancel')
        result = self.send_command_and_wait(cmd, timeout=1.0, max_retries=1)
        
        if result and result.lower() == 'ok':
            response.success = True
            response.message = "Macro cancelled"
        else:
            response.success = False
            response.message = f"Macro cancel failed: {result}"
        
        return response
    
    def get_diagnostics_callback(self, request, response):
        """Get diagnostics service callback with retry logic"""
        if not self.is_ready:
            response.success = False
            response.raw_response = ""
            response.diagnostics = RobotDiagnostics()
            return response
        
        cmd = self.build_command(CMD_DIAGNOSTICS, tag='diag')
        
        # Retry logic with exponential backoff (industry standard)
        max_retries = 2
        base_timeout = 3.0
        
        for attempt in range(max_retries + 1):
            # Set up event to wait for diagnostics response
            self.diagnostics_response_event = threading.Event()
            self.diagnostics_raw_response = []
            self.diagnostics_collecting = False
            
            if self.send_command(cmd):
                # Wait for diagnostics response (handled by serial reader thread)
                timeout = base_timeout + (attempt * 0.5)  # Slightly longer timeout on retry
                if self.diagnostics_response_event.wait(timeout=timeout):
                    if self.diagnostics_raw_response:
                        raw_response = '\n'.join(self.diagnostics_raw_response)
                        response.success = True
                        response.raw_response = raw_response
                        # Diagnostics message already parsed by parse_diagnostics_response
                        if self.latest_diagnostics:
                            response.diagnostics = self.latest_diagnostics
                        else:
                            response.diagnostics = RobotDiagnostics()
                        # Clean up
                        self.diagnostics_response_event = None
                        self.diagnostics_raw_response = []
                        self.diagnostics_collecting = False
                        return response
                
                # If we get here, timeout occurred
                if attempt < max_retries:
                    # Exponential backoff with jitter
                    import random
                    backoff = (2 ** attempt) * 0.1 + random.uniform(0, 0.1)
                    time.sleep(backoff)
                    self.get_logger().debug(f'Diagnostics timeout, retrying (attempt {attempt + 1}/{max_retries})')
                    continue
        
        # All retries failed - return cached data if available
        response.success = False
        response.raw_response = ""
        if self.latest_diagnostics:
            response.diagnostics = self.latest_diagnostics
            response.success = True  # We have cached diagnostics
            response.raw_response = "Cached (request timeout)"
        else:
            response.diagnostics = RobotDiagnostics()
        
        # Clean up
        self.diagnostics_response_event = None
        self.diagnostics_raw_response = []
        self.diagnostics_collecting = False
        
        return response
    
    def direct_motor_callback(self, request, response):
        """Direct motor control service callback with retry"""
        if not self.is_ready:
            response.success = False
            response.message = "Serial connection not ready"
            return response
        
        left_pwm = max(-255, min(255, int(request.left_pwm)))
        right_pwm = max(-255, min(255, int(request.right_pwm)))
        
        cmd = self.build_command(CMD_DIRECT_MOTOR, tag='direct', d1=left_pwm, d2=right_pwm)
        result = self.send_command_and_wait(cmd, timeout=1.0, max_retries=1)
        
        if result and result.lower() == 'ok':
            response.success = True
            response.message = f"Direct motor control: L={left_pwm}, R={right_pwm}"
        else:
            response.success = False
            response.message = f"Direct motor control failed: {result}"
        
        return response
    
    def rerun_init_callback(self, request, response):
        """Re-run init sequence service callback with retry"""
        if not self.is_ready:
            response.success = False
            response.message = "Serial connection not ready"
            return response
        
        cmd = self.build_command(CMD_RERUN_INIT, tag='init')
        result = self.send_command_and_wait(cmd, timeout=2.0, max_retries=1)
        
        if result and result.lower() == 'ok':
            response.success = True
            response.message = "Init sequence re-run requested"
        else:
            response.success = False
            response.message = f"Re-run init failed: {result}"
        
        return response
    
    def set_drive_config_callback(self, request, response):
        """Set drive configuration service callback with retry"""
        if not self.is_ready:
            response.success = False
            response.message = "Serial connection not ready"
            return response
        
        parameter = max(1, min(5, int(request.parameter)))
        value = int(request.value)
        
        cmd = self.build_command(CMD_SET_DRIVE_CONFIG, tag='config', d1=parameter, d2=value)
        result = self.send_command_and_wait(cmd, timeout=1.0, max_retries=1)
        
        if result and result.lower() == 'ok':
            response.success = True
            response.message = f"Drive config parameter {parameter} set to {value}"
        else:
            response.success = False
            response.message = f"Set drive config failed: {result}"
        
        return response
    
    def destroy_node(self):
        """Cleanup on shutdown"""
        # Stop reader thread
        self._reader_running = False
        
        # Send stop command
        if self.is_ready and self.serial and self.serial.is_open:
            stop_cmd = self.build_command(CMD_STOP, tag='stop')
            self.send_command(stop_cmd)
            time.sleep(0.1)
        
        # Close serial
        if self.serial and self.serial.is_open:
            self.serial.close()
        
        super().destroy_node()


def main(args=None):
    rclpy.init(args=args)
    node = SerialBridgeNode()
    
    try:
        rclpy.spin(node)
    except KeyboardInterrupt:
        pass
    finally:
        node.destroy_node()
        rclpy.shutdown()


if __name__ == '__main__':
    main()
