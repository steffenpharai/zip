/**
 * FreeRTOS Task Architecture - Implementation
 * 
 * Professional multi-tasking architecture for real-time robot control.
 */

#include "task_architecture.h"
#include <Arduino.h>
#include "esp_log.h"
#include "esp_task_wdt.h"
#include "driver/uart.h"
#include "driver/gpio.h"
#include "board/board_esp32s3_elegoo_cam.h"
#include "config/runtime_config.h"
#include "config/build_config.h"
#include "drivers/uart/uart_bridge.h"
#include "net/net_service.h"
#include "web/web_server.h"
#include "drivers/camera/camera_service.h"
#include "lwip/sockets.h"
#include "lwip/netdb.h"
#include "errno.h"
#include <fcntl.h>
#include <unistd.h>
#include <string.h>

static const char* TAG = "TASKS";

// ============================================================================
// Task Handles
// ============================================================================
TaskHandle_t g_task_cmd_control_handle = NULL;
TaskHandle_t g_task_network_camera_handle = NULL;
TaskHandle_t g_task_logging_handle = NULL;

// ============================================================================
// Queue Handles
// ============================================================================
QueueHandle_t g_uart_rx_queue = NULL;
QueueHandle_t g_uart_tx_queue = NULL;
QueueHandle_t g_cmd_queue = NULL;

// ============================================================================
// Global State (shared between tasks)
// ============================================================================
int s_tcp_server_fd = -1;  // Made non-static for access from app_main
int s_tcp_client_fd = -1;  // Made non-static for access from app_main
static bool s_client_connected = false;
bool s_servers_started = false;  // Made non-static for access from app_main

// ============================================================================
// UART Interrupt Handler (Future Enhancement)
// ============================================================================
// TODO: Implement full interrupt-driven UART when needed
// For now, we use polling in the task with queues for data passing

// ============================================================================
// Task A: Command & Control (High Priority, Core 1)
// ============================================================================
void task_cmd_control(void* pvParameters) {
    // Register this task with watchdog
    esp_task_wdt_add(NULL);
    
    ESP_LOGI(TAG, "CMD_CONTROL task started on core %d", xPortGetCoreID());
    
    uint8_t rx_byte;
    String rx_buffer = "";
    String tx_buffer = "";
    unsigned long last_heartbeat = 0;
    
    while (1) {
        // Feed watchdog
        esp_task_wdt_reset();
        
        // Process UART using existing uart_bridge functions
        // TODO: Replace with interrupt-driven queue when full implementation is ready
        uart_tick();  // Poll UART and process frames
        
        // Process received UART frames
        if (uart_frame_available()) {
            char frame[64];
            size_t len = uart_read_frame(frame, sizeof(frame));
            if (len > 0) {
                String frame_str = String(frame);
                if (frame_str == "{Heartbeat}") {
                    // Heartbeat received - handled by TCP task
                } else {
                    // Forward to TCP client if connected
                    if (s_tcp_client_fd >= 0) {
                        send(s_tcp_client_fd, frame, len, 0);
                    }
                }
            }
        }
        
        // Process UART TX queue (data to send to Arduino)
        while (xQueueReceive(g_uart_tx_queue, &rx_byte, 0) == pdTRUE) {
            tx_buffer += (char)rx_byte;
            if (rx_byte == '}') {
                // Complete frame - send to Arduino
                uart_tx_string(tx_buffer.c_str());
                tx_buffer = "";
            }
        }
        
        // Heartbeat tick (every 1 second)
        if (millis() - last_heartbeat > CONFIG_HEARTBEAT_INTERVAL_MS) {
            if (s_tcp_client_fd >= 0) {
                const char* heartbeat = "{Heartbeat}";
                send(s_tcp_client_fd, heartbeat, strlen(heartbeat), 0);
            }
            last_heartbeat = millis();
        }
        
        // Yield to other tasks
        vTaskDelay(pdMS_TO_TICKS(10));
    }
}

