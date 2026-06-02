from launch import LaunchDescription
from launch.actions import DeclareLaunchArgument, LogInfo
from launch.substitutions import LaunchConfiguration
from launch_ros.actions import Node


def generate_launch_description():
    """Launch serial bridge node"""
    
    # Launch arguments
    serial_port_arg = DeclareLaunchArgument(
        'serial_port',
        default_value='',
        description='Serial port path (empty for auto-detect)'
    )
    
    baud_rate_arg = DeclareLaunchArgument(
        'baud_rate',
        default_value='115200',
        description='Serial baud rate'
    )
    
    auto_detect_arg = DeclareLaunchArgument(
        'auto_detect_port',
        default_value='true',
        description='Auto-detect serial port if not specified'
    )
    
    setpoint_ttl_arg = DeclareLaunchArgument(
        'setpoint_ttl_ms',
        default_value='200',
        description='Setpoint command TTL in milliseconds'
    )
    
    setpoint_rate_arg = DeclareLaunchArgument(
        'setpoint_max_rate_hz',
        default_value='30.0',
        description='Maximum setpoint command rate (Hz)'
    )
    
    sensor_rate_arg = DeclareLaunchArgument(
        'sensor_poll_rate_hz',
        default_value='5.0',
        description='Sensor polling rate (Hz)'
    )
    
    # Serial bridge node
    serial_bridge_node = Node(
        package='zip_control',
        executable='serial_bridge_node',
        name='serial_bridge_node',
        output='screen',
        parameters=[{
            'serial_port': LaunchConfiguration('serial_port'),
            'baud_rate': LaunchConfiguration('baud_rate'),
            'auto_detect_port': LaunchConfiguration('auto_detect_port'),
            'setpoint_ttl_ms': LaunchConfiguration('setpoint_ttl_ms'),
            'setpoint_max_rate_hz': LaunchConfiguration('setpoint_max_rate_hz'),
            'sensor_poll_rate_hz': LaunchConfiguration('sensor_poll_rate_hz'),
        }],
        remappings=[
            # Default remappings if needed
        ]
    )
    
    return LaunchDescription([
        serial_port_arg,
        baud_rate_arg,
        auto_detect_arg,
        setpoint_ttl_arg,
        setpoint_rate_arg,
        sensor_rate_arg,
        LogInfo(msg='Starting ZIP Robot Serial Bridge...'),
        serial_bridge_node,
    ])
