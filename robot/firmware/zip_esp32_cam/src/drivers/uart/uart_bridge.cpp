/**
 * UART Bridge Service - Implementation
 * 
 * UART communication bridge to the robot shield (Arduino UNO).
 * Uses GPIO3 (RX) and GPIO40 (TX) as defined in board_esp32s3_elegoo_cam.h.
 * 
 * Pin assignments (ESP32-S3-WROOM-1 with OV2640) - VERIFIED via hardware testing:
 *   - TX: GPIO40 (routed via GPIO matrix to UART1) - sends to Arduino RX - VERIFIED
 *   - RX: GPIO3 (routed via GPIO matrix to UART1) - receives from Arduino TX - VERIFIED
 * 
 * CRITICAL: Uses UART1 (Serial1) instead of UART0 to avoid USB-CDC conflicts.
 * GPIO40/3 are routed via GPIO matrix to UART1 to prevent conflicts with the
 * internal USB-CDC bridge logic on ESP32-S3.
 * 
 * This ensures reliable communication even when USB is connected or disconnected.
 */

#include "uart_bridge.h"
#include <Arduino.h>
#include "board/board_esp32s3_elegoo_cam.h"
#include "config/build_config.h"
#include "config/runtime_config.h"

// ============================================================================
// Module State
// ============================================================================
static bool s_initialized = false;
static bool s_boot_guard_expired = false;
static unsigned long s_boot_start_time = 0;
static UartStats s_stats = {0, 0, 0, 0, 0, 0, 0, 0};

// Ring buffer for RX data
static uint8_t s_rx_buffer[CONFIG_UART_RX_BUFFER_SIZE];
static volatile size_t s_rx_head = 0;
static volatile size_t s_rx_tail = 0;

// Frame parsing state
static bool s_in_frame = false;
static size_t s_frame_start = 0;

// ============================================================================
// Ring Buffer Helpers
// ============================================================================
static inline size_t ring_buffer_count() {
    if (s_rx_head >= s_rx_tail) {
        return s_rx_head - s_rx_tail;
    }
    return CONFIG_UART_RX_BUFFER_SIZE - s_rx_tail + s_rx_head;
}

static inline bool ring_buffer_full() {
    return ring_buffer_count() >= (CONFIG_UART_RX_BUFFER_SIZE - 1);
}

static inline void ring_buffer_push(uint8_t byte) {
    size_t next = (s_rx_head + 1) % CONFIG_UART_RX_BUFFER_SIZE;
    if (next != s_rx_tail) {
        s_rx_buffer[s_rx_head] = byte;
        s_rx_head = next;
    } else {
        s_stats.buffer_overflows++;
    }
}

static inline int ring_buffer_pop() {
    if (s_rx_head == s_rx_tail) {
        return -1;
    }
    uint8_t byte = s_rx_buffer[s_rx_tail];
    s_rx_tail = (s_rx_tail + 1) % CONFIG_UART_RX_BUFFER_SIZE;
    return byte;
}

static inline int ring_buffer_peek() {
    if (s_rx_head == s_rx_tail) {
        return -1;
    }
    return s_rx_buffer[s_rx_tail];
}

// ============================================================================
// UART Initialization
// ============================================================================
bool uart_init() {
#if !ENABLE_UART
    LOG_I("UART", "UART disabled by build config");
    return false;
#else
    s_boot_start_time = millis();
    
    LOG_I("UART", "Initializing UART bridge...");
    LOG_I("UART", "RX=GPIO%d TX=GPIO%d @ %d baud",
          UART_RX_GPIO, UART_TX_GPIO, CONFIG_UART_BAUD);
    
    // Small delay for GPIO and Arduino UNO to settle after power-on
    delay(50);
    
    // Initialize Serial1 (UART1) to avoid UART0/USB-CDC internal logic conflicts
    // GPIO3 (RX) and GPIO40 (TX) are routed via GPIO matrix to UART1
    // This prevents conflicts with the ESP32-S3's internal USB-CDC bridge logic
    // that can "lock" UART0 even when USB is not connected.
    // Ensure shield slide-switch is in "cam" position to bridge GPIO3/40 to Arduino Uno.
    Serial1.begin(CONFIG_UART_BAUD, SERIAL_8N1, UART_RX_GPIO, UART_TX_GPIO);
    
    s_initialized = true;
    s_boot_guard_expired = true;  // No boot guard needed for GPIO3
    
    LOG_I("UART", "Serial1 (UART1) initialized on RX=GPIO%d TX=GPIO%d", 
          UART_RX_GPIO, UART_TX_GPIO);
    
#if ENABLE_UART_LOOPBACK
    LOG_I("UART", "Loopback test mode enabled");
#endif
    
    return true;
#endif
}

// ============================================================================
// Boot Guard Management (Legacy - kept for API compatibility)
// ============================================================================
// Note: Boot guard was originally needed when using GPIO0 for RX.
// With GPIO3 (verified RX pin), immediate initialization is safe. These functions are
// retained for API compatibility but boot guard is always "expired".

bool uart_boot_guard_expired() {
    return s_boot_guard_expired;
}

// ============================================================================
// UART Tick (Main Loop Processing)
// ============================================================================
// #region agent log - Debug GPIO state
static unsigned long s_last_debug_ms = 0;
static uint32_t s_debug_rx_last = 0;
// #endregion

