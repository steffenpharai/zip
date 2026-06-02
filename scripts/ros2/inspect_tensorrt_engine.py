#!/usr/bin/env python3
"""Inspect TensorRT engine to see input/output shapes"""
import tensorrt as trt
import sys

if len(sys.argv) < 2:
    print("Usage: inspect_tensorrt_engine.py <engine_file>")
    sys.exit(1)

engine_path = sys.argv[1]

logger = trt.Logger(trt.Logger.WARNING)
runtime = trt.Runtime(logger)

with open(engine_path, 'rb') as f:
    engine_data = f.read()
    engine = runtime.deserialize_cuda_engine(engine_data)

print(f"Engine: {engine_path}")
print(f"Number of I/O tensors: {engine.num_io_tensors}")
print()

for i in range(engine.num_io_tensors):
    tensor_name = engine.get_tensor_name(i)
    io_mode = engine.get_tensor_mode(tensor_name)
    shape = engine.get_tensor_shape(tensor_name)
    
    mode_str = "INPUT" if io_mode == trt.TensorIOMode.INPUT else "OUTPUT"
    
    print(f"{mode_str}: {tensor_name}")
    print(f"  Shape: {shape}")
    print(f"  Type: {type(shape)}")
    print(f"  Dir: {[x for x in dir(shape) if not x.startswith('_')]}")
    print()
