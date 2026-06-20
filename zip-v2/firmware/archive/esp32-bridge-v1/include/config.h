/**
 * ZIP ESP32 Bridge - Configuration
 * 
 * All configurable constants for the ESP32 AP bridge firmware.
 * Modify these values to customize behavior without changing main code.
 */

#ifndef CONFIG_H
#define CONFIG_H

// ============================================================================
// WiFi Access Point Configuration
// ============================================================================

// AP network name
#ifndef WIFI_SSID
#define WIFI_SSID               "ZIP_ROBOT"
#endif

// AP password (empty string "" = open network)
#ifndef WIFI_PASSWORD
#define WIFI_PASSWORD           "CHANGE_ME"   // set your own AP password
#endif

// WiFi channel (1-13, default 1)
#ifndef WIFI_CHANNEL
#define WIFI_CHANNEL            1
#endif

// Maximum number of WiFi stations (clients) allowed to connect
#ifndef WIFI_MAX_CONNECTIONS
#define WIFI_MAX_CONNECTIONS    4
#endif

// ============================================================================
// mDNS Configuration
// ============================================================================

// mDNS hostname (accessible as zip.local)
#ifndef MDNS_HOSTNAME
#define MDNS_HOSTNAME           "zip"
#endif

// ============================================================================
// WebSocket Server Configuration
// ============================================================================

// WebSocket server port
#ifndef WS_PORT
#define WS_PORT                 81
#endif

// WebSocket path (clients connect to ws://ip:port/robot)
#ifndef WS_PATH
#define WS_PATH                 "/robot"
#endif

// Maximum payload size for WebSocket messages (bytes)
#ifndef WS_MAX_PAYLOAD
#define WS_MAX_PAYLOAD          256
#endif

// WebSocket close code for "controller slot taken"
#ifndef WS_CLOSE_CONTROLLER_TAKEN
#define WS_CLOSE_CONTROLLER_TAKEN  4001
#endif

// ============================================================================
// HTTP Server Configuration
// ============================================================================

// HTTP server port for health endpoint
#ifndef HTTP_PORT
#define HTTP_PORT               80
#endif

// ============================================================================
// UART Configuration
// ============================================================================

// UART baud rate (must match Arduino UNO firmware)
#ifndef UART_BAUD
#define UART_BAUD               115200
#endif

// UART RX pin (ESP32 receives from UNO TX)
// Fixed by ELEGOO SmartCar-Shield - DO NOT CHANGE
// Must use HardwareSerial(1) with explicit pin binding, NOT Serial2
#ifndef UART_RX_PIN
#define UART_RX_PIN             0
#endif

// UART TX pin (ESP32 sends to UNO RX)
// Fixed by ELEGOO SmartCar-Shield - DO NOT CHANGE
#ifndef UART_TX_PIN
#define UART_TX_PIN             1
#endif

// UART receive ring buffer size
#ifndef RX_BUFFER_SIZE
#define RX_BUFFER_SIZE          512
#endif

// Maximum line length for UART messages
#ifndef MAX_LINE_LENGTH
#define MAX_LINE_LENGTH         256
#endif

// ============================================================================
// Safety Configuration
// ============================================================================

// Motion watchdog timeout (milliseconds)
// If no motion command received for this duration, send STOP
#ifndef MOTION_WATCHDOG_MS
#define MOTION_WATCHDOG_MS      500
#endif

// Motion command rate limit (milliseconds)
// Minimum interval between forwarded motion commands (50Hz = 20ms)
#ifndef MOTION_RATE_LIMIT_MS
#define MOTION_RATE_LIMIT_MS    20
#endif

// Emergency stop command to send on disconnect/timeout
#ifndef ESTOP_COMMAND
#define ESTOP_COMMAND           "{\"N\":201,\"H\":\"estop\"}\n"
#endif

// ============================================================================
// Motion Command Detection
// ============================================================================

// N values that are considered motion commands (for rate limiting/watchdog)
// N=200: Setpoint streaming (v, w, TTL)
// N=999: Direct motor control (left/right PWM)
#ifndef MOTION_CMD_SETPOINT
#define MOTION_CMD_SETPOINT     200
#endif

#ifndef MOTION_CMD_DIRECT
#define MOTION_CMD_DIRECT       999
#endif

// ============================================================================
// Debug Configuration
// ============================================================================

// Enable debug logging to Serial
#ifndef DEBUG_LOGS
#define DEBUG_LOGS              1
#endif

// Debug log macro
#if DEBUG_LOGS
#define LOG(fmt, ...) Serial.printf("[ZIP] " fmt "\n", ##__VA_ARGS__)
#define LOG_V(fmt, ...) Serial.printf("[ZIP] " fmt "\n", ##__VA_ARGS__)
#else
#define LOG(fmt, ...) do {} while(0)
#define LOG_V(fmt, ...) do {} while(0)
#endif

// Always-on error logging
#define LOG_E(fmt, ...) Serial.printf("[ZIP] ERROR: " fmt "\n", ##__VA_ARGS__)
#define LOG_W(fmt, ...) Serial.printf("[ZIP] WARN: " fmt "\n", ##__VA_ARGS__)

#endif // CONFIG_H

