/**
 * Safe Mode Configuration - RTC Memory Tracking
 * 
 * Tracks camera initialization failures across reboots to prevent
 * infinite boot loops. Uses RTC_NOINIT memory (persists across reset).
 */

#ifndef SAFE_MODE_H
#define SAFE_MODE_H

#include <stdint.h>
#include <stdbool.h>
#include "esp_attr.h"

// RTC memory structure (persists across reset, not deep sleep)
typedef struct {
    uint32_t magic;              // Magic number: 0x53414645 ("SAFE")
    uint8_t camera_fail_count;    // Number of consecutive camera init failures
    uint8_t safe_mode_enabled;   // 1 if safe mode is active
    uint16_t reserved;            // Reserved for future use
} SafeModeRTC;

// Magic number for validation
#define SAFE_MODE_MAGIC          0x53414645  // "SAFE"

// Maximum failures before entering safe mode
#define SAFE_MODE_MAX_FAILURES   3

// Function declarations
void safe_mode_init();
bool safe_mode_is_enabled();
void safe_mode_record_failure();
void safe_mode_clear_failures();
uint8_t safe_mode_get_fail_count();

#endif // SAFE_MODE_H

