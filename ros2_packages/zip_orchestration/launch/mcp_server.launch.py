#!/usr/bin/env python3
"""
Launch file for ZIP Robot MCP Server

Launches the MCP HTTP server for ROS 2 tool execution.
"""

from launch import LaunchDescription
from launch.actions import ExecuteProcess
from launch_ros.actions import Node


def generate_launch_description():
    """Generate launch description for MCP server"""
    
    # MCP HTTP Server
    mcp_server = ExecuteProcess(
        cmd=['python3', '-m', 'zip_orchestration.mcp_http_server'],
        output='screen',
        name='zip_mcp_server',
    )
    
    return LaunchDescription([
        mcp_server,
    ])
