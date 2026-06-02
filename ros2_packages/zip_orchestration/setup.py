from setuptools import setup
import os
from glob import glob

package_name = 'zip_orchestration'

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
    install_requires=[
        'setuptools',
        'mcp>=1.0.0',
        'fastmcp>=0.1.0',
        'fastapi>=0.100.0',
        'uvicorn>=0.23.0',
    ],
    zip_safe=True,
    maintainer='ZIP Robot Team',
    maintainer_email='zip@example.com',
    description='ZIP Robot Orchestration: MCP server for ROS 2 tool execution',
    license='MIT',
    tests_require=['pytest'],
    entry_points={
        'console_scripts': [
            'zip_mcp_server = zip_orchestration.mcp_server:main',
            'zip_mcp_http_server = zip_orchestration.mcp_http_server:run_http_server',
        ],
    },
)
