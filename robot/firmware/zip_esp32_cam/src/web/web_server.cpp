/**
 * Web Server - Implementation
 * 
 * HTTP endpoints for camera streaming and diagnostics.
 * Resilient design: server runs even if camera fails.
 */

#include "web_server.h"
#include <Arduino.h>
#include "esp_http_server.h"
#include "esp_camera.h"
#include "esp_task_wdt.h"
#include "esp_err.h"
#include <string.h>
#include "config/build_config.h"
#include "config/runtime_config.h"
#include "drivers/camera/camera_service.h"
#include "drivers/uart/uart_bridge.h"
#include "net/net_service.h"

// ============================================================================
// Module State
// ============================================================================
static httpd_handle_t s_main_httpd = NULL;
static httpd_handle_t s_stream_httpd = NULL;
static bool s_initialized = false;
static const char* s_error_message = "Not initialized";

// ============================================================================
// Stream Constants (MJPEG multipart)
// ============================================================================
#define PART_BOUNDARY "123456789000000000000987654321"
static const char* STREAM_CONTENT_TYPE = "multipart/x-mixed-replace;boundary=" PART_BOUNDARY;
static const char* STREAM_BOUNDARY = "\r\n--" PART_BOUNDARY "\r\n";
static const char* STREAM_PART = "Content-Type: image/jpeg\r\nContent-Length: %u\r\n\r\n";

// ============================================================================
// Index Handler (/)
// ============================================================================
static esp_err_t index_handler(httpd_req_t *req) {
    const char* html = 
        "<!DOCTYPE html><html><head><title>ELEGOO Camera</title></head><body>"
        "<h1>ELEGOO Camera</h1>"
        "<p><a href='/stream'>Video Stream</a></p>"
        "<p><a href='/capture'>Capture Image</a></p>"
        "<p><a href='/health'>Health Status (JSON)</a></p>"
        "</body></html>";
    
    httpd_resp_set_type(req, "text/html");
    return httpd_resp_send(req, html, strlen(html));
}

// ============================================================================
// Capture Handler (/capture)
// ============================================================================
static esp_err_t capture_handler(httpd_req_t *req) {
    if (!camera_is_ok()) {
        httpd_resp_set_status(req, "503 Service Unavailable");
        httpd_resp_set_type(req, "text/plain");
        const char* msg = "Camera not available";
        return httpd_resp_send(req, msg, strlen(msg));
    }
    
    camera_fb_t *fb = camera_capture();
    if (!fb) {
        httpd_resp_send_500(req);
        return ESP_FAIL;
    }
    
    httpd_resp_set_type(req, "image/jpeg");
    httpd_resp_set_hdr(req, "Content-Disposition", "inline; filename=capture.jpg");
    httpd_resp_set_hdr(req, "Access-Control-Allow-Origin", "*");
    
    esp_err_t res = httpd_resp_send(req, (const char*)fb->buf, fb->len);
    camera_return_frame(fb);
    
    return res;
}

// ============================================================================
// Stream Handler (/stream) - Port 81
// ============================================================================
#if ENABLE_STREAM
static esp_err_t stream_handler(httpd_req_t *req) {
    if (!camera_is_ok()) {
        httpd_resp_set_status(req, "503 Service Unavailable");
        httpd_resp_set_type(req, "text/plain");
        const char* msg = "Camera not available";
        return httpd_resp_send(req, msg, strlen(msg));
    }
    
    camera_fb_t *fb = NULL;
    esp_err_t res = ESP_OK;
    char part_buf[64];
    
    res = httpd_resp_set_type(req, STREAM_CONTENT_TYPE);
    if (res != ESP_OK) return res;
    
    httpd_resp_set_hdr(req, "Access-Control-Allow-Origin", "*");
    
    while (true) {
        // #region agent log - Hypothesis E: Feed watchdog in stream loop
        esp_task_wdt_reset();  // Feed watchdog in stream loop
        // #endregion
        
        fb = camera_capture();
        if (!fb) {
            LOG_W("WEB", "Stream capture failed");
            res = ESP_FAIL;
            break;
        }
        
        size_t hlen = snprintf(part_buf, sizeof(part_buf), STREAM_PART, fb->len);
        res = httpd_resp_send_chunk(req, part_buf, hlen);
        if (res == ESP_OK) {
            res = httpd_resp_send_chunk(req, (const char*)fb->buf, fb->len);
        }
        if (res == ESP_OK) {
            res = httpd_resp_send_chunk(req, STREAM_BOUNDARY, strlen(STREAM_BOUNDARY));
        }
        
        camera_return_frame(fb);
        
        if (res != ESP_OK) break;
    }
    
    return res;
}
#endif

