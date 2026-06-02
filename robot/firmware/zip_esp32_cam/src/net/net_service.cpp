/**
 * Network Service - Implementation
 * 
 * WiFi Access Point with ELEGOO MAC-based SSID.
 * Non-blocking initialization with status tracking.
 * Uses ESP-IDF native WiFi API for better watchdog compatibility.
 */

#include "net_service.h"
#include <Arduino.h>
#include "esp_wifi.h"
#include "esp_netif.h"
#include "esp_event.h"
#include "esp_log.h"
#include "esp_mac.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "esp_task_wdt.h"
#include "config/build_config.h"
#include "config/runtime_config.h"
#include "drivers/camera/camera_service.h"

// ============================================================================
// WiFi Initialization State Machine
// ============================================================================
enum class WiFiInitState {
    IDLE,           // Not started
    GENERATE_SSID,  // Generate SSID from MAC
    SET_MODE,       // Set WiFi mode to AP
    SET_TX_POWER,   // Set TX power
    START_AP,       // Start softAP
    WAIT_STABLE,    // Wait for AP to stabilize
    DONE,           // Initialization complete
    ERROR           // Initialization failed
};

// ============================================================================
// Module State
// ============================================================================
static NetStatus s_status = NetStatus::DISCONNECTED;
static WiFiInitState s_init_state = WiFiInitState::IDLE;
static String s_ssid = "";
static String s_mac_suffix = "";
static unsigned long s_start_time = 0;
static unsigned long s_init_start_time = 0;
static unsigned long s_stable_wait_start = 0;
static int s_stable_wait_count = 0;
static const char* s_error_message = "Not initialized";
static const unsigned long BOOT_WIFI_TIMEOUT_MS = 20000;  // 20 second software timeout for boot
static esp_netif_t* s_ap_netif = NULL;
static bool s_wifi_initialized = false;
static bool s_ap_started = false;
static int8_t s_tx_power_dbm = 19;  // Default TX power in dBm
static TaskHandle_t s_wifi_init_task_handle = NULL;

// Forward declaration
static void wifi_event_handler(void* arg, esp_event_base_t event_base,
                               int32_t event_id, void* event_data);

