/**
 * ZIP ESP32-S3 Camera Firmware - Application Main
 * 
 * Based on ELEGOO Smart Robot Car V4.0 Camera Module
 * Refactored for ESP32-S3 with modular architecture.
 * 
 * Features:
 * - WiFi Access Point with MAC-based SSID
 * - Camera streaming on port 81
 * - TCP server on port 100 for robot commands
 * - Serial2 bridge to Arduino UNO at 115200 baud
 * - Health/diagnostics endpoint
 * - Boot-safe GPIO0 handling
 */

#include <Arduino.h>
#include "esp_system.h"
#include "esp_task_wdt.h"
#include "esp_log.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "freertos/timers.h"
#include "lwip/sockets.h"
#include "lwip/netdb.h"
#include "errno.h"
#include <fcntl.h>
#include <unistd.h>

// Board and configuration
#include "board/board_esp32s3_elegoo_cam.h"
#include "config/build_config.h"
#include "config/runtime_config.h"

// Service modules
#include "drivers/uart/uart_bridge.h"
#include "drivers/camera/camera_service.h"
#include "net/net_service.h"
#include "web/web_server.h"
#include "config/safe_mode.h"
#include "app/task_architecture.h"

static const char* TAG = "MAIN";

// ============================================================================
// Global State (moved to task_architecture.cpp)
// ============================================================================
// TCP server/client handles are now managed by network_camera task
// These are declared extern in task_architecture.h
extern int s_tcp_server_fd;
extern int s_tcp_client_fd;
extern bool s_servers_started;

// ============================================================================
// Boot Banner
// ============================================================================
static void print_boot_banner() {
    Serial.println();
    Serial.println("==========================================");
    Serial.println("  ZIP ESP32-S3 Camera Firmware v2.0");
    Serial.println("  Board: " BOARD_NAME);
    Serial.println("==========================================");
    
    // Chip info
    Serial.printf("Chip: %s rev %d, %d cores @ %lu MHz\n",
                  ESP.getChipModel(),
                  ESP.getChipRevision(),
                  ESP.getChipCores(),
                  (unsigned long)ESP.getCpuFreqMHz());
    
    // Memory info
    Serial.printf("Flash: %lu MB\n", ESP.getFlashChipSize() / (1024 * 1024));
    Serial.printf("Heap: %lu bytes free\n", ESP.getFreeHeap());
    
    // PSRAM info
    if (psramFound()) {
        Serial.printf("PSRAM: %lu bytes (%lu free)\n",
                      (unsigned long)ESP.getPsramSize(),
                      (unsigned long)ESP.getFreePsram());
    } else {
        Serial.println("PSRAM: Not detected");
        LOG_W("BOOT", "PSRAM not found - check board_build.arduino.memory_type = qio_opi");
    }
    
    // Pin configuration (OV3660)
    Serial.printf("Camera: %s\n", BOARD_CAMERA_SENSOR);
    Serial.printf("Camera pins: XCLK=%d SIOD=%d SIOC=%d PCLK=%d\n",
                  CAM_XCLK_GPIO, CAM_SIOD_GPIO, CAM_SIOC_GPIO, CAM_PCLK_GPIO);
    Serial.printf("UART: RX=%d TX=%d @ %d baud\n",
                  UART_RX_GPIO, UART_TX_GPIO, CONFIG_UART_BAUD);
    Serial.printf("LED: GPIO%d\n", LED_STATUS_GPIO);
    
    Serial.println("==========================================");
}

// Camera initialization removed for WiFi debugging

// ============================================================================
// Reset Reason Logging
// ============================================================================
static void log_reset_reason() {
    esp_reset_reason_t reason = esp_reset_reason();
    const char* reason_str = "UNKNOWN";
    
    switch (reason) {
        case ESP_RST_POWERON:   reason_str = "POWERON"; break;
        case ESP_RST_EXT:       reason_str = "EXTERNAL"; break;
        case ESP_RST_SW:        reason_str = "SOFTWARE"; break;
        case ESP_RST_PANIC:     reason_str = "PANIC"; break;
        case ESP_RST_INT_WDT:   reason_str = "INT_WDT"; break;
        case ESP_RST_TASK_WDT:  reason_str = "TASK_WDT"; break;
        case ESP_RST_WDT:       reason_str = "WDT"; break;
        case ESP_RST_DEEPSLEEP: reason_str = "DEEPSLEEP"; break;
        case ESP_RST_BROWNOUT:  reason_str = "BROWNOUT"; break;
        case ESP_RST_SDIO:      reason_str = "SDIO"; break;
        default:                reason_str = "UNKNOWN"; break;
    }
    
    Serial.printf("[BOOT] Reset reason: %s (0x%x)\n", reason_str, (int)reason);
    
    // WiFi mode logging removed - ESP-IDF WiFi not initialized at boot
}

