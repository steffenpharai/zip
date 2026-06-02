#!/usr/bin/env python3
"""
ZIP Robot MCP Server

Model Context Protocol (MCP) server that exposes ROS 2 services as MCP tools.
Uses FastMCP (official Python SDK) following industry standards.

This server bridges LangGraph/LangChain agents with ROS 2 robotics services.
"""

import rclpy
from rclpy.node import Node
from rclpy.executors import MultiThreadedExecutor
import asyncio
import json
from typing import Any, Dict, Optional
import logging

# MCP SDK imports
try:
    from mcp.server.fastmcp import FastMCP
    from mcp.types import Tool, TextContent
except ImportError:
    raise ImportError(
        "FastMCP not installed. Install with: pip install mcp fastmcp"
    )

# ROS 2 message imports
from geometry_msgs.msg import Twist
from std_msgs.msg import String, Empty
from zip_core.msg import RobotSensors, RobotDiagnostics, BatteryStatus
from zip_core.srv import (
    EmergencyStop,
    ServoControl,
    MacroExecute,
    MacroCancel,
    DirectMotorControl,
    ReRunInit,
    SetDriveConfig,
    GetDiagnostics,
)

# Vision imports (if available)
try:
    from vision_msgs.msg import Detection2DArray
    from sensor_msgs.msg import Image
except ImportError:
    Detection2DArray = None
    Image = None

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class ZIPMCPNode(Node):
    """ROS 2 node that integrates with MCP server"""
    
    def __init__(self):
        super().__init__('zip_mcp_server')
        
        # Publishers for robot control
        self.cmd_vel_pub = self.create_publisher(
            Twist, '/cmd_vel', 10
        )
        
        # Service clients (service names match serial_bridge_node)
        self.emergency_stop_client = self.create_client(
            EmergencyStop, '/emergency_stop'
        )
        self.servo_control_client = self.create_client(
            ServoControl, '/servo_control'
        )
        self.macro_execute_client = self.create_client(
            MacroExecute, '/macro_execute'
        )
        self.macro_cancel_client = self.create_client(
            MacroCancel, '/macro_cancel'
        )
        self.direct_motor_client = self.create_client(
            DirectMotorControl, '/direct_motor_control'
        )
        self.rerun_init_client = self.create_client(
            ReRunInit, '/rerun_init'
        )
        self.set_drive_config_client = self.create_client(
            SetDriveConfig, '/set_drive_config'
        )
        self.get_diagnostics_client = self.create_client(
            GetDiagnostics, '/get_diagnostics'
        )
        
        # Subscribers for sensor data
        self.sensors_sub = self.create_subscription(
            RobotSensors, '/robot/sensors', self._sensors_callback, 10
        )
        self.diagnostics_sub = self.create_subscription(
            RobotDiagnostics, '/robot/diagnostics', self._diagnostics_callback, 10
        )
        self.battery_sub = self.create_subscription(
            BatteryStatus, '/robot/battery', self._battery_callback, 10
        )
        
        # Vision subscribers (if available)
        if Detection2DArray:
            self.detections_sub = self.create_subscription(
                Detection2DArray, '/detections', self._detections_callback, 10
            )
        
        # State storage
        self.latest_sensors: Optional[RobotSensors] = None
        self.latest_diagnostics: Optional[RobotDiagnostics] = None
        self.latest_battery: Optional[BatteryStatus] = None
        self.latest_detections: Optional[Detection2DArray] = None
        
        logger.info("ZIP MCP Node initialized")
    
    def _sensors_callback(self, msg: RobotSensors):
        """Store latest sensor data"""
        self.latest_sensors = msg
    
    def _diagnostics_callback(self, msg: RobotDiagnostics):
        """Store latest diagnostics"""
        self.latest_diagnostics = msg
    
    def _battery_callback(self, msg: BatteryStatus):
        """Store latest battery status"""
        self.latest_battery = msg
    
    def _detections_callback(self, msg: Detection2DArray):
        """Store latest vision detections"""
        self.latest_detections = msg


# Global ROS 2 node instance
ros_node: Optional[ZIPMCPNode] = None

