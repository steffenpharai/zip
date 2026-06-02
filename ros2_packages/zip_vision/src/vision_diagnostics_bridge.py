#!/usr/bin/env python3
"""
Vision Diagnostics HTTP Bridge Server

Bridges ROS 2 vision topics to HTTP API for Next.js frontend.
Subscribes to camera, detections, and visualization topics.
Provides REST endpoints for diagnostics frontend.

Usage:
    python3 vision_diagnostics_bridge.py [--port PORT] [--host HOST]
"""

import rclpy
from rclpy.node import Node
from rclpy.qos import QoSProfile, ReliabilityPolicy, DurabilityPolicy, HistoryPolicy
from sensor_msgs.msg import Image
from vision_msgs.msg import Detection2DArray, Detection2D
from std_msgs.msg import String
import base64
import json
import threading
import time
import sys
from datetime import datetime, timedelta
from typing import Optional, Dict, Any
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
import argparse

# Lazy import cv_bridge to avoid NumPy 2.x compatibility issues
try:
    from cv_bridge import CvBridge
    import cv2
    CV_BRIDGE_AVAILABLE = True
except Exception as e:
    print(f"WARNING: cv_bridge not available ({e}). Image encoding will be disabled.")
    CV_BRIDGE_AVAILABLE = False
    CvBridge = None
    cv2 = None

# Load model class names from engine file (same as yoloe_ros_node uses)
# This ensures we use the same vocabulary (4585 classes for YOLOE-11L-seg-pf)
CLASS_NAMES = {}
try:
    from ultralytics import YOLO
    import os
    # Try to load the same engine that yoloe_ros_node uses
    engine_paths = [
        os.path.expanduser('~/ros2_ws/src/zip_vision/models/yoloe/yoloe-11l-seg-pf_640_fp16.engine'),
        os.path.expanduser('~/ros2_ws/src/zip_vision/models/yoloe/yoloe-v8l-seg-pf_640_fp16.engine'),
    ]
    for engine_path in engine_paths:
        if os.path.exists(engine_path):
            try:
                model = YOLO(engine_path)
                if hasattr(model, 'names') and model.names:
                    CLASS_NAMES = dict(model.names)
                    print(f"Loaded {len(CLASS_NAMES)} class names from {os.path.basename(engine_path)}")
                    break
            except Exception as e:
                print(f"Warning: Could not load class names from {engine_path}: {e}")
                continue
except Exception as e:
    print(f"Warning: Could not load model for class names: {e}")