// ============================================================================
// Health Handler (/health) - JSON diagnostics
// ============================================================================
#if ENABLE_HEALTH_ENDPOINT
static esp_err_t health_handler(httpd_req_t *req) {
    // Get stats from all subsystems
    CameraStats cam_stats = camera_get_stats();
    UartStats uart_stats = uart_get_stats();
    NetStats net_stats = net_get_stats();
    
    // Get camera status string
    const char* cam_status_str;
    switch (camera_status()) {
        case CameraStatus::OK:              cam_status_str = "OK"; break;
        case CameraStatus::NOT_INITIALIZED: cam_status_str = "NOT_INITIALIZED"; break;
        case CameraStatus::INIT_FAILED:     cam_status_str = "INIT_FAILED"; break;
        case CameraStatus::CAPTURE_FAILED:  cam_status_str = "CAPTURE_FAILED"; break;
        case CameraStatus::NO_PSRAM:        cam_status_str = "NO_PSRAM"; break;
        default:                            cam_status_str = "UNKNOWN"; break;
    }
    
    // Get network status string
    const char* net_status_str;
    switch (net_status()) {
        case NetStatus::DISCONNECTED: net_status_str = "DISCONNECTED"; break;
        case NetStatus::INITIALIZING:  net_status_str = "INITIALIZING"; break;
        case NetStatus::AP_ACTIVE:     net_status_str = "AP_ACTIVE"; break;
        case NetStatus::ERROR:         net_status_str = "ERROR"; break;
        case NetStatus::TIMEOUT:       net_status_str = "TIMEOUT"; break;
        default:                       net_status_str = "UNKNOWN"; break;
    }
    
    // Get ESP error code name for camera (with safe null handling)
    int cam_error_code = camera_last_error_code();
    static char cam_error_code_str_buf[32];  // Static buffer for error code string
    const char* cam_error_code_str = "ESP_OK";
    if (cam_error_code != 0) {
        // Try to get error name - fallback to hex if not available
        const char* err_name = esp_err_to_name((esp_err_t)cam_error_code);
        if (err_name && strlen(err_name) > 0) {
            // Copy to static buffer to ensure it's valid
            strncpy(cam_error_code_str_buf, err_name, sizeof(cam_error_code_str_buf) - 1);
            cam_error_code_str_buf[sizeof(cam_error_code_str_buf) - 1] = '\0';
            cam_error_code_str = cam_error_code_str_buf;
        } else {
            // Fallback to hex
            snprintf(cam_error_code_str_buf, sizeof(cam_error_code_str_buf), "0x%x", cam_error_code);
            cam_error_code_str = cam_error_code_str_buf;
        }
    }
    
    // Calculate time since last UART activity
    unsigned long uart_idle_ms = 0;
    if (uart_stats.last_rx_ts > 0) {
        unsigned long now = millis();
        if (now >= uart_stats.last_rx_ts) {
            uart_idle_ms = now - uart_stats.last_rx_ts;
        }
    }
    
    // Calculate time since last camera capture
    unsigned long cam_idle_ms = 0;
    if (cam_stats.last_capture_time > 0) {
        unsigned long now = millis();
        if (now >= cam_stats.last_capture_time) {
            cam_idle_ms = now - cam_stats.last_capture_time;
        }
    }
    
    // CRITICAL: Store String objects in local variables to ensure they stay alive during snprintf
    // String.c_str() returns pointer to internal buffer - must keep String object alive
    String wifi_ssid = net_get_ssid();
    String wifi_ip = net_get_ip().toString();
    const char* wifi_ssid_cstr = wifi_ssid.c_str();
    const char* wifi_ip_cstr = wifi_ip.c_str();
    const char* cam_error_msg = camera_last_error();
    const char* net_error_msg = net_last_error();
    const char* chip_model = ESP.getChipModel();
    
    // Build JSON response with enhanced diagnostics
    // Use larger buffer to prevent overflow - JSON can be ~2000+ bytes with all fields
    // ESP32-S3 has limited stack, so use static buffer
    static char json[3072];  // 3KB static buffer for detailed diagnostics
    int len = snprintf(json, sizeof(json),
        "{"
        "\"camera\":{"
            "\"init_ok\":%s,"
            "\"status\":\"%s\","
            "\"last_error\":\"%s\","
            "\"error_code\":%d,"
            "\"error_code_name\":\"%s\","
            "\"captures\":%lu,"
            "\"failures\":%lu,"
            "\"last_capture_ms\":%lu,"
            "\"last_frame_bytes\":%lu,"
            "\"last_capture_time\":%lu,"
            "\"idle_ms\":%lu"
        "},"
        "\"uart\":{"
            "\"init_ok\":%s,"
            "\"rx_pin\":%d,"
            "\"tx_pin\":%d,"
            "\"rx_bytes\":%lu,"
            "\"tx_bytes\":%lu,"
            "\"rx_frames\":%lu,"
            "\"tx_frames\":%lu,"
            "\"framing_errors\":%lu,"
            "\"buffer_overflows\":%lu,"
            "\"last_rx_ts\":%lu,"
            "\"last_tx_ts\":%lu,"
            "\"idle_ms\":%lu,"
            "\"rx_available\":%lu"
        "},"
        "\"wifi\":{"
            "\"status\":\"%s\","
            "\"init_ok\":%s,"
            "\"mode\":\"AP\","
            "\"ssid\":\"%s\","
            "\"ip\":\"%s\","
            "\"tx_power\":%d,"
            "\"stations\":%d,"
            "\"uptime_ms\":%lu,"
            "\"last_error\":\"%s\""
        "},"
        "\"psram\":{"
            "\"detected\":%s,"
            "\"bytes\":%lu,"
            "\"free\":%lu,"
            "\"used\":%lu"
        "},"
        "\"heap\":{"
            "\"free\":%lu,"
            "\"min_free\":%lu,"
            "\"largest_free_block\":%lu"
        "},"
        "\"chip\":{"
            "\"model\":\"%s\","
            "\"revision\":%d,"
            "\"cores\":%d,"
            "\"freq_mhz\":%lu,"
            "\"flash_size_mb\":%lu"
        "}"
        "}",
        // Camera - use safe string handling
        camera_is_ok() ? "true" : "false",
        cam_status_str ? cam_status_str : "UNKNOWN",
        cam_error_msg ? cam_error_msg : "Unknown",
        cam_error_code,
        cam_error_code_str ? cam_error_code_str : "ESP_OK",
        (unsigned long)cam_stats.captures,
        (unsigned long)cam_stats.failures,
        (unsigned long)cam_stats.last_capture_ms,
        (unsigned long)cam_stats.last_frame_bytes,
        (unsigned long)cam_stats.last_capture_time,
        (unsigned long)cam_idle_ms,
        // UART
        uart_is_ok() ? "true" : "false",
        uart_get_rx_pin(),
        uart_get_tx_pin(),
        (unsigned long)uart_stats.rx_bytes,
        (unsigned long)uart_stats.tx_bytes,
        (unsigned long)uart_stats.rx_frames,
        (unsigned long)uart_stats.tx_frames,
        (unsigned long)uart_stats.framing_errors,
        (unsigned long)uart_stats.buffer_overflows,
        (unsigned long)uart_stats.last_rx_ts,
        (unsigned long)uart_stats.last_tx_ts,
        (unsigned long)uart_idle_ms,
        (unsigned long)uart_rx_available(),
        // WiFi - use safe string handling (String objects stored above)
        net_status_str ? net_status_str : "UNKNOWN",
        net_is_ok() ? "true" : "false",
        wifi_ssid_cstr ? wifi_ssid_cstr : "",
        wifi_ip_cstr ? wifi_ip_cstr : "0.0.0.0",
        (int)net_stats.tx_power,
        (int)net_stats.connected_stations,
        (unsigned long)net_stats.uptime_ms,
        net_error_msg ? net_error_msg : "OK",
        // PSRAM
        psramFound() ? "true" : "false",
        (unsigned long)ESP.getPsramSize(),
        (unsigned long)ESP.getFreePsram(),
        (unsigned long)(ESP.getPsramSize() - ESP.getFreePsram()),
        // Heap
        (unsigned long)ESP.getFreeHeap(),
        (unsigned long)ESP.getMinFreeHeap(),
        (unsigned long)ESP.getMaxAllocHeap(),
        // Chip - use safe string handling (stored above)
        chip_model ? chip_model : "Unknown",
        ESP.getChipRevision(),
        ESP.getChipCores(),
        (unsigned long)ESP.getCpuFreqMHz(),
        (unsigned long)(ESP.getFlashChipSize() / (1024 * 1024))
    );
    
    // Check for buffer overflow
    if (len < 0 || len >= (int)sizeof(json)) {
        // Buffer overflow or error - send minimal response
        const char* error_json = "{\"error\":\"Health endpoint buffer overflow\"}";
        httpd_resp_set_type(req, "application/json");
        httpd_resp_set_hdr(req, "Access-Control-Allow-Origin", "*");
        return httpd_resp_send(req, error_json, strlen(error_json));
    }
    
    httpd_resp_set_type(req, "application/json");
    httpd_resp_set_hdr(req, "Access-Control-Allow-Origin", "*");
    return httpd_resp_send(req, json, len);
}
#endif