// ============================================================================
// Self-Test Mode
// ============================================================================
#if ENABLE_SELF_TEST
static void run_self_test() {
    LOG_I("TEST", "Running self-test...");
    
    // Camera tests removed for WiFi debugging
    
    // Test 2: UART ping
    if (uart_is_ok()) {
        uart_tx_string("{\"N\":0,\"H\":\"ping\"}");
        LOG_I("TEST", "UART: PASS (ping sent)");
    } else {
        LOG_W("TEST", "UART: SKIP (not ready)");
    }
    
    // Test 3: WiFi
    if (net_is_ok()) {
        LOG_I("TEST", "WiFi: PASS (IP: %s)", net_get_ip().toString().c_str());
    } else {
        LOG_E("TEST", "WiFi: FAIL");
    }
    
    LOG_I("TEST", "Self-test complete");
}
#endif

// ============================================================================
// TCP Client Handler (ELEGOO Protocol) - Non-Blocking
// ============================================================================
// Non-blocking TCP handler to prevent loop() from being held hostage
// Never uses while(client.connected()) - processes bounded work per iteration
static String rxBuffer;
static String txBuffer;
static unsigned long lastHeartbeat = 0;
static uint8_t heartbeatMissed = 0;
static bool heartbeatReceived = false;
static bool wasConnected = false;