void uart_tick() {
    if (!s_initialized) {
        return;
    }
    
    // #region agent log - Check if Serial1 has data available
    int avail = Serial1.available();
    if (avail > 0) {
        Serial.printf("[DBG-RX] Serial1.available()=%d\n", avail);
    }
    // Periodic debug every 5 seconds
    if (millis() - s_last_debug_ms > 5000) {
        s_last_debug_ms = millis();
        if (s_stats.rx_bytes != s_debug_rx_last) {
            Serial.printf("[DBG] RX changed: %lu -> %lu\n", s_debug_rx_last, s_stats.rx_bytes);
            s_debug_rx_last = s_stats.rx_bytes;
        } else {
            Serial.printf("[DBG] RX stuck at %lu, TX=%lu\n", s_stats.rx_bytes, s_stats.tx_bytes);
        }
    }
    // #endregion
    
    // Read available data into ring buffer
    while (Serial1.available() && !ring_buffer_full()) {
        int byte = Serial1.read();
        if (byte >= 0) {
            ring_buffer_push((uint8_t)byte);
            s_stats.rx_bytes++;
            s_stats.last_rx_ts = millis();
            
#if DEBUG_UART_FRAMES
            Serial.print((char)byte);
#endif
            
            // Track frame boundaries
            if (byte == '{') {
                s_in_frame = true;
                s_frame_start = ring_buffer_count();
            } else if (byte == '}' && s_in_frame) {
                s_stats.rx_frames++;
                s_in_frame = false;
            }
        }
    }
    
#if ENABLE_UART_LOOPBACK
    // Echo received data back for testing
    while (uart_rx_available() > 0) {
        int byte = ring_buffer_pop();
        if (byte >= 0) {
            Serial1.write((uint8_t)byte);
            s_stats.tx_bytes++;
        }
    }
#endif
}

// ============================================================================
// Transmit Functions
// ============================================================================
size_t uart_tx(const uint8_t* data, size_t len) {
    if (!s_initialized || !s_boot_guard_expired || !data || len == 0) {
        return 0;
    }
    
    size_t written = Serial1.write(data, len);
    s_stats.tx_bytes += written;
    s_stats.last_tx_ts = millis();
    
    return written;
}

size_t uart_tx_string(const char* str) {
    if (!str) {
        return 0;
    }
    
    size_t len = strlen(str);
    size_t written = uart_tx((const uint8_t*)str, len);
    
    // Add newline after JSON commands for Arduino compatibility
    if (len > 0 && str[len - 1] == '}') {
        Serial1.write('\n');
        written++;
        s_stats.tx_frames++;
    }
    
    return written;
}

// ============================================================================
// Receive Functions
// ============================================================================
size_t uart_rx_available() {
    return ring_buffer_count();
}

size_t uart_rx_read(uint8_t* buffer, size_t max_len) {
    if (!buffer || max_len == 0) {
        return 0;
    }
    
    size_t count = 0;
    while (count < max_len && uart_rx_available() > 0) {
        int byte = ring_buffer_pop();
        if (byte >= 0) {
            buffer[count++] = (uint8_t)byte;
        }
    }
    
    return count;
}

int uart_rx_read_byte() {
    return ring_buffer_pop();
}

int uart_rx_peek() {
    return ring_buffer_peek();
}

// ============================================================================
// Frame Functions
// ============================================================================
bool uart_frame_available() {
    // Scan buffer for complete frame (ends with })
    size_t count = ring_buffer_count();
    if (count == 0) {
        return false;
    }
    
    // Look for closing brace in buffer
    for (size_t i = 0; i < count; i++) {
        size_t idx = (s_rx_tail + i) % CONFIG_UART_RX_BUFFER_SIZE;
        if (s_rx_buffer[idx] == '}') {
            return true;
        }
    }
    
    return false;
}

size_t uart_read_frame(char* buffer, size_t max_len) {
    if (!buffer || max_len == 0) {
        return 0;
    }
    
    size_t count = 0;
    bool in_frame = false;
    
    while (count < (max_len - 1) && uart_rx_available() > 0) {
        int byte = ring_buffer_peek();
        if (byte < 0) {
            break;
        }
        
        if (byte == '{') {
            in_frame = true;
            count = 0;  // Reset on new frame start
        }
        
        if (in_frame) {
            ring_buffer_pop();
            buffer[count++] = (char)byte;
            
            if (byte == '}') {
                buffer[count] = '\0';
                return count;
            }
        } else {
            // Discard bytes outside of frame
            ring_buffer_pop();
            s_stats.framing_errors++;
        }
    }
    
    // Incomplete frame
    buffer[count] = '\0';
    return 0;
}

// ============================================================================
// Status Functions
// ============================================================================
bool uart_is_ok() {
    return s_initialized && s_boot_guard_expired;
}

UartStats uart_get_stats() {
    return s_stats;
}

int uart_get_rx_pin() {
    return UART_RX_GPIO;
}

int uart_get_tx_pin() {
    return UART_TX_GPIO;
}

uint32_t uart_get_baud_rate() {
    return CONFIG_UART_BAUD;
}

size_t uart_get_rx_buffer_size() {
    return CONFIG_UART_RX_BUFFER_SIZE;
}

size_t uart_get_tx_buffer_size() {
    return CONFIG_UART_TX_BUFFER_SIZE;
}