// ============================================================================
// Metrics Handler (/metrics) - Plain text Prometheus-style
// ============================================================================
#if ENABLE_METRICS_ENDPOINT
static esp_err_t metrics_handler(httpd_req_t *req) {
    CameraStats cam_stats = camera_get_stats();
    UartStats uart_stats = uart_get_stats();
    
    char metrics[512];
    int len = snprintf(metrics, sizeof(metrics),
        "# HELP camera_captures_total Total camera captures\n"
        "camera_captures_total %lu\n"
        "# HELP camera_failures_total Total capture failures\n"
        "camera_failures_total %lu\n"
        "# HELP uart_rx_bytes_total UART bytes received\n"
        "uart_rx_bytes_total %lu\n"
        "# HELP uart_tx_bytes_total UART bytes transmitted\n"
        "uart_tx_bytes_total %lu\n"
        "# HELP heap_free_bytes Free heap memory\n"
        "heap_free_bytes %lu\n"
        "# HELP psram_free_bytes Free PSRAM\n"
        "psram_free_bytes %lu\n",
        (unsigned long)cam_stats.captures,
        (unsigned long)cam_stats.failures,
        (unsigned long)uart_stats.rx_bytes,
        (unsigned long)uart_stats.tx_bytes,
        (unsigned long)ESP.getFreeHeap(),
        (unsigned long)ESP.getFreePsram()
    );
    
    httpd_resp_set_type(req, "text/plain");
    return httpd_resp_send(req, metrics, len);
}
#endif

