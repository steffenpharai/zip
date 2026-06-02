from launch import LaunchDescription
from launch.actions import DeclareLaunchArgument
from launch.substitutions import LaunchConfiguration, PathJoinSubstitution
from launch_ros.actions import Node
from launch_ros.substitutions import FindPackageShare
import os


def generate_launch_description():
    # Get package share directory
    zip_vision_share = FindPackageShare(package='zip_vision').find('zip_vision')
    
    # Launch arguments
    device_id_arg = DeclareLaunchArgument(
        'device_id',
        default_value='0',
        description='USB camera device ID (e.g., 0 for /dev/video0)'
    )
    
    image_width_arg = DeclareLaunchArgument(
        'image_width',
        default_value='640',
        description='Image width in pixels'
    )
    
    image_height_arg = DeclareLaunchArgument(
        'image_height',
        default_value='480',
        description='Image height in pixels'
    )
    
    framerate_arg = DeclareLaunchArgument(
        'framerate',
        default_value='30',
        description='Frame rate (FPS)'
    )
    
    # Parameter file path
    config_file = PathJoinSubstitution([
        zip_vision_share,
        'config',
        'camera_params.yaml'
    ])
    
    # v4l2_camera node
    v4l2_camera_node = Node(
        package='v4l2_camera',
        executable='v4l2_camera_node',
        name='camera_node',
        parameters=[
            config_file,
            {
                'device_id': LaunchConfiguration('device_id'),
                'image_width': LaunchConfiguration('image_width'),
                'image_height': LaunchConfiguration('image_height'),
                'framerate': LaunchConfiguration('framerate'),
            }
        ],
        remappings=[
            ('/image_raw', '/camera/image_raw'),
            ('/camera_info', '/camera/camera_info'),
        ],
        output='screen'
    )
    
    return LaunchDescription([
        device_id_arg,
        image_width_arg,
        image_height_arg,
        framerate_arg,
        v4l2_camera_node,
    ])
