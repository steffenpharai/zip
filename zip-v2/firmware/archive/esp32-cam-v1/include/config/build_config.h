/**
 * Build Configuration - Compile-Time Feature Flags
 * 
 * These flags control which features are compiled into the firmware.
 * They can be overridden via platformio.ini build_flags.
 * 
 * Usage in platformio.ini:
 *   build_flags = -DENABLE_CAMERA=0  ; Disable camera
 */

#ifndef BUILD_CONFIG_H
#define BUILD_CONFIG_H

// ============================================================================
// Feature Flags
// ============================================================================
// Each feature can be enabled (1) or disabled (0).
// Disabled features are not compiled, reducing binary size.

// Camera subsystem
#ifndef ENABLE_CAMERA
#define ENABLE_CAMERA               1
#endif

// UART bridge to robot shield
#ifndef ENABLE_UART
#define ENABLE_UART                 1
#endif

// MJPEG streaming server (port 81)
#ifndef ENABLE_STREAM
#define ENABLE_STREAM               1
#endif

// Verbose logging (debug builds only)
#ifndef ENABLE_VERBOSE_LOGS
#define ENABLE_VERBOSE_LOGS         0
#endif

// Self-test mode at boot
#ifndef ENABLE_SELF_TEST
#define ENABLE_SELF_TEST            0
#endif

// UART loopback test mode (for hardware debugging)
#ifndef ENABLE_UART_LOOPBACK
#define ENABLE_UART_LOOPBACK        0
#endif

// Health endpoint (/health JSON)
#ifndef ENABLE_HEALTH_ENDPOINT
#define ENABLE_HEALTH_ENDPOINT      1
#endif

// Metrics endpoint (/metrics plaintext)
#ifndef ENABLE_METRICS_ENDPOINT
#define ENABLE_METRICS_ENDPOINT     0
#endif

// ============================================================================
// Debug Flags
// ============================================================================

// Print camera frame timing
#ifndef DEBUG_CAMERA_TIMING
#define DEBUG_CAMERA_TIMING         0
#endif

// Print UART frame contents
#ifndef DEBUG_UART_FRAMES
#define DEBUG_UART_FRAMES           0
#endif

// Print WiFi events
#ifndef DEBUG_WIFI_EVENTS
#define DEBUG_WIFI_EVENTS           0
#endif

// ============================================================================
// Build Validation
// ============================================================================
// Ensure dependent features are enabled

#if ENABLE_STREAM && !ENABLE_CAMERA
#warning "ENABLE_STREAM requires ENABLE_CAMERA - stream will return 503"
#endif

#if ENABLE_UART_LOOPBACK && !ENABLE_UART
#error "ENABLE_UART_LOOPBACK requires ENABLE_UART"
#endif

// ============================================================================
// Logging Macros
// ============================================================================
// Structured logging with subsystem prefixes

#if ENABLE_VERBOSE_LOGS
#define LOG_V(tag, fmt, ...) Serial.printf("[%s] " fmt "\n", tag, ##__VA_ARGS__)
#else
#define LOG_V(tag, fmt, ...) do {} while(0)
#endif

// Safe logging macros that check Serial buffer space to prevent blocking
// Skip logging if buffer has less than 100 bytes available (prevents blocking)
// Note: Watchdog reset should be done at call site, not in macro (not available everywhere)
#define SAFE_SERIAL_PRINTF(fmt, ...) do { \
    if (Serial.availableForWrite() >= 100) { \
        Serial.printf(fmt, ##__VA_ARGS__); \
    } \
} while(0)

#define LOG_I(tag, fmt, ...) SAFE_SERIAL_PRINTF("[%s] " fmt "\n", tag, ##__VA_ARGS__)
#define LOG_W(tag, fmt, ...) SAFE_SERIAL_PRINTF("[%s] WARN: " fmt "\n", tag, ##__VA_ARGS__)
#define LOG_E(tag, fmt, ...) SAFE_SERIAL_PRINTF("[%s] ERROR: " fmt "\n", tag, ##__VA_ARGS__)

#endif // BUILD_CONFIG_H

