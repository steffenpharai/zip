from setuptools import setup
import os
from glob import glob

package_name = 'zip_control'

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
    install_requires=['setuptools', 'pyserial>=3.5'],
    zip_safe=True,
    maintainer='ZIP Robot Team',
    maintainer_email='zip@example.com',
    description='ZIP Robot Control: Motion control and Arduino serial bridge',
    license='MIT',
    tests_require=['pytest'],
    entry_points={
        'console_scripts': [
            'serial_bridge_node = zip_control.serial_bridge_node:main',
        ],
    },
)
