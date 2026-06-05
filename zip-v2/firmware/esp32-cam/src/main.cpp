/**
 * ZIP V2 — ESP32-S3 OV2640 STA-mode MJPEG camera (rev B).
 *
 * Joins the home Wi-Fi (creds in `secrets.h`, gitignored), publishes:
 *
 *   GET  /          — small text identity page
 *   GET  /health    — JSON status (ip, rssi, uptime, ssid)
 *   GET  /stream    — multipart/x-mixed-replace MJPEG
 *
 * Critical: streaming goes through ESP-IDF's `esp_http_server` (httpd),
 * NOT the Arduino `WebServer.h`. The Arduino one is synchronous and adds
 * massive per-byte overhead — we measured 2.4 fps with it. httpd uses the
 * native chunked-encoding sender, the camera framework's PSRAM frame
 * buffers, and zero-copy chunk sends. This is the same pattern as the
 * canonical Espressif CameraWebServer example, which reliably hits 15-25
 * fps at VGA on the ESP32-S3.
 *
 * The Arduino `WiFi.h`, `ESPmDNS.h` etc. still bring up Wi-Fi + mDNS, but
 * the small `/`  and `/health` pages are also served via httpd.
 */

#include <Arduino.h>
#include <ESPmDNS.h>
#include <WiFi.h>

#include "esp_camera.h"
#include "esp_http_server.h"
#include "esp_log.h"

#include "secrets.h"

// ---------------------------------------------------------------------------
// OV2640 pin map (Elegoo SmartCar V4 with ESP32-S3-WROOM-1)
// ---------------------------------------------------------------------------
#define PWDN_GPIO_NUM   -1
#define RESET_GPIO_NUM  -1
#define XCLK_GPIO_NUM   15
#define SIOD_GPIO_NUM    4
#define SIOC_GPIO_NUM    5
#define Y2_GPIO_NUM     11
#define Y3_GPIO_NUM      9
#define Y4_GPIO_NUM      8
#define Y5_GPIO_NUM     10
#define Y6_GPIO_NUM     12
#define Y7_GPIO_NUM     18
#define Y8_GPIO_NUM     17
#define Y9_GPIO_NUM     16
#define VSYNC_GPIO_NUM   6
#define HREF_GPIO_NUM    7
#define PCLK_GPIO_NUM   13

#define STREAM_PORT  81
#define HOSTNAME     "zip-esp32-cam"
#define BOUNDARY     "zipmjpeg"

static const char* PART_HDR =
    "\r\n--" BOUNDARY "\r\n"
    "Content-Type: image/jpeg\r\n"
    "Content-Length: %u\r\n"
    "X-Timestamp: %lld\r\n"
    "\r\n";

static const char* CONTENT_TYPE_STREAM = "multipart/x-mixed-replace; boundary=" BOUNDARY;

static httpd_handle_t s_server = NULL;

