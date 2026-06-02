/**
 * Safe Mode Implementation - RTC Memory Tracking
 * 
 * Uses RTC_NOINIT_ATTR to persist data across resets (but not deep sleep).
 */

#include "config/safe_mode.h"
#include <string.h>
#include "esp_attr.h"

// RTC memory structure (persists across reset)
RTC_NOINIT_ATTR static SafeModeRTC s_rtc_data;

// Initialize safe mode tracking
void safe_mode_init() {
    // Check if RTC memory is valid
    if (s_rtc_data.magic != SAFE_MODE_MAGIC) {
        // Initialize fresh RTC memory
        memset(&s_rtc_data, 0, sizeof(SafeModeRTC));
        s_rtc_data.magic = SAFE_MODE_MAGIC;
        s_rtc_data.camera_fail_count = 0;
        s_rtc_data.safe_mode_enabled = 0;
    }
}

// Check if safe mode is enabled
bool safe_mode_is_enabled() {
    if (s_rtc_data.magic != SAFE_MODE_MAGIC) {
        return false;
    }
    return s_rtc_data.safe_mode_enabled != 0;
}

// Record a camera initialization failure
void safe_mode_record_failure() {
    if (s_rtc_data.magic != SAFE_MODE_MAGIC) {
        safe_mode_init();
    }
    
    s_rtc_data.camera_fail_count++;
    
    // Enable safe mode if threshold reached
    if (s_rtc_data.camera_fail_count >= SAFE_MODE_MAX_FAILURES) {
        s_rtc_data.safe_mode_enabled = 1;
    }
}

// Clear failure count (on successful init)
void safe_mode_clear_failures() {
    if (s_rtc_data.magic != SAFE_MODE_MAGIC) {
        safe_mode_init();
    }
    
    s_rtc_data.camera_fail_count = 0;
    s_rtc_data.safe_mode_enabled = 0;
}

// Get current failure count
uint8_t safe_mode_get_fail_count() {
    if (s_rtc_data.magic != SAFE_MODE_MAGIC) {
        return 0;
    }
    return s_rtc_data.camera_fail_count;
}