# Create MCP server instance
mcp = FastMCP(
    name="ZIP Robot MCP Server",
)


def get_ros_node() -> ZIPMCPNode:
    """Get or create ROS 2 node instance"""
    global ros_node
    if ros_node is None:
        if not rclpy.ok():
            rclpy.init()
        ros_node = ZIPMCPNode()
    return ros_node


# ============================================================================
# Robot Control Tools
# ============================================================================

@mcp.tool()
def robot_move(linear_x: float, angular_z: float) -> str:
    """
    Move the robot with specified linear and angular velocities.
    
    Args:
        linear_x: Linear velocity in m/s (forward/backward, typically -1.0 to 1.0)
        angular_z: Angular velocity in rad/s (rotation, typically -1.0 to 1.0)
    
    Returns:
        Success message with velocities used
    """
    node = get_ros_node()
    
    twist = Twist()
    twist.linear.x = float(linear_x)
    twist.angular.z = float(angular_z)
    
    node.cmd_vel_pub.publish(twist)
    
    return json.dumps({
        "success": True,
        "linear_x": linear_x,
        "angular_z": angular_z,
        "message": f"Robot moving: linear={linear_x:.2f} m/s, angular={angular_z:.2f} rad/s"
    })


@mcp.tool()
def robot_stop() -> str:
    """
    Immediately stop all robot motion (emergency stop).
    
    Returns:
        Success message
    """
    node = get_ros_node()
    
    # Publish zero velocity
    twist = Twist()
    twist.linear.x = 0.0
    twist.angular.z = 0.0
    node.cmd_vel_pub.publish(twist)
    
    # Also call emergency stop service if available
    if node.emergency_stop_client.wait_for_service(timeout_sec=1.0):
        request = EmergencyStop.Request()
        future = node.emergency_stop_client.call_async(request)
        rclpy.spin_once(node, timeout_sec=0.5)
    
    return json.dumps({
        "success": True,
        "message": "Robot stopped"
    })


@mcp.tool()
def robot_servo_control(angle: int) -> str:
    """
    Control the pan servo angle (0-180 degrees).
    
    Args:
        angle: Servo angle in degrees (0-180)
    
    Returns:
        Success message with angle set
    """
    node = get_ros_node()
    
    if not node.servo_control_client.wait_for_service(timeout_sec=2.0):
        return json.dumps({
            "success": False,
            "error": "Servo control service not available"
        })
    
    request = ServoControl.Request()
    request.angle = max(0, min(180, int(angle)))
    
    future = node.servo_control_client.call_async(request)
    rclpy.spin_once(node, timeout_sec=2.0)
    
    if future.done():
        response = future.result()
        return json.dumps({
            "success": response.success,
            "angle": request.angle,
            "message": response.message
        })
    
    return json.dumps({
        "success": False,
        "error": "Service call timeout"
    })


@mcp.tool()
def robot_macro_execute(macro_id: int, intensity: int = 128, ttl_ms: int = 5000) -> str:
    """
    Execute a predefined motion macro.
    
    Args:
        macro_id: Macro ID (1=FIGURE_8, 2=SPIN_360, 3=WIGGLE, 4=FORWARD_THEN_STOP)
        intensity: Intensity 0-255 (default: 128)
        ttl_ms: Time-to-live in milliseconds 1000-10000 (default: 5000)
    
    Returns:
        Success message with macro details
    """
    node = get_ros_node()
    
    if not node.macro_execute_client.wait_for_service(timeout_sec=2.0):
        return json.dumps({
            "success": False,
            "error": "Macro execute service not available"
        })
    
    request = MacroExecute.Request()
    request.macro_id = max(1, min(4, int(macro_id)))
    request.intensity = max(0, min(255, int(intensity)))
    request.ttl_ms = max(1000, min(10000, int(ttl_ms)))
    
    future = node.macro_execute_client.call_async(request)
    rclpy.spin_once(node, timeout_sec=2.0)
    
    if future.done():
        response = future.result()
        macro_names = {1: "FIGURE_8", 2: "SPIN_360", 3: "WIGGLE", 4: "FORWARD_THEN_STOP"}
        return json.dumps({
            "success": response.success,
            "macro_id": request.macro_id,
            "macro_name": macro_names.get(request.macro_id, "UNKNOWN"),
            "intensity": request.intensity,
            "ttl_ms": request.ttl_ms,
            "message": response.message
        })
    
    return json.dumps({
        "success": False,
        "error": "Service call timeout"
    })


