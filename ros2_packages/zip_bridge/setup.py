from setuptools import setup
import os
from glob import glob

package_name = 'zip_bridge'

setup(
    name=package_name,
    version='0.1.0',
    packages=[package_name],
    data_files=[
        ('share/ament_index/resource_index/packages',
            ['resource/' + package_name]),
        ('share/' + package_name, ['package.xml']),
        (os.path.join('share', package_name, 'launch'), glob('launch/*.launch.py')),
        (os.path.join('share', package_name, 'config'), glob('config/*.yaml')),
    ],
    install_requires=['setuptools'],
    zip_safe=True,
    maintainer='ZIP Robot Team',
    maintainer_email='zip@example.com',
    description='ZIP Robot Bridge: rosbridge_suite wrapper and tool bridge',
    license='MIT',
    tests_require=['pytest'],
    entry_points={
        'console_scripts': [
            'tool_bridge_node = zip_bridge.tool_bridge_node:main',
        ],
    },
)