// ============================================================================
// Server Initialization
// ============================================================================
bool web_server_init() {
    LOG_I("WEB", "Starting HTTP servers...");
    
    // Main server on port 80
    httpd_config_t config = HTTPD_DEFAULT_CONFIG();
    config.server_port = CONFIG_HTTP_PORT;
    
    httpd_uri_t index_uri = {
        .uri = "/",
        .method = HTTP_GET,
        .handler = index_handler,
        .user_ctx = NULL
    };
    
    httpd_uri_t capture_uri = {
        .uri = "/capture",
        .method = HTTP_GET,
        .handler = capture_handler,
        .user_ctx = NULL
    };
    
#if ENABLE_HEALTH_ENDPOINT
    httpd_uri_t health_uri = {
        .uri = "/health",
        .method = HTTP_GET,
        .handler = health_handler,
        .user_ctx = NULL
    };
#endif

#if ENABLE_METRICS_ENDPOINT
    httpd_uri_t metrics_uri = {
        .uri = "/metrics",
        .method = HTTP_GET,
        .handler = metrics_handler,
        .user_ctx = NULL
    };
#endif
    
    LOG_I("WEB", "Starting main server on port %d", CONFIG_HTTP_PORT);
    esp_err_t err = httpd_start(&s_main_httpd, &config);
    if (err != ESP_OK) {
        s_error_message = "Main server start failed";
        LOG_E("WEB", "Failed to start main server: %d", err);
        return false;
    }
    
    httpd_register_uri_handler(s_main_httpd, &index_uri);
    httpd_register_uri_handler(s_main_httpd, &capture_uri);
#if ENABLE_HEALTH_ENDPOINT
    httpd_register_uri_handler(s_main_httpd, &health_uri);
#endif
#if ENABLE_METRICS_ENDPOINT
    httpd_register_uri_handler(s_main_httpd, &metrics_uri);
#endif
    
    LOG_I("WEB", "Main server started");
    
#if ENABLE_STREAM
    // Stream server on port 81
    config.server_port = CONFIG_STREAM_PORT;
    config.ctrl_port = CONFIG_STREAM_PORT + 32768;  // Control port offset
    
    httpd_uri_t stream_uri = {
        .uri = "/stream",
        .method = HTTP_GET,
        .handler = stream_handler,
        .user_ctx = NULL
    };
    
    LOG_I("WEB", "Starting stream server on port %d", CONFIG_STREAM_PORT);
    err = httpd_start(&s_stream_httpd, &config);
    if (err != ESP_OK) {
        LOG_W("WEB", "Failed to start stream server: %d", err);
        // Don't fail completely - main server is still running
    } else {
        httpd_register_uri_handler(s_stream_httpd, &stream_uri);
        LOG_I("WEB", "Stream server started");
    }
#endif
    
    s_initialized = true;
    s_error_message = "OK";
    
    LOG_I("WEB", "HTTP servers ready");
    return true;
}

bool web_server_is_ok() {
    return s_initialized && s_main_httpd != NULL;
}

void web_server_stop() {
    if (s_main_httpd) {
        httpd_stop(s_main_httpd);
        s_main_httpd = NULL;
    }
    if (s_stream_httpd) {
        httpd_stop(s_stream_httpd);
        s_stream_httpd = NULL;
    }
    s_initialized = false;
    LOG_I("WEB", "HTTP servers stopped");
}

const char* web_server_last_error() {
    return s_error_message;
}