@mcp.tool()
def robot_macro_cancel() -> str:
    """
    Cancel any active motion macro.
    
    Returns:
        Success message
    """
    node = get_ros_node()
    
    if not node.macro_cancel_client.wait_for_service(timeout_sec=2.0):
        return json.dumps({
            "success": False,
            "error": "Macro cancel service not available"
        })
    
    request = MacroCancel.Request()
    future = node.macro_cancel_client.call_async(request)
    rclpy.spin_once(node, timeout_sec=2.0)
    
    if future.done():
        response = future.result()
        return json.dumps({
            "success": response.success,
            "message": response.message
        })
    
    return json.dumps({
        "success": False,
        "error": "Service call timeout"
    })


@mcp.tool()
def robot_direct_motor_control(left_pwm: int, right_pwm: int) -> str:
    """
    Direct PWM control of motors (bypasses motion controller).
    WARNING: This bypasses safety layers. Use with caution.
    
    Args:
        left_pwm: Left motor PWM (-255 to 255)
        right_pwm: Right motor PWM (-255 to 255)
    
    Returns:
        Success message with PWM values
    """
    node = get_ros_node()
    
    if not node.direct_motor_client.wait_for_service(timeout_sec=2.0):
        return json.dumps({
            "success": False,
            "error": "Direct motor control service not available"
        })
    
    request = DirectMotorControl.Request()
    request.left_pwm = max(-255, min(255, int(left_pwm)))
    request.right_pwm = max(-255, min(255, int(right_pwm)))
    
    future = node.direct_motor_client.call_async(request)
    rclpy.spin_once(node, timeout_sec=2.0)
    
    if future.done():
        response = future.result()
        return json.dumps({
            "success": response.success,
            "left_pwm": request.left_pwm,
            "right_pwm": request.right_pwm,
            "message": response.message
        })
    
    return json.dumps({
        "success": False,
        "error": "Service call timeout"
    })


@mcp.tool()
def robot_rerun_init() -> str:
    """
    Re-run the robot initialization sequence.
    
    Returns:
        Success message
    """
    node = get_ros_node()
    
    if not node.rerun_init_client.wait_for_service(timeout_sec=2.0):
        return json.dumps({
            "success": False,
            "error": "Re-run init service not available"
        })
    
    request = ReRunInit.Request()
    future = node.rerun_init_client.call_async(request)
    rclpy.spin_once(node, timeout_sec=3.0)  # Init may take longer
    
    if future.done():
        response = future.result()
        return json.dumps({
            "success": response.success,
            "message": response.message
        })
    
    return json.dumps({
        "success": False,
        "error": "Service call timeout"
    })


@mcp.tool()
def robot_set_drive_config(parameter: int, value: int) -> str:
    """
    Configure drive safety parameters.
    
    Args:
        parameter: Parameter ID (1=deadband, 2=accel_step, 3=decel_step, 4=kick_enable, 5=max_pwm_cap)
        value: Parameter value (see firmware docs for encoding)
    
    Returns:
        Success message with parameter details
    """
    node = get_ros_node()
    
    if not node.set_drive_config_client.wait_for_service(timeout_sec=2.0):
        return json.dumps({
            "success": False,
            "error": "Set drive config service not available"
        })
    
    request = SetDriveConfig.Request()
    request.parameter = max(1, min(5, int(parameter)))
    request.value = max(0, min(65535, int(value)))  # uint16 max
    
    future = node.set_drive_config_client.call_async(request)
    rclpy.spin_once(node, timeout_sec=2.0)
    
    if future.done():
        response = future.result()
        param_names = {
            1: "deadband",
            2: "accel_step",
            3: "decel_step",
            4: "kick_enable",
            5: "max_pwm_cap"
        }
        return json.dumps({
            "success": response.success,
            "parameter": request.parameter,
            "parameter_name": param_names.get(request.parameter, "UNKNOWN"),
            "value": request.value,
            "message": response.message
        })
    
    return json.dumps({
        "success": False,
        "error": "Service call timeout"
    })