// ---------------------------------------------------------------------------
// Camera init
// ---------------------------------------------------------------------------
static bool init_camera() {
    camera_config_t config = {};
    config.ledc_channel = LEDC_CHANNEL_0;
    config.ledc_timer   = LEDC_TIMER_0;
    config.pin_d0 = Y2_GPIO_NUM;
    config.pin_d1 = Y3_GPIO_NUM;
    config.pin_d2 = Y4_GPIO_NUM;
    config.pin_d3 = Y5_GPIO_NUM;
    config.pin_d4 = Y6_GPIO_NUM;
    config.pin_d5 = Y7_GPIO_NUM;
    config.pin_d6 = Y8_GPIO_NUM;
    config.pin_d7 = Y9_GPIO_NUM;
    config.pin_xclk     = XCLK_GPIO_NUM;
    config.pin_pclk     = PCLK_GPIO_NUM;
    config.pin_vsync    = VSYNC_GPIO_NUM;
    config.pin_href     = HREF_GPIO_NUM;
    config.pin_sscb_sda = SIOD_GPIO_NUM;
    config.pin_sscb_scl = SIOC_GPIO_NUM;
    config.pin_pwdn     = PWDN_GPIO_NUM;
    config.pin_reset    = RESET_GPIO_NUM;
    // 10 MHz XCLK (NOT 20). The Elegoo board layout EMI-couples a 20 MHz
    // camera clock into the Wi-Fi antenna, gutting Wi-Fi TX throughput.
    // V1's `runtime_config.h` documents the same finding — keep it at 10 MHz.
    config.xclk_freq_hz = 10000000;
    config.frame_size   = FRAMESIZE_VGA;  // 640x480
    config.pixel_format = PIXFORMAT_JPEG;
    config.grab_mode    = CAMERA_GRAB_LATEST;
    config.fb_location  = CAMERA_FB_IN_PSRAM;
    config.jpeg_quality = 12;             // 1-63, lower = better
    config.fb_count     = 2;              // double-buffer in PSRAM

    esp_err_t err = esp_camera_init(&config);
    if (err != ESP_OK) {
        Serial.printf("[CAM] init failed: 0x%x\n", err);
        return false;
    }
    Serial.println("[CAM] OV2640 init OK (VGA, JPEG q=12, 20MHz XCLK, fb=2 PSRAM)");
    return true;
}

// ---------------------------------------------------------------------------
// /stream — fast chunked MJPEG via httpd
// ---------------------------------------------------------------------------
static esp_err_t stream_handler(httpd_req_t* req) {
    esp_err_t res = httpd_resp_set_type(req, CONTENT_TYPE_STREAM);
    if (res != ESP_OK) return res;
    httpd_resp_set_hdr(req, "Access-Control-Allow-Origin", "*");
    httpd_resp_set_hdr(req, "X-Framerate", "60");

    char part_buf[128];
    int64_t frames = 0;
    int64_t t_start = esp_timer_get_time();

    while (true) {
        camera_fb_t* fb = esp_camera_fb_get();
        if (!fb) {
            ESP_LOGW("STREAM", "fb_get failed; skipping");
            vTaskDelay(pdMS_TO_TICKS(5));
            continue;
        }

        size_t hlen = snprintf(part_buf, sizeof(part_buf), PART_HDR,
                               (unsigned)fb->len, esp_timer_get_time());

        if ((res = httpd_resp_send_chunk(req, part_buf, hlen)) != ESP_OK) {
            esp_camera_fb_return(fb);
            break;
        }
        if ((res = httpd_resp_send_chunk(req, (const char*)fb->buf, fb->len)) != ESP_OK) {
            esp_camera_fb_return(fb);
            break;
        }
        esp_camera_fb_return(fb);

        ++frames;
        if (frames % 30 == 0) {
            int64_t dt = esp_timer_get_time() - t_start;
            Serial.printf("[STREAM] %lld frames, %.1f fps avg\n",
                          frames, (double)frames * 1e6 / (double)dt);
        }
        // No delay: let WiFi TX backpressure dictate the rate.
    }

    Serial.println("[STREAM] client disconnected");
    return ESP_OK;
}

// ---------------------------------------------------------------------------
// /health, /
// ---------------------------------------------------------------------------
static esp_err_t health_handler(httpd_req_t* req) {
    char buf[256];
    int n = snprintf(buf, sizeof(buf),
                     "{\"ok\":true,\"ssid\":\"%s\",\"ip\":\"%s\",\"rssi\":%d,"
                     "\"uptime_ms\":%lu,\"hostname\":\"%s\"}",
                     WiFi.SSID().c_str(),
                     WiFi.localIP().toString().c_str(),
                     WiFi.RSSI(), (unsigned long)millis(), HOSTNAME);
    httpd_resp_set_type(req, "application/json");
    httpd_resp_set_hdr(req, "Access-Control-Allow-Origin", "*");
    return httpd_resp_send(req, buf, n);
}

static esp_err_t root_handler(httpd_req_t* req) {
    const char* body =
        "ZIP V2 // ESP32-S3 OV2640 (httpd)\n"
        "GET /stream — MJPEG\n"
        "GET /health — JSON\n";
    httpd_resp_set_type(req, "text/plain");
    return httpd_resp_send(req, body, strlen(body));
}

