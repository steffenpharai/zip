/**
 * FreeRTOS Task Architecture - Professional Multi-Tasking Design
 * 
 * This architecture splits the system into three distinct tasks with proper
 * priorities and core assignments to ensure real-time safety for robot control.
 * 
 * Task A: Command & Control (High Priority, Core 1)
 *   - Handles UART bridge to Arduino UNO
 *   - Processes robot commands
 *   - Manages watchdog feeding
 *   - Critical for motor safety
 * 
 * Task B: Networking & Camera (Medium Priority, Core 0)
 *   - WiFi AP management
 *   - TCP/IP stack (naturally runs on Core 0)
 *   - Camera operations
 *   - Web server
 * 
 * Task C: Logging & Diagnostics (Low Priority, Core 1)
 *   - Serial output (ESP_LOG)
 *   - Diagnostics
 *   - Non-critical logging
 */

#ifndef TASK_ARCHITECTURE_H
#define TASK_ARCHITECTURE_H

#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "freertos/queue.h"

// ============================================================================
// Task Priorities
// ============================================================================
#define TASK_PRIORITY_CMD_CONTROL    5  // High priority - motor safety critical
#define TASK_PRIORITY_NETWORK_CAMERA 3  // Medium priority - networking
#define TASK_PRIORITY_LOGGING        1  // Low priority - can be delayed

// ============================================================================
// Task Stack Sizes
// ============================================================================
#define TASK_STACK_CMD_CONTROL      4096   // 4KB for command processing
#define TASK_STACK_NETWORK_CAMERA   8192   // 8KB for networking stack
#define TASK_STACK_LOGGING          2048   // 2KB for logging

// ============================================================================
// Core Assignments
// ============================================================================
#define TASK_CORE_CMD_CONTROL       1  // Core 1 - isolated from WiFi
#define TASK_CORE_NETWORK_CAMERA    0  // Core 0 - ESP-IDF networking default
#define TASK_CORE_LOGGING           1  // Core 1 - same as CMD_CONTROL but lower priority

// ============================================================================
// Queue Definitions
// ============================================================================
// UART RX Queue - interrupt-driven UART data
#define UART_RX_QUEUE_SIZE          32
#define UART_RX_QUEUE_ITEM_SIZE     sizeof(uint8_t)

// UART TX Queue - data to send to Arduino
#define UART_TX_QUEUE_SIZE          32
#define UART_TX_QUEUE_ITEM_SIZE     sizeof(uint8_t)

// Command Queue - parsed commands from UART
#define CMD_QUEUE_SIZE              16
#define CMD_QUEUE_ITEM_SIZE         64  // Max command string length

// ============================================================================
// Task Handles
// ============================================================================
extern TaskHandle_t g_task_cmd_control_handle;
extern TaskHandle_t g_task_network_camera_handle;
extern TaskHandle_t g_task_logging_handle;

// ============================================================================
// Queue Handles
// ============================================================================
extern QueueHandle_t g_uart_rx_queue;
extern QueueHandle_t g_uart_tx_queue;
extern QueueHandle_t g_cmd_queue;

// ============================================================================
// Global State (shared between tasks)
// ============================================================================
extern int s_tcp_server_fd;
extern int s_tcp_client_fd;
extern bool s_servers_started;

// ============================================================================
// Task Functions
// ============================================================================
void task_cmd_control(void* pvParameters);
void task_network_camera(void* pvParameters);
void task_logging(void* pvParameters);

// ============================================================================
// Initialization
// ============================================================================
bool task_architecture_init();

#endif // TASK_ARCHITECTURE_H