// ============================================================================
// WiFi Initialization Task (NOT registered with watchdog)
// ============================================================================
static void wifi_init_task(void* parameter) {
    // This task is NOT registered with watchdog to avoid resets during blocking calls
    // However, IWDT (Interrupt Watchdog Timer) still monitors interrupt latency
    // Add yields between blocking calls to allow interrupts to be serviced
    LOG_I("NET", "WiFi init task started");
    
    // Note: TX power will be set after esp_wifi_start() in the START_AP state
    // esp_wifi_set_max_tx_power() requires WiFi to be started first
    
    // Yield to allow other tasks and interrupts to run
    vTaskDelay(pdMS_TO_TICKS(10));
    
    // Initialize network interface
    LOG_I("NET", "Calling esp_netif_init()...");
    esp_netif_init();
    
    // Yield after netif init to allow interrupts
    vTaskDelay(pdMS_TO_TICKS(10));
    
    // CRITICAL: Create default event loop before registering event handlers
    // esp_netif_init() may create it, but we need to ensure it exists
    LOG_I("NET", "Creating default event loop...");
    esp_err_t event_loop_ret = esp_event_loop_create_default();
    if (event_loop_ret != ESP_OK && event_loop_ret != ESP_ERR_INVALID_STATE) {
        // ESP_ERR_INVALID_STATE means it already exists, which is fine
        LOG_W("NET", "Event loop creation returned: %s (may already exist)", esp_err_to_name(event_loop_ret));
    } else if (event_loop_ret == ESP_OK) {
        LOG_I("NET", "Default event loop created");
    } else {
        LOG_I("NET", "Default event loop already exists");
    }
    
    // Yield after event loop creation
    vTaskDelay(pdMS_TO_TICKS(10));
    
    LOG_I("NET", "Creating default WiFi AP netif...");
    s_ap_netif = esp_netif_create_default_wifi_ap();
    if (!s_ap_netif) {
        LOG_E("NET", "Failed to create AP network interface");
        s_init_state = WiFiInitState::ERROR;
        s_status = NetStatus::ERROR;
        s_error_message = "Failed to create AP netif";
        s_wifi_init_task_handle = NULL;
        vTaskDelete(NULL);
        return;
    }
    
    // Yield after netif creation
    vTaskDelay(pdMS_TO_TICKS(10));
    
    // CRITICAL: Add longer delay before WiFi init to allow power supply to stabilize
    // esp_wifi_init() triggers radio calibration requiring ~500mA current burst
    // USB power needs time to recover and stabilize before this high-current operation
    LOG_I("NET", "Waiting 500ms for power supply stabilization before WiFi init...");
    vTaskDelay(pdMS_TO_TICKS(500));  // 500ms delay to stabilize power supply
    
    // Initialize WiFi with default config
    // Note: esp_wifi_init() triggers radio calibration which requires ~500mA current burst
    // The reduced TX power (set later) helps, but the init itself still draws high current
    LOG_I("NET", "Calling esp_wifi_init() (this may cause power brownout on USB)...");
    wifi_init_config_t cfg = WIFI_INIT_CONFIG_DEFAULT();
    
    // Reduce WiFi init power consumption by limiting features
    // This may help reduce current spike during initialization
    cfg.static_rx_buf_num = 5;  // Reduce from default (10) to lower memory/power
    cfg.dynamic_rx_buf_num = 5;  // Reduce from default (32) to lower memory/power
    cfg.static_tx_buf_num = 2;   // Reduce from default (0, uses dynamic) to lower power
    cfg.dynamic_tx_buf_num = 5;  // Reduce from default (32) to lower power
    
    esp_err_t ret = esp_wifi_init(&cfg);
    if (ret != ESP_OK) {
        LOG_E("NET", "esp_wifi_init() failed: %s", esp_err_to_name(ret));
        s_init_state = WiFiInitState::ERROR;
        s_status = NetStatus::ERROR;
        s_error_message = "WiFi init failed";
        s_wifi_init_task_handle = NULL;
        vTaskDelete(NULL);
        return;
    }
    
    // Yield after WiFi init
    vTaskDelay(pdMS_TO_TICKS(10));
    
    // Note: TX power will be set after esp_wifi_start() in the START_AP state
    // esp_wifi_set_max_tx_power() requires WiFi to be started first
    
    // Set WiFi mode to AP BEFORE registering event handler
    // This ensures WiFi is in the correct state for event registration
    LOG_I("NET", "Setting WiFi mode to AP...");
    ret = esp_wifi_set_mode(WIFI_MODE_AP);
    if (ret != ESP_OK) {
        LOG_E("NET", "esp_wifi_set_mode() failed: %s", esp_err_to_name(ret));
        s_init_state = WiFiInitState::ERROR;
        s_status = NetStatus::ERROR;
        s_error_message = "Failed to set WiFi mode";
        s_wifi_init_task_handle = NULL;
        vTaskDelete(NULL);
        return;
    }
    
    // Yield after setting mode to allow state to settle
    vTaskDelay(pdMS_TO_TICKS(10));
    
    // Register event handler AFTER WiFi mode is set
    // This ensures WiFi is in a valid state for event registration
    LOG_I("NET", "Registering WiFi event handler...");
    esp_event_handler_instance_t instance_any_id;
    ret = esp_event_handler_instance_register(WIFI_EVENT,
                                              ESP_EVENT_ANY_ID,
                                              &wifi_event_handler,
                                              NULL,
                                              &instance_any_id);
    if (ret != ESP_OK) {
        LOG_W("NET", "Failed to register WiFi event handler: %s", esp_err_to_name(ret));
        // Non-critical - WiFi will still work, just won't receive events
    } else {
        LOG_I("NET", "WiFi event handler registered successfully");
    }
    
    // Yield after event handler registration
    vTaskDelay(pdMS_TO_TICKS(10));
    
    s_wifi_initialized = true;
    LOG_I("NET", "WiFi initialized and mode set to AP");
    
    // Task completes - handle will be cleared
    s_wifi_init_task_handle = NULL;
    vTaskDelete(NULL);
}