class VisionBridgeNode(Node):
    """ROS 2 node that subscribes to vision topics"""
    
    def __init__(self):
        super().__init__('vision_diagnostics_bridge')
        
        # Declare parameters
        self.declare_parameter('camera_topic', '/camera/image_raw')
        self.declare_parameter('detections_topic', '/detections')
        self.declare_parameter('visualization_topic', '/detections/visualization')
        self.declare_parameter('scene_description_topic', '/scene_description')
        
        # Get parameters
        camera_topic = self.get_parameter('camera_topic').get_parameter_value().string_value
        detections_topic = self.get_parameter('detections_topic').get_parameter_value().string_value
        visualization_topic = self.get_parameter('visualization_topic').get_parameter_value().string_value
        scene_description_topic = self.get_parameter('scene_description_topic').get_parameter_value().string_value
        
        # Initialize CV bridge (if available)
        if CV_BRIDGE_AVAILABLE:
            self.bridge = CvBridge()
        else:
            self.bridge = None
            self.get_logger().warn('cv_bridge not available - image encoding disabled')
        
        # Latest messages (thread-safe with locks)
        self.lock = threading.Lock()
        self.latest_camera_msg: Optional[Image] = None
        self.latest_detections_msg: Optional[Detection2DArray] = None
        self.latest_visualization_msg: Optional[Image] = None
        self.latest_scene_description_msg: Optional[String] = None
        
        # Timestamps
        self.last_camera_update: Optional[datetime] = None
        self.last_detections_update: Optional[datetime] = None
        self.last_visualization_update: Optional[datetime] = None
        self.last_scene_description_update: Optional[datetime] = None
        
        # Statistics
        self.detection_count_history = []  # List of (timestamp, count) tuples
        self.inference_times = []  # List of inference times in ms
        
        # CRITICAL FIX: Use RELIABLE QoS to match publishers
        # YOLOE node and camera publish with RELIABLE QoS
        # ROS 2 requires matching reliability policies (RELIABLE <-> RELIABLE)
        image_qos = QoSProfile(
            depth=10,
            reliability=ReliabilityPolicy.RELIABLE,
            durability=DurabilityPolicy.VOLATILE,
            history=HistoryPolicy.KEEP_LAST
        )
        
        detections_qos = QoSProfile(
            depth=10,
            reliability=ReliabilityPolicy.RELIABLE,
            durability=DurabilityPolicy.VOLATILE,
            history=HistoryPolicy.KEEP_LAST
        )
        
        # Create subscribers with RELIABLE QoS
        self.camera_sub = self.create_subscription(
            Image,
            camera_topic,
            self.camera_callback,
            image_qos
        )
        
        self.detections_sub = self.create_subscription(
            Detection2DArray,
            detections_topic,
            self.detections_callback,
            detections_qos
        )
        
        self.visualization_sub = self.create_subscription(
            Image,
            visualization_topic,
            self.visualization_callback,
            image_qos
        )
        
        self.scene_description_sub = self.create_subscription(
            String,
            scene_description_topic,
            self.scene_description_callback,
            detections_qos
        )
        
        self.get_logger().info(f'QoS: RELIABLE, depth=10 (matching publishers)')
        
        self.get_logger().info(f'Vision diagnostics bridge node started')
        self.get_logger().info(f'Subscribing to: {camera_topic}, {detections_topic}, {visualization_topic}, {scene_description_topic}')
    
    def camera_callback(self, msg: Image):
        with self.lock:
            self.latest_camera_msg = msg
            self.last_camera_update = datetime.now()
    
    def detections_callback(self, msg: Detection2DArray):
        with self.lock:
            self.latest_detections_msg = msg
            self.last_detections_update = datetime.now()
            
            # Track detection count history (keep last 100)
            self.detection_count_history.append((datetime.now(), len(msg.detections)))
            if len(self.detection_count_history) > 100:
                self.detection_count_history.pop(0)
    
    def visualization_callback(self, msg: Image):
        with self.lock:
            self.latest_visualization_msg = msg
            self.last_visualization_update = datetime.now()
    
    def scene_description_callback(self, msg: String):
        with self.lock:
            self.latest_scene_description_msg = msg
            self.last_scene_description_update = datetime.now()
    
    def get_latest_camera_image(self) -> Optional[bytes]:
        """Get latest camera image as JPEG bytes"""
        if not CV_BRIDGE_AVAILABLE or self.bridge is None:
            return None
        
        # Acquire lock with timeout to prevent deadlock
        if not self.lock.acquire(timeout=1.0):
            self.get_logger().warning('Timeout acquiring lock for camera image')
            return None
        
        try:
            if self.latest_camera_msg is None:
                return None
            
            try:
                cv_image = self.bridge.imgmsg_to_cv2(self.latest_camera_msg, desired_encoding='bgr8')
                _, buffer = cv2.imencode('.jpg', cv_image, [cv2.IMWRITE_JPEG_QUALITY, 85])
                return buffer.tobytes()
            except Exception as e:
                self.get_logger().error(f'Error encoding camera image: {e}')
                return None
        finally:
            self.lock.release()
    
    def get_latest_visualization_image(self) -> Optional[bytes]:
        """Get latest visualization image as JPEG bytes"""
        if not CV_BRIDGE_AVAILABLE or self.bridge is None:
            return None
        
        # Acquire lock with timeout to prevent deadlock
        if not self.lock.acquire(timeout=1.0):
            self.get_logger().warning('Timeout acquiring lock for visualization image')
            return None
        
        try:
            if self.latest_visualization_msg is None:
                return None
            
            try:
                cv_image = self.bridge.imgmsg_to_cv2(self.latest_visualization_msg, desired_encoding='bgr8')
                _, buffer = cv2.imencode('.jpg', cv_image, [cv2.IMWRITE_JPEG_QUALITY, 85])
                return buffer.tobytes()
            except Exception as e:
                self.get_logger().error(f'Error encoding visualization image: {e}')
                return None
        finally:
            self.lock.release()
    
    def get_detections_json(self) -> Dict[str, Any]:
        """Get latest detections as JSON-serializable dict"""
        with self.lock:
            if self.latest_detections_msg is None:
                return {
                    'detections': [],
                    'header': None,
                    'timestamp': None,
                    'image_width': None,
                    'image_height': None
                }
            
            # Extract image dimensions from frame_id if available (format: "frame_id:width:height")
            image_width = None
            image_height = None
            if self.latest_detections_msg.header.frame_id:
                frame_id_parts = self.latest_detections_msg.header.frame_id.split(':')
                if len(frame_id_parts) == 3:
                    try:
                        image_width = int(frame_id_parts[1])
                        image_height = int(frame_id_parts[2])
                    except ValueError:
                        pass
            
            # Fallback to camera message dimensions if available
            if image_width is None and self.latest_camera_msg:
                image_width = self.latest_camera_msg.width
                image_height = self.latest_camera_msg.height
            
            detections = []
            for i, det in enumerate(self.latest_detections_msg.detections):
                # Extract class ID and confidence
                # CRITICAL FIX: Always extract class_id from hypothesis.class_id first
                # det.id is just "det_0", "det_1", etc. and should NOT be used for class_id
                class_id = 0
                confidence = 0.0
                if det.results and len(det.results) > 0:
                    confidence = det.results[0].hypothesis.score
                    # hypothesis.class_id is the correct source for class_id (set by yoloe_ros_node)
                    if det.results[0].hypothesis.class_id.isdigit():
                        class_id = int(det.results[0].hypothesis.class_id)
                    else:
                        # Fallback: try to parse as integer even if not all digits
                        try:
                            class_id = int(det.results[0].hypothesis.class_id)
                        except (ValueError, AttributeError):
                            class_id = 0
                
                # Get class name from model vocabulary (4585 classes for YOLOE-11L-seg-pf)
                class_name = CLASS_NAMES.get(class_id, f"class_{class_id}")
                
                # Extract bounding box - make sure we're reading each detection's unique bbox
                center_x = float(det.bbox.center.position.x)
                center_y = float(det.bbox.center.position.y)
                size_x = float(det.bbox.size_x)
                size_y = float(det.bbox.size_y)
                
                # Calculate top-left coordinates
                bbox_x = center_x - size_x / 2.0
                bbox_y = center_y - size_y / 2.0
                
                # Log first few detections for debugging
                if i < 3:
                    # Log class_id extraction details for debugging
                    det_id = det.id if hasattr(det, 'id') else 'N/A'
                    hyp_class_id = det.results[0].hypothesis.class_id if det.results and len(det.results) > 0 else 'N/A'
                    self.get_logger().info(
                        f'Detection {i}: det.id={det_id}, hypothesis.class_id={hyp_class_id}, '
                        f'extracted class_id={class_id}, class_name={class_name}, '
                        f'confidence={confidence:.2f}'
                    )
                
                detections.append({
                    'classId': str(class_id),
                    'className': class_name,
                    'confidence': float(confidence),
                    'bbox': {
                        'x': bbox_x,
                        'y': bbox_y,
                        'width': size_x,
                        'height': size_y,
                        'centerX': center_x,
                        'centerY': center_y
                    }
                })
            
            # Extract original frame_id (remove dimensions if present)
            original_frame_id = self.latest_detections_msg.header.frame_id
            if ':' in original_frame_id:
                original_frame_id = original_frame_id.split(':')[0]
            
            return {
                'detections': detections,
                'header': {
                    'stamp': {
                        'sec': self.latest_detections_msg.header.stamp.sec,
                        'nanosec': self.latest_detections_msg.header.stamp.nanosec
                    },
                    'frame_id': original_frame_id
                },
                'timestamp': self.last_detections_update.isoformat() if self.last_detections_update else None,
                'image_width': image_width,
                'image_height': image_height
            }
    
    def get_status(self) -> Dict[str, Any]:
        """Get overall status of all topics"""
        # Acquire lock with timeout to prevent deadlock
        if not self.lock.acquire(timeout=1.0):
            self.get_logger().warning('Timeout acquiring lock for status')
            # Return minimal status without lock
            return {
                'camera': {'active': False, 'error': 'Lock timeout'},
                'detections': {'active': False, 'error': 'Lock timeout'},
                'visualization': {'active': False, 'error': 'Lock timeout'},
                'scene_description': {'active': False, 'error': 'Lock timeout'}
            }
        
        try:
            now = datetime.now()
            
            def time_since(timestamp: Optional[datetime]) -> Optional[float]:
                if timestamp is None:
                    return None
                return (now - timestamp).total_seconds()
            
            # Calculate FPS from detection history
            fps = None
            if len(self.detection_count_history) >= 2:
                time_span = (self.detection_count_history[-1][0] - self.detection_count_history[0][0]).total_seconds()
                if time_span > 0:
                    fps = len(self.detection_count_history) / time_span
            
            # Calculate average detection count
            avg_detections = None
            if self.detection_count_history:
                avg_detections = sum(count for _, count in self.detection_count_history) / len(self.detection_count_history)
            
            return {
                'camera': {
                    'active': self.latest_camera_msg is not None,
                    'last_update_seconds_ago': time_since(self.last_camera_update),
                    'width': self.latest_camera_msg.width if self.latest_camera_msg else None,
                    'height': self.latest_camera_msg.height if self.latest_camera_msg else None,
                    'encoding': self.latest_camera_msg.encoding if self.latest_camera_msg else None
                },
                'detections': {
                    'active': self.latest_detections_msg is not None,
                    'last_update_seconds_ago': time_since(self.last_detections_update),
                    'current_count': len(self.latest_detections_msg.detections) if self.latest_detections_msg else 0,
                    'average_count': avg_detections,
                    'fps': fps
                },
                'visualization': {
                    'active': self.latest_visualization_msg is not None,
                    'last_update_seconds_ago': time_since(self.last_visualization_update)
                },
                'scene_description': {
                    'active': self.latest_scene_description_msg is not None,
                    'last_update_seconds_ago': time_since(self.last_scene_description_update),
                    'text': self.latest_scene_description_msg.data if self.latest_scene_description_msg else None
                }
            }
        finally:
            self.lock.release()


