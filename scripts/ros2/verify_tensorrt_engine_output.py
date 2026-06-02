#!/usr/bin/env python3
"""
Verify TensorRT engine output to diagnose bbox issues
This script runs inference and checks if output values vary correctly
"""
import sys
import os
import numpy as np

# Add path for TensorRT
try:
    import tensorrt as trt
    import pycuda.driver as cuda
    import pycuda.autoinit
except ImportError as e:
    print(f"Error: Missing required packages: {e}")
    print("Install: pip3 install tensorrt pycuda")
    sys.exit(1)

def load_engine(engine_path):
    """Load TensorRT engine"""
    logger = trt.Logger(trt.Logger.WARNING)
    runtime = trt.Runtime(logger)
    
    with open(engine_path, 'rb') as f:
        engine_data = f.read()
        engine = runtime.deserialize_cuda_engine(engine_data)
    
    return engine, logger

def create_dummy_input(shape=(1, 3, 640, 640)):
    """Create dummy input for testing"""
    return np.random.rand(*shape).astype(np.float32)

def run_inference(engine, input_data):
    """Run inference and return raw output"""
    context = engine.create_execution_context()
    
    # Get tensor names
    input_tensor_name = None
    output_tensor_name = None
    
    for i in range(engine.num_io_tensors):
        tensor_name = engine.get_tensor_name(i)
        io_mode = engine.get_tensor_mode(tensor_name)
        if io_mode == trt.TensorIOMode.INPUT:
            input_tensor_name = tensor_name
        elif io_mode == trt.TensorIOMode.OUTPUT:
            output_tensor_name = tensor_name
    
    if input_tensor_name is None or output_tensor_name is None:
        raise RuntimeError("Could not find input/output tensors")
    
    # Get shapes
    input_shape = engine.get_tensor_shape(input_tensor_name)
    output_shape = engine.get_tensor_shape(output_tensor_name)
    
    print(f"Input: {input_tensor_name}, shape: {list(input_shape)}")
    print(f"Output: {output_tensor_name}, shape: {list(output_shape)}")
    
    # Allocate buffers
    input_size = trt.volume(input_shape) * np.dtype(np.float32).itemsize
    output_size = trt.volume(output_shape) * np.dtype(np.float32).itemsize
    
    d_input = cuda.mem_alloc(input_size)
    d_output = cuda.mem_alloc(output_size)
    
    stream = cuda.Stream()
    
    # Copy input to GPU
    cuda.memcpy_htod_async(d_input, input_data, stream)
    
    # Set tensor addresses
    context.set_tensor_address(input_tensor_name, int(d_input))
    context.set_tensor_address(output_tensor_name, int(d_output))
    
    # Run inference
    context.execute_async_v3(stream_handle=stream.handle)
    
    # Copy output from GPU
    output = np.empty(trt.volume(output_shape), dtype=np.float32)
    cuda.memcpy_dtoh_async(output, d_output, stream)
    stream.synchronize()
    
    return output, list(output_shape)