// ---------------------------------------------------------------------------
// httpd setup
// ---------------------------------------------------------------------------
static void start_http() {
    httpd_config_t config = HTTPD_DEFAULT_CONFIG();
    config.server_port = STREAM_PORT;
    config.ctrl_port   = STREAM_PORT;
    // Stream needs more stack than default.
    config.stack_size = 16 * 1024;
    // Allow at most 2 concurrent connections (e.g. one MJPEG + a /health
    // probe). The camera framework's frame buffers serialise anyway.
    config.max_open_sockets = 4;
    config.lru_purge_enable = true;

    if (httpd_start(&s_server, &config) != ESP_OK) {
        Serial.println("[HTTP] httpd_start failed");
        return;
    }

    httpd_uri_t stream_uri = {
        .uri = "/stream", .method = HTTP_GET, .handler = stream_handler, .user_ctx = NULL,
    };
    httpd_uri_t health_uri = {
        .uri = "/health", .method = HTTP_GET, .handler = health_handler, .user_ctx = NULL,
    };
    httpd_uri_t root_uri = {
        .uri = "/", .method = HTTP_GET, .handler = root_handler, .user_ctx = NULL,
    };
    httpd_register_uri_handler(s_server, &stream_uri);
    httpd_register_uri_handler(s_server, &health_uri);
    httpd_register_uri_handler(s_server, &root_uri);

    Serial.printf("[HTTP] httpd on http://%s:%d  (/stream, /health)\n",
                  WiFi.localIP().toString().c_str(), STREAM_PORT);
}

// ---------------------------------------------------------------------------
// Wi-Fi STA
// ---------------------------------------------------------------------------
static void connect_wifi() {
    WiFi.mode(WIFI_STA);
    WiFi.setHostname(HOSTNAME);
    WiFi.setSleep(false);
    Serial.printf("[WIFI] connecting to '%s' ...\n", ZIP_WIFI_SSID);
    WiFi.begin(ZIP_WIFI_SSID, ZIP_WIFI_PASSWORD);

    const unsigned long t0 = millis();
    while (WiFi.status() != WL_CONNECTED) {
        delay(500);
        Serial.print('.');
        if (millis() - t0 > 45000) {
            Serial.println("\n[WIFI] connect timeout — restarting");
            delay(500);
            ESP.restart();
        }
    }
    Serial.println();
    Serial.printf("[WIFI] connected: %s\n", WiFi.SSID().c_str());
    Serial.printf("[WIFI] IP   : %s\n", WiFi.localIP().toString().c_str());
    Serial.printf("[WIFI] RSSI : %d dBm\n", WiFi.RSSI());
    Serial.printf("[WIFI] MAC  : %s\n", WiFi.macAddress().c_str());
}

// ---------------------------------------------------------------------------
// Setup / Loop
// ---------------------------------------------------------------------------
void setup() {
    Serial.begin(115200);
    Serial.setTxTimeoutMs(0);  // never block on serial; chip runs even without host
    delay(250);
    Serial.println();
    Serial.println("======================================");
    Serial.println(" ZIP V2 ESP32-S3 STA Camera  v0.2 (httpd)");
    Serial.println("======================================");

    if (!init_camera()) {
        Serial.println("[FATAL] camera init failed — halting");
        while (true) delay(1000);
    }
    connect_wifi();

    if (MDNS.begin(HOSTNAME)) {
        MDNS.addService("http", "tcp", STREAM_PORT);
        Serial.printf("[MDNS] %s.local on :%d\n", HOSTNAME, STREAM_PORT);
    } else {
        Serial.println("[MDNS] init failed (non-fatal)");
    }

    start_http();
    Serial.println(":STREAM_READY:");
}

void loop() {
    if (WiFi.status() != WL_CONNECTED) {
        Serial.println("[WIFI] lost connection — reconnecting");
        connect_wifi();
    }
    delay(1000);  // httpd runs in its own task; main loop just monitors.
}
