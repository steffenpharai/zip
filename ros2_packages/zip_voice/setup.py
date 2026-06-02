from setuptools import setup
import os
from glob import glob

package_name = 'zip_voice'

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
    description='ZIP Robot Voice: WhisperTRT (STT) and Piper/Coqui (TTS)',
    license='MIT',
    tests_require=['pytest'],
    entry_points={
        'console_scripts': [
            'stt_node = zip_voice.stt_node:main',
            'tts_node = zip_voice.tts_node:main',
            'voice_loop_node = zip_voice.voice_loop_node:main',
        ],
    },
)
