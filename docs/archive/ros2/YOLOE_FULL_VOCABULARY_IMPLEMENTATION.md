# YOLOE Full Vocabulary Implementation

## Overview

The vision system now uses **YOLOE-11L-seg-pf** (Prompt-Free) with the full vocabulary of **4,585 classes** from the RAM++ tag set. This replaces the previous LVIS-based implementation (1,203 classes) and provides significantly better object detection coverage.

## Model Details

- **Model**: `yoloe-11l-seg-pf_640_fp16.engine`
- **Vocabulary**: 4,585 classes (RAM++ tag set)
- **Input Size**: 640x640
- **Precision**: FP16
- **Location**: `ros2_packages/zip_vision/models/yoloe/yoloe-11l-seg-pf_640_fp16.engine`

## Key Changes

### Removed LVIS Dependency
- All LVIS class name imports removed
- No longer using `lvis_class_names.py`
- System uses `model.names` directly from the TensorRT engine

### Model Export
- Export scripts updated to ensure full vocabulary preservation
- No `single_cls=True` flag (which would limit to 1 class)
- Export verification checks for 4585+ class names

### Code Updates
- `yoloe_ros_node.py`: Uses `model.names` directly (4585 classes)
- `vision_diagnostics_bridge.py`: Loads class names from engine file
- Both components verify model has full vocabulary before use

## Verification

The system verifies the model has the correct vocabulary:
- Model head: `nc=1` (single detection head, normal for prompt-free models)
- Model names: 4585 classes (full vocabulary)
- Detections show varied class IDs (not all `class_id=0`)

## Example Detections

The model correctly detects diverse objects:
- `person` (classId: 2163)
- `computer chair` (classId: 1060)
- `blind` (classId: 467)
- `smartphone` (classId: 809)
- `musician` (classId: 2758)
- `composer` (classId: 1055)

## Export Process

To export a new engine with full vocabulary:

```bash
cd /home/steffen/Projects/Zip
bash scripts/ros2/export_yolo11_to_tensorrt.sh yoloe-11l-seg-pf 640 fp16
```

The export script will:
1. Load the model and verify it has 4585 class names
2. Export to TensorRT with full vocabulary preserved
3. Verify the exported engine has 4585+ class names
4. Save to `~/ros2_ws/src/zip_vision/models/yoloe/yoloe-11l-seg-pf_640_fp16.engine`

## Troubleshooting

### All detections show `class_id=0`
- **Cause**: Engine was exported with `single_cls=True`
- **Solution**: Re-export the engine without `single_cls` flag

### Model shows only 1 class
- **Cause**: TensorRT engine doesn't preserve class names properly
- **Solution**: Use the pre-exported engine from the repository

### Class names not displaying
- **Cause**: `model.names` not loaded correctly
- **Solution**: Check logs for "Loaded 4585 class names from engine" message

## Performance

- **FPS**: ~4-5 FPS on Jetson Orin Nano
- **Memory**: ~800MB-1.2GB for vision service
- **GPU**: ~300MB TensorRT context
- **Latency**: ~200-250ms per frame

## References

- Ultralytics YOLOE Documentation: https://docs.ultralytics.com/models/yoloe/
- RAM++ Tag Set: Recognize Anything Model Plus vocabulary
- TensorRT Export Guide: `scripts/ros2/export_yolo11_to_tensorrt.sh`