# ============================================================================
# Sensor & Status Tools
# ============================================================================

@mcp.tool()
def get_robot_sensors() -> str:
    """
    Get current robot sensor readings (ultrasonic, line sensors, IMU, battery).
    
    Returns:
        JSON string with sensor data
    """
    node = get_ros_node()
    
    # Spin once to get latest data
    rclpy.spin_once(node, timeout_sec=0.1)
    
    sensors = node.latest_sensors
    battery = node.latest_battery
    
    if sensors is None:
        return json.dumps({
            "success": False,
            "error": "No sensor data available"
        })
    
    result = {
        "success": True,
        "ultrasonic": {
            "distance_cm": float(sensors.ultrasonic_distance) if hasattr(sensors, 'ultrasonic_distance') else None,
        },
        "line_sensors": {
            "left": int(sensors.line_left) if hasattr(sensors, 'line_left') else None,
            "middle": int(sensors.line_middle) if hasattr(sensors, 'line_middle') else None,
            "right": int(sensors.line_right) if hasattr(sensors, 'line_right') else None,
        },
    }
    
    if battery:
        result["battery"] = {
            "voltage_mv": float(battery.voltage_mv) if hasattr(battery, 'voltage_mv') else None,
            "percentage": float(battery.percentage) if hasattr(battery, 'percentage') else None,
            "status": battery.status if hasattr(battery, 'status') else None,
        }
    
    if hasattr(sensors, 'imu') and sensors.imu:
        result["imu"] = {
            "orientation": {
                "x": float(sensors.imu.orientation.x),
                "y": float(sensors.imu.orientation.y),
                "z": float(sensors.imu.orientation.z),
                "w": float(sensors.imu.orientation.w),
            } if hasattr(sensors.imu, 'orientation') else None,
        }
    
    return json.dumps(result)


@mcp.tool()
def get_robot_diagnostics() -> str:
    """
    Get comprehensive robot diagnostics including motion state, sensor readings, and system health.
    Uses the /get_diagnostics service for real-time data.
    
    Returns:
        JSON string with diagnostics data
    """
    node = get_ros_node()
    
    # Try service call first (more reliable)
    if node.get_diagnostics_client.wait_for_service(timeout_sec=2.0):
        request = GetDiagnostics.Request()
        future = node.get_diagnostics_client.call_async(request)
        rclpy.spin_once(node, timeout_sec=3.0)  # Diagnostics may take longer
        
        if future.done():
            response = future.result()
            if response.success:
                # Parse diagnostics from response message
                # Response format: {owner}{L},{R},{stby},{state},{resets} {stats:...}
                return json.dumps({
                    "success": True,
                    "message": response.message,
                    "raw_diagnostics": response.message
                })
    
    # Fallback to subscribed data
    rclpy.spin_once(node, timeout_sec=0.1)
    diagnostics = node.latest_diagnostics
    
    if diagnostics is None:
        return json.dumps({
            "success": False,
            "error": "No diagnostics data available"
        })
    
    result = {
        "success": True,
        "motion": {
            "linear_velocity": float(diagnostics.linear_velocity) if hasattr(diagnostics, 'linear_velocity') else None,
            "angular_velocity": float(diagnostics.angular_velocity) if hasattr(diagnostics, 'angular_velocity') else None,
        },
        "sensors": {
            "ultrasonic_cm": float(diagnostics.ultrasonic_cm) if hasattr(diagnostics, 'ultrasonic_cm') else None,
        },
        "system": {
            "connection_status": diagnostics.connection_status if hasattr(diagnostics, 'connection_status') else None,
            "error_count": int(diagnostics.error_count) if hasattr(diagnostics, 'error_count') else None,
        },
    }
    
    return json.dumps(result)


