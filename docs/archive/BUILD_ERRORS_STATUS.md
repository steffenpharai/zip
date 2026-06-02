# Build Errors Status Report

## Fixed Issues ✅

### 1. zip_core - Missing include/ directory
**Status**: ✅ **FIXED**
- Made `include_directories()` and `install(DIRECTORY include/)` conditional
- Build now succeeds

### 2. zip_vision - Missing include/launch/config directories
**Status**: ✅ **FIXED**
- Made all directory installs conditional
- No longer fails on missing directories

## Remaining Issue ⚠️

### zip_vision - CUDA/TensorRT Linking
**Status**: ⚠️ **IN PROGRESS**

**Error**: Undefined references from `/usr/local/cuda/compat/` libraries:
- `libcuda.so` (compat) - missing NvRm* symbols
- `libnvcudla.so` (compat) - missing nvdla::* symbols
- `libnvinfer.so` - missing nvdla::* symbols

**Root Cause**: 
- TensorRT libraries (`libnvinfer.so`) have dependencies on CUDA compat libraries
- Compat libraries are incomplete compatibility shims with missing symbols
- Linker is finding compat libraries before system libraries

**Fixes Applied**:
1. ✅ Filtered out compat libraries from CUDA_LIBRARIES
2. ✅ Explicitly linked to system `/usr/lib/aarch64-linux-gnu/libcuda.so`
3. ✅ Added shared CUDA runtime library
4. ✅ Added linker flags to exclude compat libraries
5. ✅ Set rpath to prioritize system libraries

**Current Status**: 
- 5 packages build successfully
- zip_vision still fails due to TensorRT's dependency on compat libraries

## Build Summary

- ✅ **5 packages built**: zip_bridge, zip_control, zip_core, zip_orchestration, zip_voice
- ⚠️ **1 package failing**: zip_vision (CUDA compat library issue)

## Next Steps

The CUDA compat library issue may require:
1. Building zip_vision without YOLO11 (if not needed immediately)
2. Using a different TensorRT version
3. Adding missing NVIDIA runtime libraries to the container
4. Building YOLO11 as a separate optional component

## Workaround

For now, the workspace can be used with 5 packages. The vision pipeline can be built separately or the YOLO11 component can be disabled if not immediately needed.