static void handleTcpClientNonBlocking() {
    // Accept new client if none connected (non-blocking - server socket is already non-blocking)
    if (s_tcp_client_fd < 0) {
        if (s_tcp_server_fd >= 0) {
            struct sockaddr_in client_addr;
            socklen_t client_len = sizeof(client_addr);
            int new_client_fd = accept(s_tcp_server_fd, (struct sockaddr*)&client_addr, &client_len);
            
            if (new_client_fd >= 0) {
                // Make client socket non-blocking
                int flags = fcntl(new_client_fd, F_GETFL, 0);
                fcntl(new_client_fd, F_SETFL, flags | O_NONBLOCK);
                
                s_tcp_client_fd = new_client_fd;
                wasConnected = true;
                LOG_I("TCP", "Client connected");
                rxBuffer = "";
                txBuffer = "";
                lastHeartbeat = millis();
                heartbeatMissed = 0;
                heartbeatReceived = false;
            }
            // If accept() returns -1 with errno=EAGAIN/EWOULDBLOCK, no client available - this is normal
        }
        
        if (s_tcp_client_fd < 0) {
            if (wasConnected) {
                wasConnected = false;
                uart_tx_string("{\"N\":100}");  // Stop command
            }
            // Client disconnected
            return;
        }
    }
    
    // Check if client is still connected
    char test_byte;
    int test_result = recv(s_tcp_client_fd, &test_byte, 1, MSG_PEEK | MSG_DONTWAIT);
    if (test_result <= 0) {
        if (errno != EAGAIN && errno != EWOULDBLOCK) {
            // Client disconnected
            close(s_tcp_client_fd);
            s_tcp_client_fd = -1;
            // Client disconnected
            if (wasConnected) {
                wasConnected = false;
                uart_tx_string("{\"N\":100}");  // Stop command
            }
            return;
        }
    }
    
    // Bound work per loop: read up to N bytes from TCP
    const int MAX_READ_BYTES = 256;
    int readCount = 0;
    char readBuffer[256];
    
    esp_task_wdt_reset();  // Feed watchdog before TCP read loop
    while (readCount < MAX_READ_BYTES) {
        int bytes_read = recv(s_tcp_client_fd, readBuffer + readCount, MAX_READ_BYTES - readCount, MSG_DONTWAIT);
        if (bytes_read <= 0) {
            if (errno == EAGAIN || errno == EWOULDBLOCK) {
                // No more data available
                break;
            } else {
                // Error or connection closed
                close(s_tcp_client_fd);
                s_tcp_client_fd = -1;
                // Client disconnected
                if (wasConnected) {
                    wasConnected = false;
                    uart_tx_string("{\"N\":100}");  // Stop command
                }
                return;
            }
        }
        
        // Process received bytes
        for (int i = 0; i < bytes_read; i++) {
            char c = readBuffer[readCount + i];
            
#if DEBUG_UART_FRAMES
            Serial.print(c);
#endif
            
            if (c == '{') {
                rxBuffer = "{";
            } else if (rxBuffer.length() > 0) {
                if (c != ' ') rxBuffer += c;  // Skip spaces
                
                if (c == '}') {
                    // Complete message received
                    if (rxBuffer == "{Heartbeat}") {
                        heartbeatReceived = true;
                    } else {
                        // Forward to UNO via UART bridge
                        uart_tx_string(rxBuffer.c_str());
                    }
                    rxBuffer = "";
                }
            }
        }
        
        readCount += bytes_read;
        
        // Feed watchdog periodically during read loop (every 64 bytes)
        if (readCount % 64 == 0) {
            esp_task_wdt_reset();
        }
    }
    
    // Feed watchdog before UART->TCP pump
    esp_task_wdt_reset();
    
    // Pump UART->TCP, bounded
    const int MAX_UART_BYTES = 256;
    int uartCount = 0;
    while (uart_rx_available() && uartCount < MAX_UART_BYTES) {
        int c = uart_rx_read_byte();
        if (c < 0) break;
        uartCount++;
        txBuffer += (char)c;
        
        if (c == '}') {
            // Send complete message
            if (s_tcp_client_fd >= 0) {
                send(s_tcp_client_fd, txBuffer.c_str(), txBuffer.length(), 0);
#if DEBUG_UART_FRAMES
                Serial.print(txBuffer);
#endif
            }
            txBuffer = "";
        }
        
        // Feed watchdog periodically during UART pump (every 64 bytes)
        if (uartCount % 64 == 0) {
            esp_task_wdt_reset();
        }
    }
    
    // Heartbeat tick (non-blocking check)
    if (millis() - lastHeartbeat > CONFIG_HEARTBEAT_INTERVAL_MS) {
        if (s_tcp_client_fd >= 0) {
            const char* heartbeat_msg = "{Heartbeat}";
            send(s_tcp_client_fd, heartbeat_msg, strlen(heartbeat_msg), 0);
        }
        
        if (heartbeatReceived) {
            heartbeatReceived = false;
            heartbeatMissed = 0;
        } else {
            heartbeatMissed++;
        }
        
        if (heartbeatMissed > CONFIG_HEARTBEAT_TIMEOUT_COUNT) {
            esp_task_wdt_reset();  // Feed watchdog before LOG_W
            LOG_W("TCP", "Heartbeat timeout");
            esp_task_wdt_reset();  // Feed watchdog after LOG_W
            uart_tx_string("{\"N\":100}");  // Stop command
            if (s_tcp_client_fd >= 0) {
                close(s_tcp_client_fd);
                s_tcp_client_fd = -1;
            }
            // Client disconnected
            return;
        }
        
        // Check if device disconnected from WiFi
        if (net_get_station_count() == 0) {
            esp_task_wdt_reset();  // Feed watchdog before LOG_W
            LOG_W("TCP", "No WiFi clients");
            esp_task_wdt_reset();  // Feed watchdog after LOG_W
            uart_tx_string("{\"N\":100}");  // Stop command
            if (s_tcp_client_fd >= 0) {
                close(s_tcp_client_fd);
                s_tcp_client_fd = -1;
            }
            // Client disconnected
            return;
        }
        
        lastHeartbeat = millis();
    }
    
    // Process UART bridge (non-blocking)
    uart_tick();
}

