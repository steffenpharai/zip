from launch import LaunchDescription
from launch.actions import DeclareLaunchArgument
from launch.substitutions import LaunchConfiguration, PathJoinSubstitution
from launch_ros.actions import Node
from launch_ros.substitutions import FindPackageShare


def generate_launch_description():
    # Get package share directory
    zip_vision_share = FindPackageShare(package='zip_vision').find('zip_vision')
    
    # Launch arguments
    model_path_arg = DeclareLaunchArgument(
        'model_path',
        default_value='',
        description='Path to YOLOE TensorRT engine file (.engine). Migrated to YOLOE for potential open-vocabulary detection.'
    )
    
    confidence_threshold_arg = DeclareLaunchArgument(
        'confidence_threshold',
        default_value='0.5',
        description='Confidence threshold for detections (0.0 to 1.0)'
    )
    
    enable_visualization_arg = DeclareLaunchArgument(
        'enable_visualization',
        default_value='true',
        description='Enable visualization output (annotated image)'
    )
    
    # Parameter file path
    config_file = PathJoinSubstitution([
        zip_vision_share,
        'config',
        'yoloe_params.yaml'
    ])
    
    # YOLOE node
    yoloe_node = Node(
        package='zip_vision',
        executable='yoloe_node',
        name='yoloe_node',
        parameters=[
            config_file,
            {
                'model_path': LaunchConfiguration('model_path'),
                'confidence_threshold': LaunchConfiguration('confidence_threshold'),
                'enable_visualization': LaunchConfiguration('enable_visualization'),
            }
        ],
        output='screen'
    )
    
    return LaunchDescription([
        model_path_arg,
        confidence_threshold_arg,
        enable_visualization_arg,
        yoloe_node,
    ])
