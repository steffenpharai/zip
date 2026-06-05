#!/usr/bin/env python3
"""
Convert ONNX model to TensorRT engine using Python API
Works better for static models than trtexec
"""
import tensorrt as trt
import sys
import os

def build_engine(onnx_path, engine_path, precision='fp16', workspace_size=4096):
    """Build TensorRT engine from ONNX model"""
    TRT_LOGGER = trt.Logger(trt.Logger.WARNING)
    
    # Create builder and network
    builder = trt.Builder(TRT_LOGGER)
    network = builder.create_network(1 << int(trt.NetworkDefinitionCreationFlag.EXPLICIT_BATCH))
    parser = trt.OnnxParser(network, TRT_LOGGER)
    
    # Parse ONNX model
    print(f"Loading ONNX model: {onnx_path}")
    with open(onnx_path, 'rb') as model:
        if not parser.parse(model.read()):
            print("ERROR: Failed to parse ONNX file")
            for error in range(parser.num_errors):
                print(parser.get_error(error))
            return False
    
    print(f"Building TensorRT engine (precision: {precision})...")
    
    # Configure builder
    config = builder.create_builder_config()
    config.set_memory_pool_limit(trt.MemoryPoolType.WORKSPACE, workspace_size * 1024 * 1024)  # MB to bytes
    
    # Set precision
    if precision == 'fp16':
        if builder.platform_has_fast_fp16:
            config.set_flag(trt.BuilderFlag.FP16)
            print("Using FP16 precision")
        else:
            print("Warning: FP16 not supported, using FP32")
    elif precision == 'int8':
        if builder.platform_has_fast_int8:
            config.set_flag(trt.BuilderFlag.INT8)
            print("Using INT8 precision")
        else:
            print("Warning: INT8 not supported, using FP16")
            config.set_flag(trt.BuilderFlag.FP16)
    
    # Build engine (TensorRT 10.x API)
    print("Building engine (this may take several minutes)...")
    serialized_engine = builder.build_serialized_network(network, config)
    
    if serialized_engine is None:
        print("ERROR: Failed to build engine")
        return False
    
    # Save engine
    print(f"Saving engine to: {engine_path}")
    with open(engine_path, 'wb') as f:
        f.write(serialized_engine)
    
    print("Engine built successfully!")
    return True

if __name__ == '__main__':
    if len(sys.argv) < 3:
        print("Usage: convert_onnx_to_tensorrt.py <onnx_path> <engine_path> [precision] [workspace_mb]")
        print("  precision: fp16 (default) or int8")
        print("  workspace_mb: workspace size in MB (default: 4096)")
        sys.exit(1)
    
    onnx_path = sys.argv[1]
    engine_path = sys.argv[2]
    precision = sys.argv[3] if len(sys.argv) > 3 else 'fp16'
    workspace_size = int(sys.argv[4]) if len(sys.argv) > 4 else 4096
    
    if not os.path.exists(onnx_path):
        print(f"ERROR: ONNX file not found: {onnx_path}")
        sys.exit(1)
    
    # Create output directory
    os.makedirs(os.path.dirname(engine_path) if os.path.dirname(engine_path) else '.', exist_ok=True)
    
    success = build_engine(onnx_path, engine_path, precision, workspace_size)
    sys.exit(0 if success else 1)