@mcp.tool()
def get_robot_status() -> str:
    """
    Get robot connection status and basic state information.
    
    Returns:
        JSON string with status
    """
    node = get_ros_node()
    
    # Spin once to check services
    rclpy.spin_once(node, timeout_sec=0.1)
    
    # Check if services are available
    emergency_available = node.emergency_stop_client.wait_for_service(timeout_sec=0.5)
    
    return json.dumps({
        "success": True,
        "connected": emergency_available,
        "services_available": {
            "emergency_stop": emergency_available,
        },
        "topics_publishing": {
            "cmd_vel": node.cmd_vel_pub.get_subscription_count() > 0 or True,  # Publisher always available
        }
    })


# ============================================================================
# Vision Tools
# ============================================================================

@mcp.tool()
def get_vision_detections() -> str:
    """
    Get latest object detections from the vision system (YOLOE).
    
    Returns:
        JSON string with detection data
    """
    node = get_ros_node()
    
    if Detection2DArray is None:
        return json.dumps({
            "success": False,
            "error": "Vision messages not available"
        })
    
    # Spin once to get latest data
    rclpy.spin_once(node, timeout_sec=0.1)
    
    detections = node.latest_detections
    
    if detections is None:
        return json.dumps({
            "success": False,
            "error": "No detection data available"
        })
    
    # Extract detection information
    detection_list = []
    for detection in detections.detections:
        detection_list.append({
            "class_id": int(detection.id) if hasattr(detection, 'id') else None,
            "confidence": float(detection.score) if hasattr(detection, 'score') else None,
            "bbox": {
                "center": {
                    "x": float(detection.bbox.center.position.x) if hasattr(detection.bbox, 'center') else None,
                    "y": float(detection.bbox.center.position.y) if hasattr(detection.bbox, 'center') else None,
                },
                "size_x": float(detection.bbox.size_x) if hasattr(detection.bbox, 'size_x') else None,
                "size_y": float(detection.bbox.size_y) if hasattr(detection.bbox, 'size_y') else None,
            } if hasattr(detection, 'bbox') else None,
        })
    
    return json.dumps({
        "success": True,
        "detections": detection_list,
        "count": len(detection_list),
    })


# ============================================================================
# Resources (read-only data)
# ============================================================================

@mcp.resource("ros2://topics")
def list_ros_topics() -> str:
    """
    List all available ROS 2 topics.
    
    Returns:
        JSON string with topic list
    """
    node = get_ros_node()
    
    topics = node.get_topic_names_and_types()
    
    topic_list = []
    for topic_name, topic_types in topics:
        topic_list.append({
            "name": topic_name,
            "types": list(topic_types),
        })
    
    return json.dumps({
        "topics": topic_list,
        "count": len(topic_list),
    })


# ============================================================================
# Main Entry Point
# ============================================================================

async def run_mcp_server():
    """Run MCP server with ROS 2 integration"""
    global ros_node
    
    # Initialize ROS 2
    if not rclpy.ok():
        rclpy.init()
    
    # Create ROS 2 node
    ros_node = ZIPMCPNode()
    
    # Create executor for ROS 2
    executor = MultiThreadedExecutor()
    executor.add_node(ros_node)
    
    # Run ROS 2 spinning in background
    async def spin_ros():
        while rclpy.ok():
            executor.spin_once(timeout_sec=0.1)
            await asyncio.sleep(0.1)
    
    # Start ROS 2 spinning task
    spin_task = asyncio.create_task(spin_ros())
    
    try:
        # Run MCP server (STDIO transport for now)
        logger.info("Starting ZIP Robot MCP Server...")
        await mcp.run(transport="stdio")
    except KeyboardInterrupt:
        logger.info("Shutting down...")
    finally:
        spin_task.cancel()
        ros_node.destroy_node()
        rclpy.shutdown()


def main():
    """Main entry point"""
    try:
        asyncio.run(run_mcp_server())
    except KeyboardInterrupt:
        logger.info("MCP server stopped")


if __name__ == "__main__":
    main()
