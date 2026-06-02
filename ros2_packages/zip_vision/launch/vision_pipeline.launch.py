from launch import LaunchDescription
from launch.actions import DeclareLaunchArgument, IncludeLaunchDescription
from launch.conditions import IfCondition
from launch.substitutions import LaunchConfiguration, PathJoinSubstitution
from launch_ros.actions import Node
from launch_ros.substitutions import FindPackageShare
from launch.launch_description_sources import PythonLaunchDescriptionSource


def generate_launch_description():
    # Get package share directory
    zip_vision_share = FindPackageShare(package='zip_vision').find('zip_vision')
    
    # Launch arguments
    device_id_arg = DeclareLaunchArgument(
        'device_id',
        default_value='0',
        description='USB camera device ID'
    )
    
    yoloe_model_path_arg = DeclareLaunchArgument(
        'yoloe_model_path',
        default_value='',
        description='Path to YOLOE TensorRT engine file. YOLOE supports open-vocabulary detection with zero overhead in closed mode.'
    )
    
    vlm_model_path_arg = DeclareLaunchArgument(
        'vlm_model_path',
        default_value='',
        description='Path to TensorRT-LLM VLM model directory'
    )
    
    enable_yoloe_arg = DeclareLaunchArgument(
        'enable_yoloe',
        default_value='true',
        description='Enable YOLOE detection node'
    )
    
    enable_vlm_arg = DeclareLaunchArgument(
        'enable_vlm',
        default_value='true',
        description='Enable VLM scene description node'
    )
    
    enable_diagnostics_bridge_arg = DeclareLaunchArgument(
        'enable_diagnostics_bridge',
        default_value='true',
        description='Enable diagnostics bridge node (for frontend integration)'
    )
    
    yoloe_confidence_threshold_arg = DeclareLaunchArgument(
        'yoloe_confidence_threshold',
        default_value='0.75',
        description='YOLOE confidence threshold (0.0 to 1.0). Set to 0.75 for 75% confidence requirement (high precision)'
    )
    
    yoloe_nms_threshold_arg = DeclareLaunchArgument(
        'yoloe_nms_threshold',
        default_value='0.5',
        description='YOLOE NMS threshold (0.0 to 1.0). Higher values = more aggressive suppression of overlapping detections. 0.5 recommended for reducing duplicates.'
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
                'conf': LaunchConfiguration('yoloe_confidence_threshold'),  # Maps to 'conf' parameter
                'iou': LaunchConfiguration('yoloe_nms_threshold'),  # Maps to 'iou' parameter
            }
        ],
        output='screen'
    )
    
    # VLM node (conditional)
    vlm_node = Node(
        package='zip_vision',
        executable='vlm_node',
        name='vlm_node',
        condition=IfCondition(LaunchConfiguration('enable_vlm')),
        parameters=[
            PathJoinSubstitution([
                zip_vision_share,
                'config',
                'vlm_params.yaml'
            ]),
            {
                'model_path': LaunchConfiguration('vlm_model_path'),
            }
        ],
        output='screen'
    )
    
    # Diagnostics bridge (Python HTTP server for frontend integration)
    # Use Python bridge which has HTTP server, not C++ node
    diagnostics_bridge_launch = IncludeLaunchDescription(
        PythonLaunchDescriptionSource([
            PathJoinSubstitution([
                zip_vision_share,
                'launch',
                'vision_diagnostics_bridge.launch.py'
            ])
        ]),
        condition=IfCondition(LaunchConfiguration('enable_diagnostics_bridge')),
        launch_arguments={
            'port': '8767',
            'host': '0.0.0.0',  # Listen on all interfaces for Docker
        }.items()
    )
    
    return LaunchDescription([
        device_id_arg,
        yoloe_model_path_arg,
        vlm_model_path_arg,
        enable_yoloe_arg,
        enable_vlm_arg,
        enable_diagnostics_bridge_arg,
        yoloe_confidence_threshold_arg,
        yoloe_nms_threshold_arg,
        camera_launch,
        yoloe_node,
        vlm_node,
        diagnostics_bridge_launch,
    ])
