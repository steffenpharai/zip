#!/usr/bin/env python3
"""
Verify that YOLO11 is detecting multiple objects
"""
import rclpy
from rclpy.node import Node
from vision_msgs.msg import Detection2DArray
import time

class DetectionVerifier(Node):
    def __init__(self):
        super().__init__('detection_verifier')
        self.detections_received = []
        self.subscription = self.create_subscription(
            Detection2DArray,
            '/detections',
            self.detection_callback,
            10
        )
        self.get_logger().info('Waiting for detections on /detections topic...')
        
    def detection_callback(self, msg):
        num_detections = len(msg.detections)
        self.detections_received.append((time.time(), num_detections))
        
        if num_detections > 0:
            classes = {}
            for det in msg.detections:
                if det.results:
                    class_id = det.results[0].hypothesis.class_id
                    confidence = det.results[0].hypothesis.score
                    if class_id not in classes:
                        classes[class_id] = []
                    classes[class_id].append(confidence)
            
            self.get_logger().info(f'✓ Detected {num_detections} objects: {len(classes)} unique classes')
            for class_id, confs in classes.items():
                self.get_logger().info(f'  Class {class_id}: {len(confs)} detections (max conf: {max(confs):.3f})')
            
            if num_detections >= 4:
                self.get_logger().info(f'✅ SUCCESS: {num_detections} objects detected (target: 4+)')
            else:
                self.get_logger().warn(f'⚠️  Only {num_detections} objects detected (target: 4+)')
        else:
            self.get_logger().warn('No detections received')

def main():
    rclpy.init()
    verifier = DetectionVerifier()
    
    try:
        # Run for 30 seconds
        timeout = time.time() + 30
        while time.time() < timeout:
            rclpy.spin_once(verifier, timeout_sec=1.0)
            
        # Summary
        if verifier.detections_received:
            max_detections = max(count for _, count in verifier.detections_received)
            avg_detections = sum(count for _, count in verifier.detections_received) / len(verifier.detections_received)
            verifier.get_logger().info(f'\n=== SUMMARY ===')
            verifier.get_logger().info(f'Max detections in single frame: {max_detections}')
            verifier.get_logger().info(f'Average detections: {avg_detections:.2f}')
            verifier.get_logger().info(f'Total frames received: {len(verifier.detections_received)}')
            
            if max_detections >= 4:
                verifier.get_logger().info(f'✅ VERIFICATION PASSED: {max_detections} objects detected')
                return 0
            else:
                verifier.get_logger().error(f'❌ VERIFICATION FAILED: Only {max_detections} objects detected (need 4+)')
                return 1
        else:
            verifier.get_logger().error('❌ No detections received at all!')
            return 1
    finally:
        verifier.destroy_node()
        rclpy.shutdown()

if __name__ == '__main__':
    exit(main())
