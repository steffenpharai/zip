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
        description='Path to TensorRT-LLM VLM model directory'
    )
    
    quantization_arg = DeclareLaunchArgument(
        'quantization',
        default_value='int4',
        description='Quantization level (int4, int8, fp16)'
    )
    
    inference_frequency_arg = DeclareLaunchArgument(
        'inference_frequency',
        default_value='5',
        description='Process every Nth frame (1 = every frame, 5 = every 5th frame)'
    )
    
    use_detections_context_arg = DeclareLaunchArgument(
        'use_detections_context',
        default_value='true',
        description='Use YOLO11 detections as context for VLM'
    )
    
    # Parameter file path
    config_file = PathJoinSubstitution([
        zip_vision_share,
        'config',
        'vlm_params.yaml'
    ])
    
    # VLM service node (Python - TensorRT-LLM)
    vlm_service_node = Node(
        package='zip_vision',
        executable='vlm_service_node',
        name='vlm_service_node',
        parameters=[
            config_file,
            {
                'model_path': LaunchConfiguration('model_path'),
                'quantization': LaunchConfiguration('quantization'),
            }
        ],
        output='screen'
    )
    
    # VLM node (C++ - calls service)
    vlm_node = Node(
        package='zip_vision',
        executable='vlm_node',
        name='vlm_node',
        parameters=[
            config_file,
            {
                'inference_frequency': LaunchConfiguration('inference_frequency'),
                'use_detections_context': LaunchConfiguration('use_detections_context'),
            }
        ],
        output='screen'
    )
    
    return LaunchDescription([
        model_path_arg,
        quantization_arg,
        inference_frequency_arg,
        use_detections_context_arg,
        vlm_service_node,
        vlm_node,
    ])