// ============================================================================
// WiFi Event Handler
// ============================================================================
static void wifi_event_handler(void* arg, esp_event_base_t event_base,
                               int32_t event_id, void* event_data) {
    if (event_base == WIFI_EVENT) {
        switch (event_id) {
            case WIFI_EVENT_AP_START:
                s_ap_started = true;
                LOG_I("NET", "WiFi AP started event received");
                break;
            case WIFI_EVENT_AP_STOP:
                s_ap_started = false;
                LOG_I("NET", "WiFi AP stopped event received");
                break;
            case WIFI_EVENT_AP_STACONNECTED: {
                wifi_event_ap_staconnected_t* event = (wifi_event_ap_staconnected_t*) event_data;
                LOG_I("NET", "Station connected: MAC=" MACSTR, MAC2STR(event->mac));
                break;
            }
            case WIFI_EVENT_AP_STADISCONNECTED: {
                wifi_event_ap_stadisconnected_t* event = (wifi_event_ap_stadisconnected_t*) event_data;
                LOG_I("NET", "Station disconnected: MAC=" MACSTR, MAC2STR(event->mac));
                break;
            }
            default:
                break;
        }
    }
}

// ============================================================================
// SSID Generation (ELEGOO Convention)
// ============================================================================
static void generate_ssid() {
    // Generate SSID from MAC address - matches ELEGOO method
    uint64_t chipid = ESP.getEfuseMac();
    
    char mac0[5];
    char mac1[9];
    sprintf(mac0, "%04X", (uint16_t)(chipid >> 32));
    sprintf(mac1, "%08X", (uint32_t)chipid);
    
    s_mac_suffix = String(mac0) + String(mac1);
    s_ssid = String(CONFIG_WIFI_SSID_PREFIX) + s_mac_suffix;
}

// ============================================================================
// Network Initialization (Synchronous - ELEGOO Pattern)
// ============================================================================
// NOTE: This function now only sets flags - actual WiFi init happens in net_tick()
// This prevents TG1WDT starvation by allowing setup() to complete before blocking calls
bool net_init_sync() {
    // Generate SSID from MAC address
    generate_ssid();
    LOG_I("NET", "SSID: %s", s_ssid.c_str());
    
    // ESP-IDF WiFi initialization happens in net_tick() state machine
    // This prevents blocking calls during setup() and allows proper watchdog handling
    LOG_I("NET", "Starting WiFi initialization (will complete in loop)...");
    s_status = NetStatus::INITIALIZING;
    s_init_state = WiFiInitState::SET_MODE;  // Skip GENERATE_SSID since we already did it
    s_init_start_time = millis();
    s_error_message = "Initializing";
    
    // Return true to indicate initialization started
    // Actual completion will happen via net_tick() in loop()
    return true;
}

// ============================================================================
// Network Initialization (Non-Blocking State Machine)
// ============================================================================
bool net_start() {
    if (s_init_state != WiFiInitState::IDLE) {
        // Already started or in progress
        return false;
    }
    
    LOG_I("NET", "Starting WiFi Access Point initialization...");
    s_status = NetStatus::INITIALIZING;
    s_init_state = WiFiInitState::GENERATE_SSID;
    s_init_start_time = millis();
    s_error_message = "Initializing";
    
    return true;
}

