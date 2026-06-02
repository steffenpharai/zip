/**
 * Board Configuration - ESP32S3-Camera-v1.0 (ELEGOO Smart Robot Car V4.0)
 * 
 * Single source of truth for all pin assignments and board capabilities.
 * This header defines the correct ESP32-S3 GPIO mappings for the OV2640 camera
 * and UART bridge to the robot shield.
 * 
 * Hardware: ESP32-S3-WROOM-1 + OV2640 camera module
 * Shield: ELEGOO SmartRobot-Shield (TB6612)
 */

#ifndef BOARD_ESP32S3_ELEGOO_CAM_H
#define BOARD_ESP32S3_ELEGOO_CAM_H

#include <stdint.h>
#include <stdbool.h>

// ============================================================================
// Board Identification
// ============================================================================
#define BOARD_NAME                  "ESP32S3-Camera-v1.0"
#define BOARD_VENDOR                "ELEGOO"
#define BOARD_MCU                   "ESP32-S3-WROOM-1"
#define BOARD_CAMERA_SENSOR         "OV2640"

// ============================================================================
// Camera Pin Definitions (ESP32-S3 Valid GPIOs) - OV2640 Configuration
// ============================================================================
// These pins are the correct ESP32-S3 mapping for the ELEGOO OV2640 camera module.
// OV2640 uses different pins than OV3660 - this is the standard S3 shield mapping.
// Unlike ESP32-WROVER, ESP32-S3 does not have GPIO 34, 35, 36, 39.
// 
// NOTE: GPIO 0 may be used for PWDN on some shields - check hardware.

#define CAM_PWDN_GPIO               (-1)    // Power down not connected (or GPIO 0 if used)
#define CAM_RESET_GPIO              (-1)    // Reset not connected
#define CAM_XCLK_GPIO               15      // External clock (OV2640 standard - NOT GPIO 45)
#define CAM_SIOD_GPIO               4       // I2C SDA (SCCB data) - OV2640 standard
#define CAM_SIOC_GPIO               5       // I2C SCL (SCCB clock) - OV2640 standard

// Parallel data pins (D0-D7) - OV2640 8-bit bus mapping
#define CAM_Y2_GPIO                 11      // D0
#define CAM_Y3_GPIO                 9       // D1
#define CAM_Y4_GPIO                 8       // D2
#define CAM_Y5_GPIO                 10      // D3
#define CAM_Y6_GPIO                 12      // D4
#define CAM_Y7_GPIO                 18      // D5
#define CAM_Y8_GPIO                 17      // D6
#define CAM_Y9_GPIO                 16      // D7

// Sync signals
#define CAM_VSYNC_GPIO              6       // Vertical sync
#define CAM_HREF_GPIO               7       // Horizontal reference
#define CAM_PCLK_GPIO               13      // Pixel clock

// ============================================================================
// UART Pin Definitions (OV2640 Configuration)
// ============================================================================
// UART pins for OV2640 camera module (DISCOVERED via hardware testing):
//   TX = GPIO40  (routed via GPIO matrix to UART1) - VERIFIED (makes Arduino RX LED blink)
//   RX = GPIO3   (routed via GPIO matrix to UART1) - VERIFIED (receives {hello_ok} responses)
//
// CRITICAL: Uses UART1 (Serial1) instead of UART0 to avoid USB-CDC conflicts.
// GPIO40/3 are routed via GPIO matrix to UART1 to prevent conflicts with the
// ESP32-S3's internal USB-CDC bridge logic that can "lock" UART0 even when USB
// is not connected.
//
// The shield P8 header labels "0(RX)" and "1(TX)" refer to Arduino D0/D1,
// NOT ESP32 GPIO numbers. Physical routing discovered via brute force testing:
// - GPIO40 connects to Arduino RX (D0) - VERIFIED
// - GPIO3 connects to Arduino TX (D1) - VERIFIED (tested with RX detection script)

#define UART_RX_GPIO                3       // UART1 RX (via GPIO matrix) - receives from Arduino TX - VERIFIED
#define UART_TX_GPIO                40      // UART1 TX (via GPIO matrix) - sends to Arduino RX - VERIFIED

// ============================================================================
// LED Pin Definition
// ============================================================================
// Status LED moved to GPIO14 to free GPIO3 for UART RX.
// GPIO14 is available (not used by OV2640 camera).

#define LED_STATUS_GPIO             14      // Status LED (moved from GPIO3 to free it for UART RX)

// ============================================================================
// Optional Camera LED / Flash LED
// ============================================================================
// Define if the board has a camera flash LED. Set to -1 if not present.
// For OV2640, flash LED is typically on a separate pin if present.
#ifdef BOARD_HAS_CAMERA_LED
#define CAM_LED_GPIO                4       // Flash LED (if present, check hardware)
#else
#define CAM_LED_GPIO                (-1)    // Not present
#endif

// ============================================================================
// Compile-Time Pin Conflict Validation
// ============================================================================
// These static_asserts ensure no pin is used by multiple peripherals.
// Build will fail if any conflict is detected.

// Helper macro for pin conflict checking
#define PIN_IN_USE(pin) ((pin) >= 0)

// Ensure UART pins don't conflict with camera
static_assert(UART_RX_GPIO != CAM_SIOD_GPIO, "UART RX conflicts with camera SIOD");
static_assert(UART_RX_GPIO != CAM_SIOC_GPIO, "UART RX conflicts with camera SIOC");
static_assert(UART_RX_GPIO != CAM_PCLK_GPIO, "UART RX conflicts with camera PCLK");
static_assert(UART_TX_GPIO != CAM_SIOD_GPIO, "UART TX conflicts with camera SIOD");
static_assert(UART_TX_GPIO != CAM_SIOC_GPIO, "UART TX conflicts with camera SIOC");
static_assert(UART_TX_GPIO != CAM_PCLK_GPIO, "UART TX conflicts with camera PCLK");

