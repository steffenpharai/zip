#!/usr/bin/env python3
"""
Launch file for Vision Diagnostics HTTP Bridge

Starts the Python HTTP bridge server that connects ROS 2 vision topics
to the Next.js frontend diagnostics page.

Usage:
    ros2 launch zip_vision vision_diagnostics_bridge.launch.py [port:=8767] [host:=localhost]
"""

from launch import LaunchDescription
from launch.actions import DeclareLaunchArgument, ExecuteProcess, OpaqueFunction
from launch.substitutions import LaunchConfiguration, PathJoinSubstitution
from launch_ros.substitutions import FindPackageShare


def generate_launch_description():
    # Get package share directory
    zip_vision_share = FindPackageShare('zip_vision')
    
    # Declare launch arguments
    port_arg = DeclareLaunchArgument(
        'port',
        default_value='8767',
        description='HTTP server port'
    )
    
    host_arg = DeclareLaunchArgument(
        'host',
        default_value='localhost',
        description='HTTP server host'
    )
    
    # Bridge node executable
    # Use the installed script path (lib/zip_vision/vision_diagnostics_bridge.py)
    # For development, can also use source path directly
    bridge_script = PathJoinSubstitution([
        FindPackageShare('zip_vision'),
        '..',
        '..',
        'lib',
        'zip_vision',
        'vision_diagnostics_bridge.py'
    ])
    
    # Function to create bridge node with resolved substitutions
    def create_bridge_node(context):
        port = context.launch_configurations.get('port', '8767')
        host = context.launch_configurations.get('host', 'localhost')
        script_path = str(bridge_script.perform(context))
        
        return ExecuteProcess(
            cmd=['python3', script_path, '--port', str(port), '--host', str(host)],
            output='screen',
            name='vision_diagnostics_bridge',
            shell=False,
            # Environment is inherited from ros2 launch (already has setup.bash sourced)
        )
    
    bridge_node_action = OpaqueFunction(function=create_bridge_node)
    
    return LaunchDescription([
        port_arg,
        host_arg,
        bridge_node_action,
    ])
