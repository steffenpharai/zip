#!/usr/bin/env python3
"""Quick verification script for multiple object detection"""
import subprocess
import time
import sys

print("=== Verifying Multiple Object Detection ===")
print("This will check ROS 2 topic /detections for 20 seconds")
print("")

# Run ros2 topic echo in background
cmd = ['timeout', '20', 'ros2', 'topic', 'echo', '/detections', '--once']
max_detections = 0
frames_checked = 0

try:
    for i in range(20):
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=2
        )
        
        if result.returncode == 0 and result.stdout:
            # Parse output to count detections
            lines = result.stdout.split('\n')
            detection_count = 0
            for line in lines:
                if 'detections:' in line.lower() or 'class_id:' in line.lower():
                    detection_count += 1
            
            # Try to count actual detections
            if 'detections:' in result.stdout:
                # Count how many times we see detection entries
                parts = result.stdout.split('---')
                if len(parts) > 1:
                    detection_section = parts[1]
                    # Count detections by looking for class_id or hypothesis
                    detections = detection_section.count('class_id:') or detection_section.count('hypothesis:')
                    if detections > max_detections:
                        max_detections = detections
                        print(f"Frame {i+1}: Found {detections} detections")
        
        frames_checked += 1
        time.sleep(1)
        
except Exception as e:
    print(f"Error: {e}")

print(f"\n=== Results ===")
print(f"Frames checked: {frames_checked}")
print(f"Maximum detections in single frame: {max_detections}")

if max_detections >= 4:
    print(f"✅ SUCCESS: {max_detections} objects detected (target: 4+)")
    sys.exit(0)
else:
    print(f"❌ FAILED: Only {max_detections} objects detected (need 4+)")
    sys.exit(1)