bool net_tick() {
    // Debug logging (non-blocking - use ESP_LOG instead of Serial)
    // Removed Serial.printf() to prevent blocking when Serial not connected
    
    // Check for software timeout (robust boot timeout)
    if (s_init_state != WiFiInitState::IDLE && 
        s_init_state != WiFiInitState::DONE && 
        s_init_state != WiFiInitState::ERROR) {
        unsigned long elapsed = millis() - s_init_start_time;
        if (elapsed > BOOT_WIFI_TIMEOUT_MS) {
            s_init_state = WiFiInitState::ERROR;
            s_status = NetStatus::TIMEOUT;
            s_error_message = "Boot WiFi initialization timeout";
            LOG_E("NET", "WiFi initialization timeout after %lu ms (limit: %lu ms)", 
                  elapsed, BOOT_WIFI_TIMEOUT_MS);
            LOG_W("NET", "Continuing boot WITHOUT WiFi (safe mode)");
            // Use ESP_LOG instead of Serial (non-blocking)
            ESP_LOGW("NET", "WiFi init FAILED - continuing without WiFi");
            return false;
        }
    }
    
    // Advance state machine
    switch (s_init_state) {
        case WiFiInitState::IDLE:
            // Not started yet
            return false;
            
        case WiFiInitState::GENERATE_SSID: {
            // Generate SSID from MAC address
            generate_ssid();
            LOG_I("NET", "SSID: %s", s_ssid.c_str());
            s_init_state = WiFiInitState::SET_MODE;
            return true;  // Continue to next state
        }
        
        case WiFiInitState::SET_MODE: {
            // Check software timeout before initialization
            unsigned long elapsed = millis() - s_init_start_time;
            if (elapsed > BOOT_WIFI_TIMEOUT_MS) {
                s_init_state = WiFiInitState::ERROR;
                s_status = NetStatus::TIMEOUT;
                s_error_message = "Timeout before SET_MODE";
                LOG_E("NET", "WiFi init timeout before SET_MODE");
                LOG_W("NET", "Continuing boot WITHOUT WiFi (safe mode)");
                return false;
            }
            
            // PRODUCTION FIX: Stop camera before WiFi initialization
            // Camera HAL interrupts can starve CPU during WiFi radio power-on
            if (camera_is_running()) {
                LOG_I("NET", "Stopping camera before WiFi initialization...");
                if (!camera_stop()) {
                    LOG_W("NET", "Camera stop failed - continuing WiFi init anyway");
                } else {
                    LOG_I("NET", "Camera stopped successfully - WiFi init can proceed");
                }
            } else {
                LOG_I("NET", "Camera already stopped - WiFi init can proceed");
            }
            
            // Clear Watchdog and yield to allow IDLE task to feed Group 0
            esp_task_wdt_reset();
            vTaskDelay(pdMS_TO_TICKS(100));  // Yield 100ms to IDLE task
            
            // Start WiFi initialization task if not already started
            // This task is NOT registered with watchdog to avoid resets during blocking calls
            if (!s_wifi_initialized && s_wifi_init_task_handle == NULL) {
                LOG_I("NET", "Starting ESP-IDF WiFi initialization task...");
                xTaskCreatePinnedToCore(
                    wifi_init_task,
                    "wifi_init",
                    4096,
                    NULL,
                    1,
                    &s_wifi_init_task_handle,
                    0  // Core 0
                );
                if (s_wifi_init_task_handle == NULL) {
                    s_init_state = WiFiInitState::ERROR;
                    s_status = NetStatus::ERROR;
                    s_error_message = "Failed to create WiFi init task";
                    LOG_E("NET", "Failed to create WiFi initialization task");
                    return false;
                }
                // Wait for initialization to complete (check on next tick)
                return true;
            }
            
            // Check if initialization is complete
            if (s_wifi_initialized) {
                // WiFi is initialized, continue to next state
                s_init_state = WiFiInitState::START_AP;
                return true;  // Continue to next state
            } else {
                // Still initializing, wait
                return true;
            }
        }
        
        case WiFiInitState::START_AP: {
            // Check software timeout before starting AP
            unsigned long elapsed = millis() - s_init_start_time;
            if (elapsed > BOOT_WIFI_TIMEOUT_MS) {
                s_init_state = WiFiInitState::ERROR;
                s_status = NetStatus::TIMEOUT;
                s_error_message = "Timeout before START_AP";
                LOG_E("NET", "WiFi init timeout before START_AP");
                LOG_W("NET", "Continuing boot WITHOUT WiFi (safe mode)");
                return false;
            }
            
            // Configure and start Access Point (non-blocking)
            LOG_I("NET", "Configuring AP '%s' on channel %d...", s_ssid.c_str(), CONFIG_WIFI_CHANNEL);
            
            wifi_config_t wifi_config = {};
            strncpy((char*)wifi_config.ap.ssid, s_ssid.c_str(), sizeof(wifi_config.ap.ssid) - 1);
            wifi_config.ap.ssid_len = strlen(s_ssid.c_str());
            wifi_config.ap.password[0] = '\0';  // Open network (no password)
            wifi_config.ap.channel = CONFIG_WIFI_CHANNEL;
            wifi_config.ap.max_connection = 4;
            wifi_config.ap.authmode = WIFI_AUTH_OPEN;
            wifi_config.ap.ssid_hidden = 0;
            
            esp_err_t ret = esp_wifi_set_config(WIFI_IF_AP, &wifi_config);
            if (ret != ESP_OK) {
                s_init_state = WiFiInitState::ERROR;
                s_status = NetStatus::ERROR;
                s_error_message = "Failed to set WiFi config";
                LOG_E("NET", "esp_wifi_set_config() failed: %s", esp_err_to_name(ret));
                return false;
            }
            
            // Start WiFi (non-blocking)
            unsigned long before_start = millis();
            ret = esp_wifi_start();
            if (ret != ESP_OK) {
                s_init_state = WiFiInitState::ERROR;
                s_status = NetStatus::ERROR;
                s_error_message = "Failed to start WiFi";
                LOG_E("NET", "esp_wifi_start() failed: %s", esp_err_to_name(ret));
                return false;
            }
            
            unsigned long after_start = millis();
            LOG_I("NET", "WiFi AP started (took %lu ms)", after_start - before_start);
            
            // CRITICAL: Set TX power AFTER esp_wifi_start() (WiFi must be started first)
            // This is the correct timing - esp_wifi_set_max_tx_power() requires WiFi to be started
            LOG_I("NET", "Setting TX power to %ddBm...", CONFIG_WIFI_TX_POWER / 4);
            ret = esp_wifi_set_max_tx_power(CONFIG_WIFI_TX_POWER);  // 60 = 15dBm
            if (ret != ESP_OK) {
                LOG_W("NET", "Failed to set TX power: %s (continuing anyway)", esp_err_to_name(ret));
            } else {
                LOG_I("NET", "TX power set to %ddBm", CONFIG_WIFI_TX_POWER / 4);
            }
            s_tx_power_dbm = CONFIG_WIFI_TX_POWER / 4;  // Cache for status reporting
            
            s_init_state = WiFiInitState::WAIT_STABLE;
            s_stable_wait_start = millis();
            s_stable_wait_count = 0;
            return true;  // Continue to next state
        }
        
        case WiFiInitState::WAIT_STABLE: {
            // Wait for AP to start and stabilize
            // Check if AP started event was received or wait for IP assignment
            unsigned long wait_elapsed = millis() - s_stable_wait_start;
            
            // Wait for AP to be ready (check event flag or wait 1 second)
            if (s_ap_started || wait_elapsed >= 1000) {
                // PRODUCTION FIX: Resume camera after WiFi is stable
                // Camera was stopped before WiFi init to prevent interrupt contention
                LOG_I("NET", "Resuming camera after WiFi init...");
                if (!camera_resume()) {
                    LOG_W("NET", "Camera resume failed - continuing without camera");
                } else {
                    LOG_I("NET", "Camera resumed successfully");
                }
                // Get IP address
                esp_netif_ip_info_t ip_info;
                esp_err_t ret = esp_netif_get_ip_info(s_ap_netif, &ip_info);
                
                if (ret == ESP_OK) {
                    // Status change to AP_ACTIVE (use ESP_LOG for non-blocking logging)
                    ESP_LOGD("NET", "Setting status to AP_ACTIVE at %lu ms", millis());
                    s_init_state = WiFiInitState::DONE;
                    s_status = NetStatus::AP_ACTIVE;
                    s_start_time = millis();
                    s_error_message = "OK";
                    
                    ESP_LOGD("NET", "Status set: state=%d, status=%d, net_is_ok()=%d",
                             (int)s_init_state, (int)s_status, (s_status == NetStatus::AP_ACTIVE));
                    
                    char ip_str[16];
                    snprintf(ip_str, sizeof(ip_str), IPSTR, IP2STR(&ip_info.ip));
                    LOG_I("NET", "AP IP: %s", ip_str);
                    LOG_I("NET", "WiFi Access Point ready");
                    
                    // Print connection instructions (non-blocking - Serial buffers output)
                    // REMOVED: Serial.flush() - This blocks when Serial is not connected
                    // Serial operations are buffered and will drain automatically when connected
                    // If Serial is not connected, we don't want to block here
                    if (Serial.availableForWrite() >= 200) {  // Check buffer space before writing
                        Serial.println(":----------------------------:");
                        Serial.printf("wifi_name:%s\n", s_ssid.c_str());
                        Serial.println(":----------------------------:");
                        Serial.printf("WiFi Ready! Use 'http://%s' to connect\n", ip_str);
                        
                        // Send READY marker to bridge (signals WiFi is ready and ESP32 can handle commands)
                        Serial.println("READY");
                    }
                    
                    // Use ESP_LOG for critical messages (non-blocking, always works)
                    ESP_LOGI("NET", "WiFi AP ready: SSID=%s, IP=%s", s_ssid.c_str(), ip_str);
                    
                    return false;  // Done
                } else {
                    // IP not ready yet, continue waiting
                    if (wait_elapsed >= 2000) {  // 2 second timeout for IP assignment
                        LOG_W("NET", "AP started but IP not assigned after 2 seconds");
                        // Continue anyway - IP might be assigned later
                        s_init_state = WiFiInitState::DONE;
                        s_status = NetStatus::AP_ACTIVE;
                        s_start_time = millis();
                        s_error_message = "OK (IP pending)";
                        return false;
                    }
                }
            }
            
            return true;  // Still waiting
        }
        
        case WiFiInitState::DONE:
            // Initialization complete
            return false;
    }
    
    return false;
}