def analyze_bbox_variance(output, output_shape):
    """Analyze if bbox values vary across detections"""
    print("\n" + "="*80)
    print("BBOX VARIANCE ANALYSIS")
    print("="*80)
    
    if len(output_shape) != 3:
        print(f"⚠ Unexpected output shape: {output_shape}")
        return False
    
    batch, dim1, dim2 = output_shape
    output_reshaped = output.reshape(output_shape)
    
    # Determine layout
    if dim1 == 84 and dim2 == 8400:
        layout = "feature_major"
        num_features = dim1
        num_detections = dim2
        print(f"Layout: Feature-major [1, {num_features}, {num_detections}]")
    elif dim1 == 8400 and dim2 == 84:
        layout = "detection_major"
        num_features = dim2
        num_detections = dim1
        print(f"Layout: Detection-major [1, {num_detections}, {num_features}]")
    else:
        print(f"⚠ Unknown layout: [1, {dim1}, {dim2}]")
        # Assume feature-major
        layout = "feature_major"
        num_features = dim1
        num_detections = dim2
    
    # Sample first 20 detections
    num_samples = min(20, num_detections)
    bbox_values = []
    
    for i in range(num_samples):
        if layout == "feature_major":
            x = output_reshaped[0, 0, i]
            y = output_reshaped[0, 1, i]
            w = output_reshaped[0, 2, i]
            h = output_reshaped[0, 3, i]
        else:
            x = output_reshaped[0, i, 0]
            y = output_reshaped[0, i, 1]
            w = output_reshaped[0, i, 2]
            h = output_reshaped[0, i, 3]
        
        bbox_values.append((x, y, w, h))
    
    # Check if all bbox values are identical
    first_bbox = bbox_values[0]
    all_identical = all(
        abs(bbox[0] - first_bbox[0]) < 1e-6 and
        abs(bbox[1] - first_bbox[1]) < 1e-6 and
        abs(bbox[2] - first_bbox[2]) < 1e-6 and
        abs(bbox[3] - first_bbox[3]) < 1e-6
        for bbox in bbox_values
    )
    
    if all_identical:
        print(f"\n❌ CRITICAL ISSUE: All {num_samples} sampled detections have IDENTICAL bbox values!")
        print(f"   First bbox: x={first_bbox[0]:.6f}, y={first_bbox[1]:.6f}, w={first_bbox[2]:.6f}, h={first_bbox[3]:.6f}")
        print(f"\n   This indicates:")
        print(f"   1. INT8 quantization issue (poor calibration)")
        print(f"   2. Engine export problem")
        print(f"   3. Output buffer reading issue")
        print(f"\n   RECOMMENDATION: Re-export engine with FP16 or proper INT8 calibration")
        return False
    else:
        print(f"\n✓ Bbox values vary across detections (expected behavior)")
        print(f"  Sampled {num_samples} detections, all have different bbox values")
        
        # Show variance
        x_vals = [b[0] for b in bbox_values]
        y_vals = [b[1] for b in bbox_values]
        w_vals = [b[2] for b in bbox_values]
        h_vals = [b[3] for b in bbox_values]
        
        print(f"  X range: [{min(x_vals):.6f}, {max(x_vals):.6f}], std={np.std(x_vals):.6f}")
        print(f"  Y range: [{min(y_vals):.6f}, {max(y_vals):.6f}], std={np.std(y_vals):.6f}")
        print(f"  W range: [{min(w_vals):.6f}, {max(w_vals):.6f}], std={np.std(w_vals):.6f}")
        print(f"  H range: [{min(h_vals):.6f}, {max(h_vals):.6f}], std={np.std(h_vals):.6f}")
        
        return True

def main():
    if len(sys.argv) < 2:
        print("Usage: verify_tensorrt_engine_output.py <engine_path>")
        sys.exit(1)
    
    engine_path = sys.argv[1]
    
    if not os.path.exists(engine_path):
        print(f"Error: Engine file not found: {engine_path}")
        sys.exit(1)
    
    print("="*80)
    print("TENSORRT ENGINE OUTPUT VERIFICATION")
    print("="*80)
    print(f"Engine: {engine_path}\n")
    
    # Load engine
    print("Loading engine...")
    engine, logger = load_engine(engine_path)
    print("✓ Engine loaded\n")
    
    # Create dummy input
    print("Creating dummy input...")
    input_data = create_dummy_input()
    print(f"✓ Input created: {input_data.shape}\n")
    
    # Run inference
    print("Running inference...")
    output, output_shape = run_inference(engine, input_data)
    print("✓ Inference complete\n")
    
    # Analyze output
    is_valid = analyze_bbox_variance(output, output_shape)
    
    print("\n" + "="*80)
    if is_valid:
        print("VERIFICATION PASSED: Engine output appears correct")
    else:
        print("VERIFICATION FAILED: Engine output has issues")
        print("\nNext steps:")
        print("1. Try exporting with FP16 instead of INT8")
        print("2. Re-export INT8 with proper calibration dataset")
        print("3. Check engine export logs for warnings")
    print("="*80)

if __name__ == '__main__':
    main()
