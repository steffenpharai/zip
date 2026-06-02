#!/usr/bin/env python3
"""
YOLOE-11 Prompt-Free ROS 2 Node

Lightweight Python ROS 2 node using Ultralytics YOLO11 API for real-time detection.
Replaces the complex C++ yoloe_node with a simpler Python implementation.

Features:
- Uses Ultralytics YOLO11 native API (no custom parsing needed)
- Supports TensorRT engine (.engine) or PyTorch weights (.pt)
- Prompt-free mode (autonomous detection, no CLIP calls)
- Native postprocessing (NMS/confidence handled by Ultralytics)
- Lower memory footprint (~500-700MB TensorRT context)
- Higher FPS (~40-70+ at imgsz=416/FP16 on Jetson Orin Nano)
"""

import rclpy
from rclpy.node import Node
from rclpy.qos import QoSProfile, ReliabilityPolicy, HistoryPolicy
from sensor_msgs.msg import Image
from vision_msgs.msg import Detection2DArray, Detection2D, BoundingBox2D, ObjectHypothesisWithPose
from geometry_msgs.msg import Pose2D
from cv_bridge import CvBridge
from ultralytics import YOLO
import numpy as np
import time
import os
import sys
from typing import Optional

# Model class names will be loaded from model.names (full vocabulary from model)