// ============================================================================
// Status Functions
// ============================================================================
NetStatus net_status() {
    return s_status;
}

bool net_is_ok() {
    return s_status == NetStatus::AP_ACTIVE;
}

IPAddress net_get_ip() {
    if (s_status != NetStatus::AP_ACTIVE || !s_ap_netif) {
        return IPAddress(0, 0, 0, 0);
    }
    
    esp_netif_ip_info_t ip_info;
    esp_err_t ret = esp_netif_get_ip_info(s_ap_netif, &ip_info);
    if (ret != ESP_OK) {
        return IPAddress(0, 0, 0, 0);
    }
    
    return IPAddress(ip_info.ip.addr);
}

String net_get_ssid() {
    return s_ssid;
}

String net_get_mac_suffix() {
    return s_mac_suffix;
}

int8_t net_get_rssi() {
    // In AP mode, we don't have RSSI, return TX power instead
    if (s_status != NetStatus::AP_ACTIVE) {
        return 0;
    }
    
    int8_t power = 0;
    esp_err_t ret = esp_wifi_get_max_tx_power(&power);
    if (ret == ESP_OK) {
        // Convert from 0.25dBm units to dBm
        return power / 4;
    }
    
    // Return cached value if API call fails
    return s_tx_power_dbm;
}

uint8_t net_get_station_count() {
    if (s_status != NetStatus::AP_ACTIVE) {
        return 0;
    }
    
    wifi_sta_list_t sta_list;
    esp_err_t ret = esp_wifi_ap_get_sta_list(&sta_list);
    if (ret != ESP_OK) {
        return 0;
    }
    
    return sta_list.num;
}

NetStats net_get_stats() {
    NetStats stats;
    stats.connected_stations = net_get_station_count();
    stats.tx_power = net_get_rssi();
    stats.uptime_ms = (s_status == NetStatus::AP_ACTIVE) ? (millis() - s_start_time) : 0;
    stats.last_client_ts = 0;  // Not tracked yet
    return stats;
}

const char* net_last_error() {
    return s_error_message;
}

