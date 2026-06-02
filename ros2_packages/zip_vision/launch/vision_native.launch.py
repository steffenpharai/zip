"""
Native Vision Pipeline Launch File

Launches the complete vision pipeline for native (non-Docker) execution:
- Camera node (v4l2_camera)
- YOLOE-11 Prompt-Free detection node (Python)
- FastAPI diagnostics bridge (optional)

Usage:
    ros2 launch zip_vision vision_native.launch.py
    ros2 launch zip_vision vision_native.launch.py enable_diagnostics_bridge:=false
    ros2 launch zip_vision vision_native.launch.py yoloe_model_path:=/path/to/model.engine
"""

from launch import LaunchDescription
from launch.actions import DeclareLaunchArgument, IncludeLaunchDescription
from launch.conditions import IfCondition
from launch.substitutions import LaunchConfiguration, PathJoinSubstitution
from launch_ros.actions import Node
from launch_ros.substitutions import FindPackageShare
from launch.launch_description_sources import PythonLaunchDescriptionSource
import os


def generate_launch_description():
    # Get package share directory
    zip_vision_share = FindPackageShare(package='zip_vision').find('zip_vision')
    
    # Default model path (adjust for your installation)
    # Use existing YOLOE-v8L model or fallback to yoloe-11l
    # Use the newly exported engine with full vocabulary (4585 classes)
    default_model_path = os.path.expanduser('~/ros2_ws/src/zip_vision/models/yoloe/yoloe-11l-seg-pf_640_fp16.engine')
    if not os.path.exists(default_model_path):
        # Fallback to old engine if new one doesn't exist
        default_model_path = os.path.expanduser('~/ros2_ws/src/zip_vision/models/yoloe/yoloe-v8l-seg-pf_640_fp16.engine')
    
    # Launch arguments
    device_id_arg = DeclareLaunchArgument(
        'device_id',
        default_value='0',
        description='USB camera device ID (e.g., 0 for /dev/video0)'
    )
    
    yoloe_model_path_arg = DeclareLaunchArgument(
        'yoloe_model_path',
        default_value=default_model_path,
        description='Path to YOLOE TensorRT engine (.engine) or PyTorch weights (.pt)'
    )
    
    enable_yoloe_arg = DeclareLaunchArgument(
        'enable_yoloe',
        default_value='true',
        description='Enable YOLOE detection node'
    )
    
    enable_diagnostics_bridge_arg = DeclareLaunchArgument(
        'enable_diagnostics_bridge',
        default_value='true',
        description='Enable FastAPI diagnostics bridge (HTTP server on port 8767)'
    )
    
    yoloe_confidence_threshold_arg = DeclareLaunchArgument(
        'yoloe_confidence_threshold',
        default_value='0.2',
        description='YOLOE confidence threshold (0.0 to 1.0). Lower for household rare items.'
    )
    
    yoloe_nms_threshold_arg = DeclareLaunchArgument(
        'yoloe_nms_threshold',
        default_value='0.45',
        description='YOLOE NMS threshold (0.0 to 1.0). Higher values = more aggressive suppression.'
    )
    
    yoloe_imgsz_arg = DeclareLaunchArgument(
        'yoloe_imgsz',
        default_value='640',
        description='YOLOE input image size (640 matches TensorRT engine)'
    )
    
    diagnostics_port_arg = DeclareLaunchArgument(
        'diagnostics_port',
        default_value='8767',
        description='FastAPI diagnostics bridge HTTP port'
    )
    
    diagnostics_host_arg = DeclareLaunchArgument(
        'diagnostics_host',
        default_value='0.0.0.0',
        description='FastAPI diagnostics bridge host (0.0.0.0 for all interfaces)'
    )
    
    # Include camera launch
    camera_launch = IncludeLaunchDescription(
        PythonLaunchDescriptionSource([
            PathJoinSubstitution([
                zip_vision_share,
                'launch',
                'camera.launch.py'
            ])
        ]),
        launch_arguments={
            'device_id': LaunchConfiguration('device_id'),
        }.items()
    )
    
    # YOLOE-11 Prompt-Free node (Python, using Ultralytics API)
    yoloe_node = Node(
        package='zip_vision',
        executable='yoloe_ros_node.py',
        name='yoloe_node',
        condition=IfCondition(LaunchConfiguration('enable_yoloe')),
        parameters=[
            PathJoinSubstitution([
                zip_vision_share,
                'config',
                'yoloe_params.yaml'
            ]),
            {
                'model_path': LaunchConfiguration('yoloe_model_path'),
                'conf': LaunchConfiguration('yoloe_confidence_threshold'),
                'iou': LaunchConfiguration('yoloe_nms_threshold'),
                'imgsz': LaunchConfiguration('yoloe_imgsz'),
            }
        ],
        output='screen'
    )
    
    # FastAPI diagnostics bridge (Python HTTP server for frontend integration)
    # Note: Uses executable arguments instead of ROS parameters to avoid ROS 2 argument parsing issues
    diagnostics_bridge_node = Node(
        package='zip_vision',
        executable='vision_diagnostics_bridge.py',
        name='vision_diagnostics_bridge',
        condition=IfCondition(LaunchConfiguration('enable_diagnostics_bridge')),
        arguments=[
            '--port', LaunchConfiguration('diagnostics_port'),
            '--host', LaunchConfiguration('diagnostics_host'),
        ],
        output='screen'
    )
    
    return LaunchDescription([
        device_id_arg,
        yoloe_model_path_arg,
        enable_yoloe_arg,
        enable_diagnostics_bridge_arg,
        yoloe_confidence_threshold_arg,
        yoloe_nms_threshold_arg,
        yoloe_imgsz_arg,
        diagnostics_port_arg,
        diagnostics_host_arg,
        camera_launch,
        yoloe_node,
        diagnostics_bridge_node,
    ])