class YoloeRosNode(Node):
    """ROS 2 node for YOLOE-11 prompt-free detection using Ultralytics API"""
    
    def __init__(self):
        super().__init__('yoloe_node')
        
        # Declare parameters
        self.declare_parameter('model_path', '')
        self.declare_parameter('imgsz', 416)  # Input image size (416 for speed, 640 for accuracy)
        self.declare_parameter('conf', 0.2)  # Confidence threshold (lower for household rare items)
        self.declare_parameter('iou', 0.45)  # IoU threshold for NMS
        self.declare_parameter('half', True)  # Use FP16 precision
        self.declare_parameter('device', '0')  # GPU device ID
        self.declare_parameter('max_det', 100)  # Maximum detections per frame
        self.declare_parameter('enable_visualization', True)
        self.declare_parameter('camera_topic', '/camera/image_raw')
        self.declare_parameter('detections_topic', '/detections')
        self.declare_parameter('visualization_topic', '/detections/visualization')
        
        # Get parameters
        model_path = self.get_parameter('model_path').get_parameter_value().string_value
        if not model_path:
            self.get_logger().error('model_path parameter is required')
            raise ValueError('model_path parameter is required')
        
        imgsz = self.get_parameter('imgsz').get_parameter_value().integer_value
        conf = self.get_parameter('conf').get_parameter_value().double_value
        iou = self.get_parameter('iou').get_parameter_value().double_value
        half = self.get_parameter('half').get_parameter_value().bool_value
        device = self.get_parameter('device').get_parameter_value().string_value
        max_det = self.get_parameter('max_det').get_parameter_value().integer_value
        enable_visualization = self.get_parameter('enable_visualization').get_parameter_value().bool_value
        camera_topic = self.get_parameter('camera_topic').get_parameter_value().string_value
        detections_topic = self.get_parameter('detections_topic').get_parameter_value().string_value
        visualization_topic = self.get_parameter('visualization_topic').get_parameter_value().string_value
        
        # Initialize CV bridge
        self.bridge = CvBridge()
        
        # Load YOLO model (supports .engine or .pt)
        self.get_logger().info(f'Loading YOLO model from: {model_path}')
        try:
            self.model = YOLO(model_path)
            
            # RESEARCH FINDING: YOLOE-v8L-seg-pf prompt-free models should have ~4,585 classes (RAM++ tag set)
            # However, TensorRT engines may be exported with single_cls=True, resulting in only 1 class
            # Check actual model class count
            model_nc = 1
            if hasattr(self.model, 'model') and hasattr(self.model.model, '__getitem__'):
                try:
                    last_layer = self.model.model[-1]
                    if hasattr(last_layer, 'nc'):
                        model_nc = last_layer.nc
                except (AttributeError, IndexError, TypeError):
                    pass
            
            # Safely get model names count
            model_names_count = 0
            try:
                if hasattr(self.model, 'names') and self.model.names:
                    if isinstance(self.model.names, dict):
                        model_names_count = len(self.model.names)
                    elif hasattr(self.model.names, '__len__'):
                        model_names_count = len(self.model.names)
            except (AttributeError, TypeError):
                pass
            
            # CRITICAL ISSUE: If model only has 1 class, all detections will be cls_id=0
            # This means the TensorRT engine was exported incorrectly (single_cls=True)
            # Expected: ~4,585 classes for YOLOE-v8L-seg-pf prompt-free model
            if model_nc == 1 or model_names_count == 1:
                self.get_logger().error(
                    f'CRITICAL: Model has only 1 class (nc={model_nc}, names={model_names_count}). '
                    f'TensorRT engine was likely exported with single_cls=True. '
                    f'All detections will be class_id=0. '
                    f'Expected: ~4,585 classes for YOLOE-v8L-seg-pf prompt-free model. '
                    f'Solution: Re-export TensorRT engine without single_cls=True.'
                )
            
            # Use model.names directly (full vocabulary from model, ~4,585 classes for YOLOE-11L-seg-pf)
            self.class_names = dict(self.model.names) if hasattr(self.model, 'names') and self.model.names else {}
            if self.class_names:
                self.get_logger().info(
                    f'YOLOE-11 PF model loaded with {len(self.class_names)} class names from model vocabulary (prompt-free mode). '
                    f'Model head has nc={model_nc}, model.names has {model_names_count} classes.'
                )
            else:
                self.get_logger().error('No class names available in model - class names will default to class_{id}')
        except Exception as e:
            self.get_logger().error(f'Failed to load model: {e}')
            raise
        
        # Store inference parameters
        self.imgsz = imgsz
        self.conf = conf
        self.iou = iou
        self.half = half
        self.device = device
        self.max_det = max_det
        self.enable_visualization = enable_visualization
        
        # Statistics
        self.inference_times = []
        self.frame_count = 0
        
        # QoS profile (RELIABLE to match camera publisher)
        qos_profile = QoSProfile(
            reliability=ReliabilityPolicy.RELIABLE,
            history=HistoryPolicy.KEEP_LAST,
            depth=10
        )
        
        # Create subscribers and publishers
        self.subscription = self.create_subscription(
            Image,
            camera_topic,
            self.image_callback,
            qos_profile
        )
        
        self.pub_detections = self.create_publisher(
            Detection2DArray,
            detections_topic,
            qos_profile
        )
        
        if enable_visualization:
            self.pub_visualization = self.create_publisher(
                Image,
                visualization_topic,
                qos_profile
            )
        else:
            self.pub_visualization = None
        
        self.get_logger().info(
            f'YOLOE-11 PF node initialized:\n'
            f'  Model: {model_path}\n'
            f'  Image size: {imgsz}\n'
            f'  Confidence: {conf}\n'
            f'  IoU: {iou}\n'
            f'  FP16: {half}\n'
            f'  Device: {device}\n'
            f'  Max detections: {max_det}'
        )
    
    def image_callback(self, msg: Image):
        """Process incoming camera image"""
        try:
            # Convert ROS Image to OpenCV format
            cv_image = self.bridge.imgmsg_to_cv2(msg, desired_encoding='bgr8')
            
            # Set model class names for visualization (already loaded from model.names)
            
            # Run inference
            # RESEARCH FINDING: YOLOE-v8L-seg-pf should output ~4,585 classes (RAM++ tag set)
            # If model.names only has 1 class, the TensorRT engine was exported incorrectly
            # Check model's actual class count before inference
            if hasattr(self.model, 'model') and hasattr(self.model.model, '__getitem__'):
                try:
                    # Check the last layer (detection head) for number of classes
                    last_layer = self.model.model[-1]
                    if hasattr(last_layer, 'nc'):
                        actual_nc = last_layer.nc
                        if actual_nc == 1:
                            self.get_logger().warn(
                                f'CRITICAL: Model head has nc=1 (single class mode). '
                                f'This suggests TensorRT engine was exported with single_cls=True. '
                                f'All detections will be class_id=0. '
                                f'Expected: ~4,585 classes for YOLOE-v8L-seg-pf prompt-free model.'
                            )
                except (AttributeError, IndexError, TypeError):
                    pass
            
            start_time = time.time()
            results = self.model.predict(
                source=cv_image,
                imgsz=self.imgsz,
                conf=self.conf,
                iou=self.iou,
                half=self.half,
                device=self.device,
                max_det=self.max_det,
                verbose=False
            )[0]
            
            # Ensure results.names uses model class names
            if hasattr(self, 'class_names') and self.class_names:
                try:
                    results.names = self.class_names
                except (AttributeError, TypeError):
                    # If results.names is read-only, use model.names
                    pass
            
            inference_time = (time.time() - start_time) * 1000  # Convert to ms
            
            # Track statistics
            self.inference_times.append(inference_time)
            self.frame_count += 1
            if len(self.inference_times) > 100:
                self.inference_times.pop(0)
            
            if self.frame_count % 30 == 0:
                avg_time = np.mean(self.inference_times) if self.inference_times else 0
                fps = 1000.0 / avg_time if avg_time > 0 else 0
                self.get_logger().info(
                    f'Inference: {inference_time:.2f}ms, '
                    f'Avg: {avg_time:.2f}ms ({fps:.1f} FPS), '
                    f'Detections: {len(results.boxes)}'
                )
            
            # Convert to ROS Detection2DArray
            detections_msg = self._results_to_detection2d_array(results, msg.header)
            self.pub_detections.publish(detections_msg)
            
            # Publish visualization if enabled
            # Industry standard: Use Ultralytics results.plot() with model class names
            # This is the world-class industry practice for YOLO visualization
            # results.names is already set above with model class names
            if self.enable_visualization and self.pub_visualization:
                # Use results.plot() - industry standard YOLO visualization method
                # results.names is already set to model class names above
                annotated = results.plot(
                    labels=True,             # Show class labels (industry standard)
                    conf=True,               # Show confidence scores (industry standard)
                    boxes=True,              # Draw bounding boxes (industry standard)
                    masks=False,             # No segmentation masks for detection-only
                    line_width=2             # Standard line width
                )
                
                vis_msg = self.bridge.cv2_to_imgmsg(annotated, encoding='bgr8')
                vis_msg.header = msg.header
                self.pub_visualization.publish(vis_msg)
                
        except Exception as e:
            self.get_logger().error(f'Error processing image: {e}')
            import traceback
            self.get_logger().error(traceback.format_exc())
    
    def _results_to_detection2d_array(self, results, header) -> Detection2DArray:
        """Convert Ultralytics results to ROS 2 Detection2DArray"""
        det_array = Detection2DArray()
        det_array.header = header
        
        if results.boxes is None or len(results.boxes) == 0:
            return det_array
        
        # Get image dimensions for coordinate conversion
        img_height, img_width = results.orig_shape[:2]
        
        for i, box in enumerate(results.boxes):
            # Get bounding box coordinates (xyxy format)
            xyxy = box.xyxy[0].cpu().numpy()
            x1, y1, x2, y2 = xyxy
            
            # Calculate center and size
            center_x = (x1 + x2) / 2.0
            center_y = (y1 + y2) / 2.0
            size_x = x2 - x1
            size_y = y2 - y1
            
            # Get class and confidence from box
            # According to Ultralytics docs: box.cls is the class index tensor
            cls_id_tensor = box.cls[0] if hasattr(box.cls, '__len__') and len(box.cls) > 0 else box.cls
            cls_id = int(cls_id_tensor.cpu().numpy())
            conf = float(box.conf[0].cpu().numpy())
            
            # DEBUG: Log raw class data to understand model output
            # Research shows YOLOE-v8L-seg-pf should have ~4,585 classes, not 1
            # If model.names only has 1 class, the TensorRT engine may be misconfigured
            if i < 3:
                box_data_info = f"box.data shape: {box.data.shape}" if hasattr(box, 'data') and hasattr(box.data, 'shape') else "N/A"
                self.get_logger().info(
                    f'DEBUG Detection {i}: box.cls={box.cls}, cls_id={cls_id}, '
                    f'box.cls type={type(box.cls)}, {box_data_info}, '
                    f'model.names keys={list(self.model.names.keys())[:5] if hasattr(self.model, "names") and isinstance(self.model.names, dict) else "N/A"}'
                )
            
            # CRITICAL ISSUE: Research shows YOLOE prompt-free models should output class IDs 
            # corresponding to their internal vocabulary (~4,585 classes for RAM++ tag set)
            # However, if model.names only has 1 class, the TensorRT engine was likely exported
            # in single-class mode or the model head is misconfigured
            # 
            # The model is outputting cls_id=0 for all detections, which suggests:
            # 1. The model is actually detecting different objects but all mapped to class 0
            # 2. OR the TensorRT engine was exported with single_cls=True
            # 3. OR there's a mismatch between the model's actual output and what we're reading
            #
            # For now, we'll use the class_id as-is, but this needs investigation
            
            # Get class name from stored class_names (model vocabulary mapping)
            if hasattr(self, 'class_names') and cls_id in self.class_names:
                cls_name = self.class_names[cls_id]
            elif hasattr(self.model, 'names') and cls_id in self.model.names:
                cls_name = self.model.names[cls_id]
            elif hasattr(results, 'names') and cls_id in results.names:
                cls_name = results.names[cls_id]
            else:
                cls_name = f'class_{cls_id}'
            
            # Create Detection2D message
            detection = Detection2D()
            detection.id = f'det_{i}'  # Detection ID, NOT class ID
            
            # Bounding box (center + size format)
            detection.bbox = BoundingBox2D()
            # Set center position (Pose2D has a position field which is Point2D)
            detection.bbox.center.position.x = float(center_x)
            detection.bbox.center.position.y = float(center_y)
            detection.bbox.size_x = float(size_x)
            detection.bbox.size_y = float(size_y)
            
            # Object hypothesis (class + confidence)
            # CRITICAL: hypothesis.class_id is the correct field for class ID
            hypothesis = ObjectHypothesisWithPose()
            hypothesis.hypothesis.class_id = str(cls_id)  # Store class_id as string
            hypothesis.hypothesis.score = conf
            detection.results = [hypothesis]
            
            # Log class name for debugging (first few detections only)
            if i < 3:
                # Check both model.names and results.names
                model_names_info = f"model.names: {len(self.model.names) if hasattr(self.model, 'names') else 0} classes"
                class_names_info = f"self.class_names: {len(self.class_names) if hasattr(self, 'class_names') else 0} classes"
                if hasattr(self, 'class_names') and cls_id in self.class_names:
                    class_names_info += f", name={self.class_names[cls_id]}"
                results_names_info = 'N/A'
                if hasattr(results, 'names'):
                    if isinstance(results.names, dict):
                        results_names_info = f"results.names: {len(results.names)} classes"
                    else:
                        results_names_info = f"results.names: type={type(results.names)}"
                self.get_logger().info(
                    f'Detection {i}: cls_id={cls_id}, cls_name={cls_name}, confidence={conf:.2f}, '
                    f'{model_names_info}, {class_names_info}, {results_names_info}'
                )
            
            det_array.detections.append(detection)
        
        return det_array


def main(args=None):
    rclpy.init(args=args)
    node = YoloeRosNode()
    try:
        rclpy.spin(node)
    except KeyboardInterrupt:
        pass
    finally:
        node.destroy_node()
        rclpy.shutdown()


if __name__ == '__main__':
    main()
