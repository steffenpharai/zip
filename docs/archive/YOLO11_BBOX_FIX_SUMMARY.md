# YOLO11 Bounding Box Fix Summary

## Problem Identified

All YOLO detections were showing the same bbox coordinates `(320, 240, 320, 240)` - the center of a 640x480 image. This resulted in a single purple placeholder box in the camera stream instead of dynamic overlays for all detected objects.

## Root Cause Analysis

Based on investigation and NVIDIA/Ultralytics best practices, the issue is likely caused by:

1. **INT8 Quantization Calibration Issue**: The INT8 TensorRT engine was exported without a proper representative calibration dataset. Poor INT8 calibration can cause bbox regression outputs to collapse to constant values, especially for location predictions.

2. **Output Format Verification Needed**: The output buffer reading logic appears correct, but we need to verify the actual TensorRT engine output format matches expectations.

3. **Missing Diagnostic Logging**: There was no way to verify if the TensorRT output buffer contained valid, varying values before postprocessing.

## Fixes Implemented

### 1. Enhanced Diagnostic Logging (`yolo11_engine.cpp`)

Added comprehensive diagnostic logging to:
- Verify raw TensorRT output buffer values
- Detect if all bbox values are identical (the bug)
- Log output dimensions and layout detection
- Sample first 20 detections to check variance
- Provide detailed error messages with recommendations

**Key additions:**
- Raw output diagnostic logging after GPU→CPU copy
- Layout detection with variance testing for unknown formats
- Bbox value variance checking
- NaN/Inf detection in output buffer

### 2. Improved Layout Detection (`yolo11_engine.cpp`)

Enhanced the output format detection to:
- Log actual output dimensions for debugging
- Handle unknown layouts by sampling values to infer format
- Provide clear error messages when layout is ambiguous
- Support both feature-major `[1, 84, 8400]` and detection-major `[1, 8400, 84]` layouts

### 3. Updated Export Script (`export_yolo11_to_tensorrt.sh`)

Improved INT8 export to follow NVIDIA best practices:
- Check for calibration dataset via `YOLO11_CALIBRATION_DATA` environment variable
- Attempt to use COCO dataset for calibration if available
- Provide clear warnings when using default fallback dataset
- Document the risk of bbox regression collapse with poor calibration

### 4. Engine Verification Script (`verify_tensorrt_engine_output.py`)

Created a diagnostic script to:
- Load and test TensorRT engine output
- Verify bbox values vary across detections
- Identify if engine has the identical bbox issue
- Provide recommendations for fixing the issue

### 5. Default to FP16 (`yolo11_node.cpp`)

Changed default precision from INT8 to FP16:
- INT8 requires proper calibration to avoid bbox collapse
- FP16 is more reliable and still provides good performance on Jetson
- INT8 can still be used via `YOLO11_PRECISION=int8` environment variable

## Next Steps

### Immediate Actions

1. **Verify Current Engine Output**
   ```bash
   python3 scripts/ros2/verify_tensorrt_engine_output.py \
     ros2_packages/zip_vision/models/yolo11/yolo11n_640_int8.engine
   ```
   
   This will tell you if the current INT8 engine has the bbox collapse issue.

2. **Re-export with FP16 (Recommended)**
   ```bash
   ./scripts/ros2/export_yolo11_to_tensorrt.sh yolo11n 640 fp16
   ```
   
   FP16 provides good performance on Jetson Orin Nano without calibration issues.

3. **If INT8 is Required, Re-export with Proper Calibration**
   ```bash
   # Set calibration dataset (use representative images from your use case)
   export YOLO11_CALIBRATION_DATA=/path/to/calibration/images
   
   # Re-export INT8 engine
   ./scripts/ros2/export_yolo11_to_tensorrt.sh yolo11n 640 int8
   ```

### Testing

1. **Run the diagnostic script** to verify engine output
2. **Check YOLO node logs** - the new diagnostic logging will show:
   - Raw output values
   - Whether bbox values are identical
   - Output format detection
   - Recommendations if issues are found

3. **Monitor camera stream** - you should now see:
   - Multiple dynamic overlays for different objects
   - Correct bbox coordinates for each detection
   - No single purple placeholder box

### NVIDIA Best Practices Followed

✅ **Proper Calibration Dataset**: Export script now checks for calibration data  
✅ **Dynamic Shapes**: Ultralytics automatically enables dynamic shapes for INT8  
✅ **Output Format Verification**: Added comprehensive format detection  
✅ **Diagnostic Logging**: Added detailed logging for troubleshooting  
✅ **Fallback to FP16**: Default to more reliable precision  

## Expected Behavior After Fix

- **Multiple dynamic overlays**: Each detected object gets its own bbox overlay
- **Correct coordinates**: Bbox coordinates match actual object locations
- **Varying bbox values**: Different detections have different bbox coordinates
- **Proper visualization**: Camera stream shows all detections correctly

## Diagnostic Output Examples

### Good Output (FP16 or properly calibrated INT8)
```
[YOLO11 RAW OUTPUT DIAGNOSTIC] Call 1:
  Output elements: 705600, Expected: 705600
  First detection bbox (raw): x=0.452341, y=0.312456, w=0.123456, h=0.234567
  ✓ Bbox values vary across detections (expected behavior)
```

### Bad Output (Poorly calibrated INT8)
```
[YOLO11 RAW OUTPUT DIAGNOSTIC] Call 1:
  Output elements: 705600, Expected: 705600
  First detection bbox (raw): x=0.500000, y=0.500000, w=0.000000, h=0.000000
  ⚠⚠⚠ CRITICAL: All 20 sampled detections have IDENTICAL bbox values!
  This indicates TensorRT engine output issue or incorrect buffer reading.
```

## References

- [Ultralytics TensorRT Integration](https://docs.ultralytics.com/integrations/tensorrt/)
- [NVIDIA TensorRT Best Practices](https://docs.nvidia.com/deeplearning/tensorrt/)
- [YOLO11 Export Documentation](https://docs.ultralytics.com/modes/export/)

## Files Modified

1. `ros2_packages/zip_vision/src/yolo11_engine.cpp` - Added diagnostic logging and improved layout detection
2. `ros2_packages/zip_vision/src/yolo11_node.cpp` - Changed default to FP16
3. `scripts/ros2/export_yolo11_to_tensorrt.sh` - Improved INT8 calibration handling
4. `scripts/ros2/verify_tensorrt_engine_output.py` - New diagnostic script