// ============================================================================
// Bridge Command Handler (Serial JSON commands from ZIP Robot Bridge)
// ============================================================================
static void handleBridgeCommand(const String& json) {
    // Simple JSON parser for bridge commands: {"N":0,"H":"tag"}
    // Extract N (command number) and H (tag) fields
    
    int cmdN = -1;
    String tag = "";
    
    // Find "N":<number> pattern
    int nPos = json.indexOf("\"N\":");
    if (nPos >= 0) {
        int nStart = nPos + 4;
        // Skip whitespace
        while (nStart < json.length() && (json[nStart] == ' ' || json[nStart] == ':')) {
            nStart++;
        }
        // Parse number
        int nEnd = nStart;
        while (nEnd < json.length() && json[nEnd] >= '0' && json[nEnd] <= '9') {
            nEnd++;
        }
        if (nEnd > nStart) {
            cmdN = json.substring(nStart, nEnd).toInt();
        }
    }
    
    // Find "H":"<tag>" pattern
    int hPos = json.indexOf("\"H\":");
    if (hPos >= 0) {
        int hStart = hPos + 4;
        // Skip whitespace and colon
        while (hStart < json.length() && (json[hStart] == ' ' || json[hStart] == ':')) {
            hStart++;
        }
        // Find opening quote
        if (hStart < json.length() && json[hStart] == '"') {
            hStart++;
            int hEnd = hStart;
            // Find closing quote
            while (hEnd < json.length() && json[hEnd] != '"') {
                hEnd++;
            }
            if (hEnd > hStart) {
                tag = json.substring(hStart, hEnd);
            }
        }
    }
    
    // Handle N=0 (Hello) command
    if (cmdN == 0) {
        // Respond with {tag_ok} format
        String response = "{" + tag + "_ok}";
        if (Serial.availableForWrite() >= response.length() + 10) {  // Check buffer space
            Serial.println(response);
            // REMOVED: Serial.flush() - Don't block if Serial not connected
        }
        LOG_V("BRIDGE", "Hello command: tag=%s, response=%s", tag.c_str(), response.c_str());
    } else if (cmdN >= 0) {
        // Other commands - respond with ok for now
        String response = "{" + tag + "_ok}";
        if (Serial.availableForWrite() >= response.length() + 10) {  // Check buffer space
            Serial.println(response);
            // REMOVED: Serial.flush() - Don't block if Serial not connected
        }
        LOG_V("BRIDGE", "Command N=%d, tag=%s, response=%s", cmdN, tag.c_str(), response.c_str());
    }
}

// ============================================================================
// Factory Test Handler (ELEGOO Protocol)
// ============================================================================
static void handleFactoryTest() {
    // Check for factory test commands from UNO
    if (uart_frame_available()) {
        char frame[64];
        size_t len = uart_read_frame(frame, sizeof(frame));
        
        if (len > 0) {
            if (strcmp(frame, "{BT_detection}") == 0) {
                uart_tx_string("{BT_OK}");
                LOG_V("TEST", "BT detection response sent");
            } else if (strcmp(frame, "{WA_detection}") == 0) {
                String response = "{" + net_get_mac_suffix() + "}";
                uart_tx_string(response.c_str());
                LOG_V("TEST", "WiFi detection response sent");
            }
        }
    }
    
    // LED indicator
    static unsigned long lastBlink = 0;
    static bool ledState = false;
    
    if (net_get_station_count() > 0) {
        // Client connected - LED solid
        digitalWrite(LED_STATUS_GPIO, LOW);
        if (s_tcp_client_fd >= 0) {
            uart_tx_string("{WA_OK}");
        }
    } else {
        // No client - blink LED
        if (millis() - lastBlink > CONFIG_LED_BLINK_INTERVAL_MS) {
            ledState = !ledState;
            digitalWrite(LED_STATUS_GPIO, ledState ? LOW : HIGH);
            lastBlink = millis();
        }
    }
}

// ============================================================================
// Setup
// ============================================================================
// s_servers_started is now managed in task_architecture.cpp