// ============================================================================
// Task B: Networking & Camera (Medium Priority, Core 0)
// ============================================================================
void task_network_camera(void* pvParameters) {
    // Register this task with watchdog
    esp_task_wdt_add(NULL);
    
    ESP_LOGI(TAG, "NETWORK_CAMERA task started on core %d", xPortGetCoreID());
    
    while (1) {
        // Feed watchdog
        esp_task_wdt_reset();
        
        // Advance WiFi initialization state machine
        if (!net_is_ok() && net_status() != NetStatus::ERROR && net_status() != NetStatus::TIMEOUT) {
            net_tick();
        }
        
        // Start servers when WiFi is ready
        if (net_is_ok() && !s_servers_started) {
            ESP_LOGI(TAG, "WiFi ready - starting servers");
            
            // Start web servers
            if (ENABLE_HEALTH_ENDPOINT) {
                web_server_init();
            }
            
            // Create TCP server socket
            struct sockaddr_in server_addr;
            s_tcp_server_fd = socket(AF_INET, SOCK_STREAM, 0);
            if (s_tcp_server_fd >= 0) {
                int opt = 1;
                setsockopt(s_tcp_server_fd, SOL_SOCKET, SO_REUSEADDR, &opt, sizeof(opt));
                
                server_addr.sin_family = AF_INET;
                server_addr.sin_addr.s_addr = INADDR_ANY;
                server_addr.sin_port = htons(CONFIG_TCP_PORT);
                
                if (bind(s_tcp_server_fd, (struct sockaddr*)&server_addr, sizeof(server_addr)) >= 0) {
                    listen(s_tcp_server_fd, 1);
                    
                    // CRITICAL: Set server socket to non-blocking to prevent accept() from blocking
                    // This prevents watchdog timeout when no client is connecting
                    int flags = fcntl(s_tcp_server_fd, F_GETFL, 0);
                    fcntl(s_tcp_server_fd, F_SETFL, flags | O_NONBLOCK);
                    
                    ESP_LOGI(TAG, "TCP server listening on port %d (non-blocking)", CONFIG_TCP_PORT);
                }
            }
            
            s_servers_started = true;
        }
        
        // Handle TCP client (non-blocking)
        if (s_servers_started && net_is_ok() && s_tcp_server_fd >= 0) {
            // Accept new client (non-blocking - server socket is already non-blocking)
            if (s_tcp_client_fd < 0) {
                struct sockaddr_in client_addr;
                socklen_t client_len = sizeof(client_addr);
                s_tcp_client_fd = accept(s_tcp_server_fd, (struct sockaddr*)&client_addr, &client_len);
                if (s_tcp_client_fd >= 0) {
                    // Make client socket non-blocking
                    int flags = fcntl(s_tcp_client_fd, F_GETFL, 0);
                    fcntl(s_tcp_client_fd, F_SETFL, flags | O_NONBLOCK);
                    s_client_connected = true;
                    ESP_LOGI(TAG, "TCP client connected");
                } else if (errno != EAGAIN && errno != EWOULDBLOCK) {
                    // Error other than "no client available" - log it
                    ESP_LOGW(TAG, "accept() failed: %s", strerror(errno));
                }
                // If errno == EAGAIN/EWOULDBLOCK, no client available - this is normal, continue
            }
            
            // Process TCP data (bounded)
            if (s_tcp_client_fd >= 0) {
                char buffer[256];
                int bytes_read = recv(s_tcp_client_fd, buffer, sizeof(buffer) - 1, MSG_DONTWAIT);
                if (bytes_read > 0) {
                    buffer[bytes_read] = '\0';
                    // Forward to UART TX queue
                    for (int i = 0; i < bytes_read; i++) {
                        xQueueSend(g_uart_tx_queue, &buffer[i], 0);
                    }
                } else if (bytes_read == 0 || (bytes_read < 0 && errno != EAGAIN && errno != EWOULDBLOCK)) {
                    // Client disconnected
                    close(s_tcp_client_fd);
                    s_tcp_client_fd = -1;
                    s_client_connected = false;
                    ESP_LOGI(TAG, "TCP client disconnected");
                }
            }
        }
        
        // Yield to other tasks
        vTaskDelay(pdMS_TO_TICKS(10));
    }
}

// ============================================================================
// Task C: Logging & Diagnostics (Low Priority, Core 1)
// ============================================================================
void task_logging(void* pvParameters) {
    // Register this task with watchdog
    esp_task_wdt_add(NULL);
    
    ESP_LOGI(TAG, "LOGGING task started on core %d", xPortGetCoreID());
    
    while (1) {
        // Feed watchdog
        esp_task_wdt_reset();
        
        // ESP_LOG macros handle buffering automatically
        // This task can perform periodic diagnostics if needed
        
        // Yield to other tasks (low priority, can wait)
        vTaskDelay(pdMS_TO_TICKS(100));
    }
}

// ============================================================================
// Task Architecture Initialization
// ============================================================================
bool task_architecture_init() {
    ESP_LOGI(TAG, "Initializing FreeRTOS task architecture");
    
    // Create queues
    g_uart_rx_queue = xQueueCreate(UART_RX_QUEUE_SIZE, UART_RX_QUEUE_ITEM_SIZE);
    g_uart_tx_queue = xQueueCreate(UART_TX_QUEUE_SIZE, UART_TX_QUEUE_ITEM_SIZE);
    g_cmd_queue = xQueueCreate(CMD_QUEUE_SIZE, CMD_QUEUE_ITEM_SIZE);
    
    if (!g_uart_rx_queue || !g_uart_tx_queue || !g_cmd_queue) {
        ESP_LOGE(TAG, "Failed to create queues");
        return false;
    }
    
    // Initialize UART bridge (uses existing Serial2 polling)
    // TODO: Replace with full interrupt-driven UART when needed
    if (ENABLE_UART) {
        uart_init();
        ESP_LOGI(TAG, "UART bridge initialized (polling mode, interrupt-driven can be added later)");
    }
    
    // Create tasks
    xTaskCreatePinnedToCore(
        task_cmd_control,
        "cmd_control",
        TASK_STACK_CMD_CONTROL,
        NULL,
        TASK_PRIORITY_CMD_CONTROL,
        &g_task_cmd_control_handle,
        TASK_CORE_CMD_CONTROL
    );
    
    xTaskCreatePinnedToCore(
        task_network_camera,
        "network_camera",
        TASK_STACK_NETWORK_CAMERA,
        NULL,
        TASK_PRIORITY_NETWORK_CAMERA,
        &g_task_network_camera_handle,
        TASK_CORE_NETWORK_CAMERA
    );
    
    xTaskCreatePinnedToCore(
        task_logging,
        "logging",
        TASK_STACK_LOGGING,
        NULL,
        TASK_PRIORITY_LOGGING,
        &g_task_logging_handle,
        TASK_CORE_LOGGING
    );
    
    if (!g_task_cmd_control_handle || !g_task_network_camera_handle || !g_task_logging_handle) {
        ESP_LOGE(TAG, "Failed to create tasks");
        return false;
    }
    
    ESP_LOGI(TAG, "Task architecture initialized successfully");
    return true;
}