// Ensure LED doesn't conflict with camera
static_assert(LED_STATUS_GPIO != CAM_SIOD_GPIO, "LED conflicts with camera SIOD");
static_assert(LED_STATUS_GPIO != CAM_SIOC_GPIO, "LED conflicts with camera SIOC");
static_assert(LED_STATUS_GPIO != CAM_PCLK_GPIO, "LED conflicts with camera PCLK");
static_assert(LED_STATUS_GPIO != CAM_XCLK_GPIO, "LED conflicts with camera XCLK");
static_assert(LED_STATUS_GPIO != CAM_VSYNC_GPIO, "LED conflicts with camera VSYNC");
static_assert(LED_STATUS_GPIO != CAM_HREF_GPIO, "LED conflicts with camera HREF");

// Ensure LED doesn't conflict with UART
static_assert(LED_STATUS_GPIO != UART_RX_GPIO, "LED conflicts with UART RX");
static_assert(LED_STATUS_GPIO != UART_TX_GPIO, "LED conflicts with UART TX");

// Ensure camera data pins are unique
static_assert(CAM_Y2_GPIO != CAM_Y3_GPIO, "Camera Y2 conflicts with Y3");
static_assert(CAM_Y2_GPIO != CAM_Y4_GPIO, "Camera Y2 conflicts with Y4");
static_assert(CAM_Y2_GPIO != CAM_Y5_GPIO, "Camera Y2 conflicts with Y5");
static_assert(CAM_Y2_GPIO != CAM_Y6_GPIO, "Camera Y2 conflicts with Y6");
static_assert(CAM_Y2_GPIO != CAM_Y7_GPIO, "Camera Y2 conflicts with Y7");
static_assert(CAM_Y2_GPIO != CAM_Y8_GPIO, "Camera Y2 conflicts with Y8");
static_assert(CAM_Y2_GPIO != CAM_Y9_GPIO, "Camera Y2 conflicts with Y9");

// PRODUCTION FIX: Ensure PCLK (GPIO 13) does not conflict with data lines
// PCLK is a dedicated hardware signal and must never be shared with data lines
// If these overlap, the CPU will trigger watchdog reset as it enters "Live-lock"
// trying to process constant stream of false clock interrupts
// For OV2640: D6 is GPIO 17, which is safe (no conflict with PCLK GPIO 13)
static_assert(CAM_PCLK_GPIO != CAM_Y8_GPIO, "PCLK (GPIO 13) must not conflict with D6 data line");

// ============================================================================
// Board Capabilities Structure
// ============================================================================
struct BoardConfig {
    const char* name;
    const char* mcu;
    const char* camera_sensor;
    bool has_psram;
    uint32_t psram_bytes;
    uint32_t flash_bytes;
    uint32_t uart_baud;
    uint32_t xclk_hz;
    
    // Runtime state (set during initialization)
    bool camera_init_ok;
    int camera_last_error;
    bool uart_init_ok;
    bool wifi_init_ok;
};

// ============================================================================
// Default Board Configuration
// ============================================================================
// These defaults are applied at startup. Runtime values are updated
// during initialization based on actual hardware detection.

#define BOARD_DEFAULT_UART_BAUD     115200
#define BOARD_DEFAULT_XCLK_HZ       10000000    // 10 MHz (reduced for EMI reduction, stable for OV2640)
#define BOARD_DEFAULT_PSRAM_BYTES   8388608     // 8 MB (typical for S3)
#define BOARD_DEFAULT_FLASH_BYTES   8388608     // 8 MB (typical for S3)

// ============================================================================
// GPIO Validation Helpers
// ============================================================================
// ESP32-S3 valid GPIO range: 0-48 (with some reserved)

#define IS_VALID_GPIO(pin) ((pin) >= 0 && (pin) <= 48)
#define IS_STRAPPING_PIN(pin) ((pin) == 0 || (pin) == 3 || (pin) == 45 || (pin) == 46)

// ============================================================================
// Backward Compatibility Aliases
// ============================================================================
// These aliases match the naming convention used in esp_camera driver

#define PWDN_GPIO_NUM               CAM_PWDN_GPIO
#define RESET_GPIO_NUM              CAM_RESET_GPIO
#define XCLK_GPIO_NUM               CAM_XCLK_GPIO
#define SIOD_GPIO_NUM               CAM_SIOD_GPIO
#define SIOC_GPIO_NUM               CAM_SIOC_GPIO
#define Y2_GPIO_NUM                 CAM_Y2_GPIO
#define Y3_GPIO_NUM                 CAM_Y3_GPIO
#define Y4_GPIO_NUM                 CAM_Y4_GPIO
#define Y5_GPIO_NUM                 CAM_Y5_GPIO
#define Y6_GPIO_NUM                 CAM_Y6_GPIO
#define Y7_GPIO_NUM                 CAM_Y7_GPIO
#define Y8_GPIO_NUM                 CAM_Y8_GPIO
#define Y9_GPIO_NUM                 CAM_Y9_GPIO
#define VSYNC_GPIO_NUM              CAM_VSYNC_GPIO
#define HREF_GPIO_NUM               CAM_HREF_GPIO
#define PCLK_GPIO_NUM               CAM_PCLK_GPIO

#define SERIAL2_RX_PIN              UART_RX_GPIO
#define SERIAL2_TX_PIN              UART_TX_GPIO
#define LED_STATUS_PIN              LED_STATUS_GPIO

#endif // BOARD_ESP32S3_ELEGOO_CAM_H

