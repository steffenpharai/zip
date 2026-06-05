#!/usr/bin/env python3
"""
Full camera detection test - verifies multiple objects are detected
"""
import rclpy
from rclpy.node import Node
from vision_msgs.msg import Detection2DArray
import time
import sys
from collections import defaultdict

class CameraDetectionTest(Node):
    def __init__(self):
        super().__init__('camera_detection_test')
        self.detection_history = []
        self.class_counts = defaultdict(int)
        self.max_detections = 0
        self.total_frames = 0
        self.frames_with_4plus = 0
        self.start_time = time.time()
        
        self.subscription = self.create_subscription(
            Detection2DArray,
            '/detections',
            self.detection_callback,
            10
        )
        
        self.get_logger().info('=' * 60)
        self.get_logger().info('CAMERA DETECTION TEST - Starting 30 second test')
        self.get_logger().info('=' * 60)
        self.get_logger().info('Waiting for detections on /detections topic...')
        
    def detection_callback(self, msg):
        self.total_frames += 1
        num_detections = len(msg.detections)
        self.detection_history.append((time.time(), num_detections))
        
        if num_detections > self.max_detections:
            self.max_detections = num_detections
            
        if num_detections >= 4:
            self.frames_with_4plus += 1
        
        # Count classes
        classes_in_frame = {}
        for det in msg.detections:
            if det.results:
                class_id = det.results[0].hypothesis.class_id
                confidence = det.results[0].hypothesis.score
                self.class_counts[class_id] += 1
                if class_id not in classes_in_frame:
                    classes_in_frame[class_id] = []
                classes_in_frame[class_id].append(confidence)
        
        # Log every frame for first 10, then every 5th frame
        if self.total_frames <= 10 or self.total_frames % 5 == 0:
            self.get_logger().info(f'Frame {self.total_frames}: {num_detections} detections, {len(classes_in_frame)} unique classes')
            if num_detections > 0:
                for class_id, confs in list(classes_in_frame.items())[:5]:
                    self.get_logger().info(f'  - Class {class_id}: {len(confs)} detections (max conf: {max(confs):.3f})')
                if len(classes_in_frame) > 5:
                    self.get_logger().info(f'  ... and {len(classes_in_frame) - 5} more classes')
            
            if num_detections >= 4:
                self.get_logger().info(f'  ✅ SUCCESS: {num_detections} objects detected (target: 4+)')
            elif num_detections > 0:
                self.get_logger().warn(f'  ⚠️  Only {num_detections} objects detected (target: 4+)')
            else:
                self.get_logger().warn(f'  ❌ No detections in this frame')

def main():
    rclpy.init()
    test_node = CameraDetectionTest()
    
    try:
        # Run for 30 seconds
        timeout = time.time() + 30
        while time.time() < timeout:
            rclpy.spin_once(test_node, timeout_sec=1.0)
            
        # Final summary
        elapsed = time.time() - test_node.start_time
        test_node.get_logger().info('')
        test_node.get_logger().info('=' * 60)
        test_node.get_logger().info('TEST RESULTS SUMMARY')
        test_node.get_logger().info('=' * 60)
        test_node.get_logger().info(f'Test duration: {elapsed:.1f} seconds')
        test_node.get_logger().info(f'Total frames received: {test_node.total_frames}')
        
        if test_node.detection_history:
            avg_detections = sum(count for _, count in test_node.detection_history) / len(test_node.detection_history)
            test_node.get_logger().info(f'Average detections per frame: {avg_detections:.2f}')
            test_node.get_logger().info(f'Maximum detections in single frame: {test_node.max_detections}')
            test_node.get_logger().info(f'Frames with 4+ detections: {test_node.frames_with_4plus} ({100*test_node.frames_with_4plus/test_node.total_frames:.1f}%)')
            
            test_node.get_logger().info('')
            test_node.get_logger().info('Top detected classes:')
            sorted_classes = sorted(test_node.class_counts.items(), key=lambda x: x[1], reverse=True)
            for class_id, count in sorted_classes[:10]:
                test_node.get_logger().info(f'  Class {class_id}: {count} total detections')
            
            test_node.get_logger().info('')
            if test_node.max_detections >= 4:
                test_node.get_logger().info('=' * 60)
                test_node.get_logger().info('✅ TEST PASSED: Multiple objects detected successfully!')
                test_node.get_logger().info(f'   Maximum: {test_node.max_detections} objects')
                test_node.get_logger().info(f'   Average: {avg_detections:.2f} objects per frame')
                test_node.get_logger().info(f'   {test_node.frames_with_4plus} frames had 4+ objects')
                test_node.get_logger().info('=' * 60)
                return 0
            else:
                test_node.get_logger().error('=' * 60)
                test_node.get_logger().error('❌ TEST FAILED: Only {test_node.max_detections} objects detected (need 4+)')
                test_node.get_logger().error('=' * 60)
                return 1
        else:
            test_node.get_logger().error('❌ No detections received at all!')
            return 1
            
    except KeyboardInterrupt:
        test_node.get_logger().info('Test interrupted by user')
        return 1
    finally:
        test_node.destroy_node()
        rclpy.shutdown()

if __name__ == '__main__':
    exit(main())