class VisionHTTPHandler(BaseHTTPRequestHandler):
    """HTTP request handler for vision diagnostics API"""
    
    def __init__(self, bridge_node: VisionBridgeNode, *args, **kwargs):
        self.bridge_node = bridge_node
        super().__init__(*args, **kwargs)
    
    def log_message(self, format, *args):
        """Override to suppress normal connection logs and only log errors"""
        # Only log errors, not normal disconnections
        if 'error' in format.lower() or 'exception' in format.lower():
            self.bridge_node.get_logger().warning(f'HTTP: {format % args}')
        # Suppress normal connection/disconnection messages
    
    def handle_one_request(self):
        """Override to catch and handle exceptions gracefully"""
        try:
            super().handle_one_request()
        except (ConnectionResetError, BrokenPipeError, OSError):
            # Client disconnected - normal, don't log as error
            pass
        except Exception as e:
            # Log unexpected errors but don't crash
            self.bridge_node.get_logger().warning(f'Request handler error (non-fatal): {e}', exc_info=False)
    
    def do_GET(self):
        """Handle GET requests - wrapped in try-except to prevent crashes"""
        try:
            parsed_path = urlparse(self.path)
            path = parsed_path.path
        except Exception as e:
            self.bridge_node.get_logger().warning(f'Error parsing path (non-fatal): {e}', exc_info=False)
            try:
                self.send_response(400)
                self.send_cors_headers()
                self.end_headers()
            except:
                pass
            return
        
        # Wrap entire handler in try-except to catch any unexpected errors
        try:
            if path == '/api/vision/camera':
                # Return latest camera image as JPEG (single frame)
                image_data = self.bridge_node.get_latest_camera_image()
                if image_data:
                    self.send_response(200)
                    self.send_cors_headers()
                    self.send_header('Content-Type', 'image/jpeg')
                    self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
                    self.end_headers()
                    self.wfile.write(image_data)
                else:
                    self.send_response(404)
                    self.send_cors_headers()
                    self.send_header('Content-Type', 'application/json')
                    self.end_headers()
                    self.wfile.write(json.dumps({'error': 'No camera image available'}).encode())
            
            elif path == '/api/vision/camera/stream':
                # MJPEG stream endpoint - industry standard for video streaming
                # Uses multipart/x-mixed-replace to stream continuous JPEG frames
                try:
                    image_data = self.bridge_node.get_latest_camera_image()
                    if not image_data:
                        try:
                            self.send_response(503)
                            self.send_cors_headers()
                            self.send_header('Content-Type', 'text/plain')
                            self.end_headers()
                            self.wfile.write(b'Camera not available')
                        except (ConnectionResetError, BrokenPipeError, OSError):
                            # Client disconnected before we could send response
                            return
                        return
                    
                    # Set MJPEG stream headers
                    try:
                        self.send_response(200)
                        self.send_cors_headers()
                        self.send_header('Content-Type', 'multipart/x-mixed-replace; boundary=frame')
                        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
                        self.send_header('Pragma', 'no-cache')
                        self.end_headers()
                    except (ConnectionResetError, BrokenPipeError, OSError):
                        # Client disconnected before headers sent
                        return
                except Exception as e:
                    self.bridge_node.get_logger().warning(f'Stream setup error (non-fatal): {e}', exc_info=False)
                    return
                
                # Stream frames continuously until client disconnects
                frame_boundary = b'--frame\r\n'
                last_frame_time = time.time()
                target_fps = 30.0  # Target 30 FPS
                frame_interval = 1.0 / target_fps  # ~0.033 seconds
                
                try:
                    while True:
                        try:
                            # Check if connection is still alive before writing
                            if hasattr(self.wfile, 'closed') and self.wfile.closed:
                                break
                                
                            # Get latest frame
                            image_data = self.bridge_node.get_latest_camera_image()
                            
                            if image_data:
                                try:
                                    # Send frame boundary
                                    self.wfile.write(frame_boundary)
                                    
                                    # Send frame headers
                                    header = f'Content-Type: image/jpeg\r\nContent-Length: {len(image_data)}\r\n\r\n'
                                    self.wfile.write(header.encode())
                                    
                                    # Send frame data
                                    self.wfile.write(image_data)
                                    self.wfile.write(b'\r\n')
                                    self.wfile.flush()
                                except (ConnectionResetError, BrokenPipeError, OSError):
                                    # Client disconnected during write - normal, just exit
                                    break
                                
                                # Frame rate control - maintain target FPS
                                current_time = time.time()
                                elapsed = current_time - last_frame_time
                                if elapsed < frame_interval:
                                    time.sleep(frame_interval - elapsed)
                                last_frame_time = time.time()
                            else:
                                # No frame available, wait a bit before retrying
                                time.sleep(0.033)
                                
                        except (ConnectionResetError, BrokenPipeError, OSError):
                            # Client disconnected - normal for streaming, exit gracefully
                            break
                        except Exception as e:
                            # Unexpected error - log but don't crash the bridge
                            self.bridge_node.get_logger().warning(f'Stream error (non-fatal): {e}', exc_info=False)
                            # Wait a bit before breaking to avoid rapid reconnection attempts
                            time.sleep(0.1)
                            break
                except Exception as e:
                    # Catch any outer exceptions to prevent bridge crash
                    self.bridge_node.get_logger().warning(f'Stream handler error (non-fatal): {e}', exc_info=False)
            
            elif path == '/api/vision/visualization':
                # Return latest visualization image as JPEG
                image_data = self.bridge_node.get_latest_visualization_image()
                if image_data:
                    self.send_response(200)
                    self.send_cors_headers()
                    self.send_header('Content-Type', 'image/jpeg')
                    self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
                    self.end_headers()
                    self.wfile.write(image_data)
                else:
                    self.send_response(404)
                    self.send_cors_headers()
                    self.send_header('Content-Type', 'application/json')
                    self.end_headers()
                    self.wfile.write(json.dumps({'error': 'No visualization image available'}).encode())
            
            elif path == '/api/vision/visualization/stream':
                # MJPEG stream endpoint for visualization (YOLO overlays already drawn by C++ node)
                # Uses multipart/x-mixed-replace to stream continuous JPEG frames
                try:
                    image_data = self.bridge_node.get_latest_visualization_image()
                    if not image_data:
                        try:
                            self.send_response(503)
                            self.send_cors_headers()
                            self.send_header('Content-Type', 'text/plain')
                            self.end_headers()
                            self.wfile.write(b'Visualization not available')
                        except (ConnectionResetError, BrokenPipeError, OSError):
                            # Client disconnected before we could send response
                            return
                        return
                    
                    # Set MJPEG stream headers
                    try:
                        self.send_response(200)
                        self.send_cors_headers()
                        self.send_header('Content-Type', 'multipart/x-mixed-replace; boundary=frame')
                        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
                        self.send_header('Pragma', 'no-cache')
                        self.end_headers()
                    except (ConnectionResetError, BrokenPipeError, OSError):
                        # Client disconnected before headers sent
                        return
                except Exception as e:
                    self.bridge_node.get_logger().warning(f'Visualization stream setup error (non-fatal): {e}', exc_info=False)
                    return
                
                # Stream frames continuously until client disconnects
                frame_boundary = b'--frame\r\n'
                last_frame_time = time.time()
                target_fps = 30.0  # Target 30 FPS
                frame_interval = 1.0 / target_fps  # ~0.033 seconds
                
                try:
                    while True:
                        try:
                            # Check if connection is still alive before writing
                            if hasattr(self.wfile, 'closed') and self.wfile.closed:
                                break
                                
                            # Get latest visualization frame (with YOLO overlays)
                            image_data = self.bridge_node.get_latest_visualization_image()
                            
                            if image_data:
                                try:
                                    # Send frame boundary
                                    self.wfile.write(frame_boundary)
                                    
                                    # Send frame headers
                                    header = f'Content-Type: image/jpeg\r\nContent-Length: {len(image_data)}\r\n\r\n'
                                    self.wfile.write(header.encode())
                                    
                                    # Send frame data
                                    self.wfile.write(image_data)
                                    self.wfile.write(b'\r\n')
                                    self.wfile.flush()
                                except (ConnectionResetError, BrokenPipeError, OSError):
                                    # Client disconnected during write - normal, just exit
                                    break
                                
                                # Frame rate control - maintain target FPS
                                current_time = time.time()
                                elapsed = current_time - last_frame_time
                                if elapsed < frame_interval:
                                    time.sleep(frame_interval - elapsed)
                                last_frame_time = time.time()
                            else:
                                # No frame available, wait a bit before retrying
                                time.sleep(0.033)
                                
                        except (ConnectionResetError, BrokenPipeError, OSError):
                            # Client disconnected - normal for streaming, exit gracefully
                            break
                        except Exception as e:
                            # Unexpected error - log but don't crash the bridge
                            self.bridge_node.get_logger().warning(f'Visualization stream error (non-fatal): {e}', exc_info=False)
                            # Wait a bit before breaking to avoid rapid reconnection attempts
                            time.sleep(0.1)
                            break
                except Exception as e:
                    # Catch any outer exceptions to prevent bridge crash
                    self.bridge_node.get_logger().warning(f'Visualization stream handler error (non-fatal): {e}', exc_info=False)
            
            elif path == '/api/vision/detections':
                # Return latest detections as JSON
                detections = self.bridge_node.get_detections_json()
                self.send_response(200)
                self.send_cors_headers()
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps(detections).encode())
            
            elif path == '/api/vision/status':
                # Return status of all topics
                status = self.bridge_node.get_status()
                self.send_response(200)
                self.send_cors_headers()
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps(status).encode())
            
            elif path == '/api/vision/config':
                # Return YOLO configuration (from ROS parameters or defaults)
                config = {
                    'modelPath': '/opt/models/yoloe.engine',  # Default, should come from ROS params
                    'inputWidth': 640,
                    'inputHeight': 640,
                    'confidenceThreshold': 0.75,
                    'nmsThreshold': 0.4,
                    'maxDetections': 100,
                    'useInt8': True,
                    'useFp16': True,
                    'device': 'GPU',
                    'initialized': True,
                    'numClasses': 80
                }
                self.send_response(200)
                self.send_cors_headers()
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'success': True, 'config': config}).encode())
            
            else:
                self.send_response(404)
                self.send_cors_headers()
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'error': 'Not found'}).encode())
        
        except (ConnectionResetError, BrokenPipeError, OSError):
            # Client disconnected - normal, don't log
            pass
        except Exception as e:
            # Catch any unexpected errors in the entire request handler
            self.bridge_node.get_logger().warning(f'Request handler error (non-fatal): {e}', exc_info=False)
            try:
                # Try to send error response if connection is still open
                self.send_response(500)
                self.send_cors_headers()
                self.end_headers()
            except:
                # Connection already closed, ignore
                pass
    
    def do_OPTIONS(self):
        """Handle CORS preflight requests"""
        self.send_cors_headers()
        self.send_response(200)
        self.end_headers()
    
    def send_cors_headers(self):
        """Send CORS headers"""
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
    
    # log_message is already defined above - remove this duplicate


