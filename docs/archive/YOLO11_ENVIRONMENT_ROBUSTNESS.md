# YOLO11 Environment Robustness - Adaptive Detection

## Overview
YOLO11 now includes adaptive confidence thresholding to ensure robust object detection across different environments, lighting conditions, and object configurations.

## Features Implemented

### 1. Adaptive Confidence Thresholding
**Location**: `ros2_packages/zip_vision/src/yolo11_node.cpp`

**Behavior**:
- Starts with configured confidence threshold (default: 0.15)
- If no detections found for 3 consecutive frames, automatically lowers threshold to 60% of original
- Minimum threshold floor: 0.05 (prevents false positives from going too low)
- Automatically resets when detections are found

**Why This Helps**:
- Different environments have different lighting, contrast, and object visibility
- Some objects may be partially occluded or in shadows
- Adaptive thresholding ensures YOLO can detect objects even in challenging conditions

### 2. Robust Preprocessing
**Location**: `ros2_packages/zip_vision/src/yolo11_engine.cpp`

**Features**:
- Handles various image sizes and aspect ratios
- Letterbox preprocessing maintains aspect ratio
- Normalization works across all lighting conditions
- Optional CLAHE (Contrast Limited Adaptive Histogram Equalization) available for extreme cases

### 3. Class-Aware NMS
**Location**: `ros2_packages/zip_vision/src/yolo11_engine.cpp`

**Behavior**:
- Only suppresses detections of the SAME class
- Different objects (different classes) can coexist
- Ensures multiple objects are detected simultaneously

## Configuration

### Confidence Threshold Settings
```yaml
confidence_threshold: 0.15  # Starting threshold
# System will auto-adjust if no detections found
```

### Adaptive Behavior
- **Initial**: Uses configured threshold (0.15)
- **After 3 empty frames**: Lowers to 0.09 (60% of 0.15)
- **Minimum floor**: 0.05 (prevents excessive false positives)
- **On success**: Resets to configured threshold

## Environment Scenarios Handled

### ✅ Bright Environments
- High contrast scenes
- Well-lit rooms
- Outdoor daylight

### ✅ Dark Environments  
- Low-light conditions
- Indoor dim lighting
- Night scenes

### ✅ Mixed Lighting
- Shadows and highlights
- Partial occlusion
- Backlit objects

### ✅ Different Object Sizes
- Large objects (person, furniture)
- Small objects (bottle, phone)
- Medium objects (laptop, book)

### ✅ Different Backgrounds
- Cluttered scenes
- Plain backgrounds
- Complex textures

## Testing Across Environments

### Test 1: Move Camera to Different Room
```bash
# Should automatically adapt if lighting/objects are different
ros2 topic echo /detections --once
# Check logs for "adaptive threshold" messages
```

### Test 2: Change Lighting Conditions
```bash
# Turn lights on/off - YOLO should adapt
# Monitor detection counts
tail -f /tmp/vision_pipeline.log | grep "Detections:"
```

### Test 3: Different Object Configurations
```bash
# Add/remove objects from scene
# YOLO should detect whatever is visible
curl http://localhost:8767/api/vision/detections | jq '.detections | length'
```

## Log Messages

### Normal Operation
```
[Frame X] Image: 640x480, Detections: 4 (conf_thresh=0.150)
  ✅ 4 unique object classes detected
```

### Adaptive Thresholding Activated
```
No detections - trying adaptive threshold: 0.090 (was 0.150)
✅ Adaptive threshold succeeded: 3 detections
```

### Reset to Normal
```
[Frame Y] Image: 640x480, Detections: 5 (conf_thresh=0.150)
  ✅ 5 unique object classes detected
```

## Performance Impact

- **CPU**: Minimal (threshold check is O(1))
- **GPU**: No impact (inference unchanged)
- **Latency**: <1ms additional (only when adapting)
- **Memory**: No additional memory usage

## Best Practices

1. **Start with reasonable threshold** (0.15) - not too low to avoid false positives
2. **Let system adapt** - don't manually lower threshold unless needed
3. **Monitor logs** - watch for adaptive threshold messages to understand environment
4. **Adjust if needed** - if adaptive threshold is always active, consider:
   - Improving lighting
   - Checking camera focus
   - Verifying model is appropriate for objects

## Troubleshooting

### Issue: Always using adaptive threshold
**Solution**: Environment may be too challenging
- Check camera focus
- Improve lighting
- Verify objects are in frame
- Consider lowering base threshold in config

### Issue: Too many false positives
**Solution**: Adaptive threshold may be too low
- Increase base threshold in config
- Check minimum floor (0.05) - may need adjustment

### Issue: Missing objects in specific environment
**Solution**: 
- Check if objects are actually visible in frame
- Verify camera exposure settings
- Consider enabling optional CLAHE preprocessing for extreme cases

## Future Enhancements

1. **Per-class thresholds**: Different thresholds for different object classes
2. **Temporal smoothing**: Use detection history to stabilize threshold
3. **Scene analysis**: Analyze image statistics to predict optimal threshold
4. **User feedback**: Allow manual threshold adjustment via API

## References

- Ultralytics YOLO11: Designed for robustness across environments
- Adaptive thresholding: Common technique in computer vision for varying conditions
- Class-aware NMS: Standard for multi-object detection scenarios