void setup() {
    unsigned long setup_start = millis();
    
    // CRITICAL: Initialize Serial with large RX buffer FIRST to receive bridge commands
    // This must be done before any Serial.printf() calls
    Serial.setRxBufferSize(1024);  // Large buffer for JSON commands
    Serial.begin(CONFIG_DEBUG_BAUD);
    // REMOVED: Serial.flush() - Don't block if Serial not connected
    // Serial will buffer output and drain when connected
    
    // Send early boot marker to "hook" the bridge (prevents timeout during long init)
    Serial.print("R\n");
    // REMOVED: Serial.flush() - Don't block if Serial not connected
    
    Serial.printf("[DBG-SETUP] setup() started at %lu ms\n", setup_start);
    
    // Initialize watchdog with extended timeout for initialization phase
    // Production fix: Use 60-second timeout during init to accommodate blocking WiFi calls
    esp_err_t wdt_init_result = esp_task_wdt_init(60, true);  // 60 seconds for init phase
    Serial.printf("[DBG-SETUP] Initialized watchdog with 60 second timeout (result=0x%x) at %lu ms\n", 
                  wdt_init_result, millis());
    
    // Register main task with watchdog to ensure it's monitored
    esp_err_t wdt_add_result = esp_task_wdt_add(NULL);
    Serial.printf("[DBG-SETUP] Registered main task with watchdog (result=0x%x) at %lu ms\n", 
                  wdt_add_result, millis());
    
    // Feed watchdog immediately
    esp_task_wdt_reset();
    Serial.printf("[DBG-SETUP] Initial watchdog feed at %lu ms\n", millis());
    
    // Initialize LED for visual feedback
    pinMode(LED_STATUS_GPIO, OUTPUT);
    digitalWrite(LED_STATUS_GPIO, LOW);  // LED ON = booting
    
    // Boot indicator: 3 blinks
    for (int i = 0; i < 3; i++) {
        digitalWrite(LED_STATUS_GPIO, LOW);
        delay(100);
        digitalWrite(LED_STATUS_GPIO, HIGH);
        delay(100);
    }
    digitalWrite(LED_STATUS_GPIO, LOW);  // Keep ON during init
    
    // Initialize safe mode tracking (must be first)
    safe_mode_init();
    
    // Print boot banner
    print_boot_banner();
    
    // PRODUCTION FIX: Initialize camera first, then stop before WiFi init
    // Camera must be initialized to save config for resume after WiFi init
#if ENABLE_CAMERA
    ESP_LOGI(TAG, "Initializing camera (synchronous)...");
    esp_task_wdt_reset();  // Feed watchdog before camera init
    if (camera_init()) {
        ESP_LOGI(TAG, "Camera: OK");
        // Camera is now initialized - it will be stopped before WiFi init in net_tick()
        // This allows camera config to be saved for resume after WiFi init
    } else {
        ESP_LOGW(TAG, "Camera init failed: %s (continuing without camera)", camera_last_error());
    }
    esp_task_wdt_reset();  // Feed watchdog after camera init
#else
    ESP_LOGI(TAG, "Camera disabled by build config");
#endif
    
    // Initialize WiFi (non-blocking state machine)
    ESP_LOGI(TAG, "Starting WiFi Access Point initialization (async)...");
    if (net_init_sync()) {
        ESP_LOGI(TAG, "WiFi initialization started - will complete in network_camera task");
    } else {
        ESP_LOGE(TAG, "WiFi init start failed: %s", net_last_error());
        ESP_LOGW(TAG, "Continuing without WiFi (safe mode)");
    }
    
    // Initialize FreeRTOS task architecture
    ESP_LOGI(TAG, "Initializing FreeRTOS task architecture...");
    if (!task_architecture_init()) {
        ESP_LOGE(TAG, "Failed to initialize task architecture - system may be unstable");
    }
    
    // LED OFF = ready
    digitalWrite(LED_STATUS_GPIO, HIGH);
    
    // Run self-test if enabled
#if ENABLE_SELF_TEST
    run_self_test();
#endif
    
    unsigned long setup_end = millis();
    ESP_LOGI(TAG, "setup() completed in %lu ms", setup_end - setup_start);
    
    // Print ready message
    ESP_LOGI(TAG, "==========================================");
    ESP_LOGI(TAG, "Initialization complete!");
    if (net_is_ok()) {
        ESP_LOGI(TAG, "  WiFi: %s", net_get_ssid().c_str());
        ESP_LOGI(TAG, "  IP: %s", net_get_ip().toString().c_str());
        ESP_LOGI(TAG, "  Health: http://%s/health", net_get_ip().toString().c_str());
    }
#if ENABLE_CAMERA
    ESP_LOGI(TAG, "  Camera: %s", camera_is_ok() ? "OK (will resume after WiFi)" : camera_last_error());
#else
    ESP_LOGI(TAG, "  Camera: Disabled");
#endif
    ESP_LOGI(TAG, "  WiFi: %s", net_is_ok() ? "OK" : net_last_error());
    ESP_LOGI(TAG, "  UART: Interrupt-driven (queues)");
    ESP_LOGI(TAG, "==========================================");
}

// ============================================================================
// Main Loop - Minimal Heartbeat
// ============================================================================
// PRODUCTION FIX: loop() is now minimal - all logic moved to FreeRTOS tasks
// This ensures real-time safety: motor commands cannot be blocked by WiFi/Logging
// 
// Task Architecture:
//   - Task A (CMD_CONTROL): High priority, Core 1 - UART bridge, motor commands
//   - Task B (NETWORK_CAMERA): Medium priority, Core 0 - WiFi, TCP/IP, camera
//   - Task C (LOGGING): Low priority, Core 1 - ESP_LOG output
void loop() {
    // Minimal heartbeat - feed watchdog and yield
    // All actual work is done in FreeRTOS tasks with proper priorities
    esp_task_wdt_reset();
    
    // Yield to FreeRTOS scheduler
    // Tasks run independently with proper priorities and core assignments
    vTaskDelay(pdMS_TO_TICKS(100));  // 100ms heartbeat
}