def create_handler(bridge_node: VisionBridgeNode):
    """Factory function to create HTTP handler with bridge node"""
    def handler(*args, **kwargs):
        return VisionHTTPHandler(bridge_node, *args, **kwargs)
    return handler


def main():
    # Filter out ROS 2 arguments (--ros-args, --params-file, etc.)
    import sys
    filtered_args = []
    skip_next = False
    for i, arg in enumerate(sys.argv[1:], 1):
        if skip_next:
            skip_next = False
            continue
        if arg in ['--ros-args', '-r', '--params-file']:
            skip_next = True
            continue
        if arg.startswith('__node:=') or arg.startswith('--params-file'):
            continue
        filtered_args.append(arg)
    
    parser = argparse.ArgumentParser(description='Vision Diagnostics HTTP Bridge')
    parser.add_argument('--port', type=int, default=8767, help='HTTP server port (default: 8767)')
    parser.add_argument('--host', type=str, default='0.0.0.0', help='HTTP server host (default: 0.0.0.0)')
    args = parser.parse_args(filtered_args)
    
    # Initialize ROS 2
    rclpy.init()
    
    # Create bridge node
    bridge_node = VisionBridgeNode()
    
    # Create HTTP server in separate thread
    httpd = HTTPServer((args.host, args.port), create_handler(bridge_node))
    
    print(f'Vision diagnostics bridge server starting on http://{args.host}:{args.port}')
    print('Endpoints:')
    print('  GET /api/vision/camera - Latest camera image (JPEG)')
    print('  GET /api/vision/camera/stream - MJPEG stream of camera feed')
    print('  GET /api/vision/visualization - Latest visualization with overlays (JPEG)')
    print('  GET /api/vision/visualization/stream - MJPEG stream of visualization with YOLO overlays')
    print('  GET /api/vision/detections - Latest detections (JSON)')
    print('  GET /api/vision/status - Topic status and statistics (JSON)')
    print('  GET /api/vision/config - YOLO configuration (JSON)')
    
    # Run HTTP server in separate thread with comprehensive error handling and watchdog
    # Use a closure to capture httpd variable properly
    http_server_running = threading.Event()
    http_server_running.set()
    
    def run_http_server():
        server = httpd  # Capture in closure
        max_restarts = 5
        restart_count = 0
        
        while restart_count < max_restarts:
            try:
                http_server_running.set()
                server.serve_forever()
                # If serve_forever returns, server was shut down normally
                break
            except KeyboardInterrupt:
                # Normal shutdown
                break
            except Exception as e:
                restart_count += 1
                http_server_running.clear()
                # Log the error
                try:
                    bridge_node.get_logger().error(f'HTTP server thread crashed (attempt {restart_count}/{max_restarts}): {e}')
                except:
                    # If logging fails, print to stderr
                    print(f'HTTP server thread crashed (attempt {restart_count}/{max_restarts}): {e}', file=sys.stderr)
                
                if restart_count < max_restarts:
                    # Wait before restarting
                    time.sleep(2)
                    try:
                        # Try to create a new server
                        server.server_close()
                    except:
                        pass
                    try:
                        server = HTTPServer((args.host, args.port), create_handler(bridge_node))
                        bridge_node.get_logger().info(f'HTTP server restarted (attempt {restart_count})')
                    except Exception as restart_error:
                        bridge_node.get_logger().error(f'Failed to restart HTTP server: {restart_error}')
                        break
                else:
                    bridge_node.get_logger().error('HTTP server failed too many times, giving up')
                    break
    
    http_thread = threading.Thread(target=run_http_server, daemon=True)
    http_thread.start()
    
    # Monitor HTTP server health
    def monitor_http_server():
        while True:
            time.sleep(10)  # Check every 10 seconds
            if not http_server_running.is_set():
                # Server thread crashed, try to restart
                bridge_node.get_logger().warning('HTTP server thread not running, attempting restart...')
                # The run_http_server function will handle restart
                time.sleep(5)
    
    monitor_thread = threading.Thread(target=monitor_http_server, daemon=True)
    monitor_thread.start()
    
    # Spin ROS 2 node
    try:
        rclpy.spin(bridge_node)
    except KeyboardInterrupt:
        pass
    finally:
        httpd.shutdown()
        bridge_node.destroy_node()
        rclpy.shutdown()


if __name__ == '__main__':
    main()
