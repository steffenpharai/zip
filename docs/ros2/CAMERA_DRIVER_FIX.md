# Camera Driver Fix - USB Camera Memory Mapping Issue

## Problem

The v4l2_camera node was failing with error:
```
[ERROR] [v4l2_camera]: Failed mapping device memory
```

This prevented the camera from publishing images to `/camera/image_raw`.

## Root Cause

The v4l2_camera node uses MMAP (memory mapping) by default to access camera buffers. On some systems, particularly Jetson devices, MMAP can fail due to:
1. Kernel memory mapping restrictions
2. USB buffer size limitations
3. Driver compatibility issues

## Solution

### 1. Increased Buffer Size

Updated `ros2_packages/zip_vision/config/camera_params.yaml`:
- Changed `buffer_size` from `1` to `4` to provide more buffering capacity

### 2. Camera Configuration Verified

The camera (Logitech HD Webcam C615) is properly detected:
- **Device**: `/dev/video0`
- **Driver**: `uvcvideo`
- **Format**: YUYV @ 640x480
- **Frame Rate**: 30 FPS (actual: ~25.4 FPS)

### 3. Permissions

User is in the `video` group, which provides access to `/dev/video*` devices:
```bash
groups  # Shows: ... video ...
```

## Verification

After the fix:
- ✅ Camera node starts successfully
- ✅ Camera publishes to `/camera/image_raw` at ~25.4 FPS
- ✅ No "Failed mapping device memory" errors
- ✅ Topics created: `/camera/image_raw`, `/camera/camera_info`

## Test Results

```bash
$ ros2 topic hz /camera/image_raw
average rate: 25.441
	min: 0.029s max: 0.158s std dev: 0.02396s window: 28
```

## Files Modified

- `ros2_packages/zip_vision/config/camera_params.yaml`
  - `buffer_size: 4` (increased from 1)

## Additional Notes

### Non-Critical Warnings

The following warnings are non-critical and don't affect functionality:
- `Failed getting value for control 10092545: Permission denied` - Some camera controls require root
- `Camera calibration file not found` - Calibration is optional
- `Image encoding conversion: yuv422_yuy2 => rgb8` - Normal conversion, may be slow but works

### NVIDIA Best Practices

Following NVIDIA recommendations for USB cameras on Jetson:
1. ✅ Camera detected and driver loaded (`uvcvideo`)
2. ✅ Proper permissions (user in `video` group)
3. ✅ Buffer size configured appropriately
4. ✅ Format verified with `v4l2-ctl`

## References

- [NVIDIA Jetson Camera Development Guide](https://docs.nvidia.com/jetson/)
- [ROS 2 v4l2_camera Package](https://github.com/ros-drivers/v4l2_camera)
