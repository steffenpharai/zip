/**
 * Camera Service - Interface
 * 
 * Provides camera initialization, status tracking, and capture functionality.
 * Handles graceful degradation when camera initialization fails.
 */

#ifndef CAMERA_SERVICE_H
#define CAMERA_SERVICE_H

#include <stdint.h>
#include <stdbool.h>
#include "esp_camera.h"

// ============================================================================
// Camera Status Enumeration
// ============================================================================
enum class CameraStatus {
    OK,                 // Camera initialized and operational
    NOT_INITIALIZED,    // Camera not yet initialized
    INIT_FAILED,        // Camera initialization failed
    CAPTURE_FAILED,     // Last capture operation failed
    NO_PSRAM            // PSRAM required but not available
};

// ============================================================================
// Camera Statistics
// ============================================================================
struct CameraStats {
    uint32_t captures;          // Total successful captures
    uint32_t failures;          // Total capture failures
    uint32_t last_capture_ms;   // Duration of last capture (ms)
    uint32_t last_frame_bytes;  // Size of last captured frame
    unsigned long last_capture_time;  // Timestamp of last capture
};

// ============================================================================
// Camera Service Interface
// ============================================================================

/**
 * Initialize the camera subsystem.
 * Uses pin definitions from board_esp32s3_elegoo_cam.h.
 * 
 * @return true if initialization succeeded, false otherwise
 */
bool camera_init();

/**
 * Check if camera is operational.
 * 
 * @return true if camera is initialized and ready
 */
bool camera_is_ok();

/**
 * Get current camera status.
 * 
 * @return CameraStatus enum value
 */
CameraStatus camera_status();

/**
 * Get human-readable error message for last failure.
 * 
 * @return Error message string or "OK" if no error
 */
const char* camera_last_error();

/**
 * Get the ESP-IDF error code from last failure.
 * 
 * @return esp_err_t value (ESP_OK if no error)
 */
int camera_last_error_code();

/**
 * Get camera statistics.
 * 
 * @return CameraStats structure
 */
CameraStats camera_get_stats();

/**
 * Capture a single frame from the camera.
 * Caller must return the frame buffer using camera_return_frame().
 * 
 * @return Frame buffer pointer, or NULL on failure
 */
camera_fb_t* camera_capture();

/**
 * Return a frame buffer to the camera driver.
 * Must be called after processing each captured frame.
 * 
 * @param fb Frame buffer to return
 */
void camera_return_frame(camera_fb_t* fb);

/**
 * Set camera frame size.
 * 
 * @param framesize FRAMESIZE_* constant
 * @return true if successful
 */
bool camera_set_framesize(framesize_t framesize);

/**
 * Set JPEG quality.
 * 
 * @param quality 1-63 (lower = better quality)
 * @return true if successful
 */
bool camera_set_quality(int quality);

/**
 * Get camera sensor pointer for direct manipulation.
 * 
 * @return Sensor pointer or NULL if camera not initialized
 */
sensor_t* camera_get_sensor();

/**
 * Check if camera is currently running (initialized and operational).
 * 
 * @return true if camera is running, false otherwise
 */
bool camera_is_running();

/**
 * Stop camera (deinitialize) to free interrupts and DMA.
 * Used before WiFi initialization to prevent interrupt contention.
 * Camera config is saved for later resume.
 * 
 * @return true if stop succeeded, false otherwise
 */
bool camera_stop();

/**
 * Resume camera (reinitialize) after WiFi initialization completes.
 * Uses saved config from previous initialization.
 * 
 * @return true if resume succeeded, false otherwise
 */
bool camera_resume();

#endif // CAMERA_SERVICE_H

