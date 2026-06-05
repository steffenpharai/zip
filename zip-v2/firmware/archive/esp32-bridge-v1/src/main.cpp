/**
 * ZIP ESP32 Bridge - Main Implementation
 * 
 * Production-grade ESP32 Access Point bridge for the ZIP Robot.
 * Bridges WebSocket connections to UART communication with Arduino UNO.
 * 
 * Features:
 * - WiFi AP mode (configurable SSID/password)
 * - WebSocket server at /robot (single controller mode)
 * - UART bridge at 115200 baud
 * - Dead-man safety watchdog
 * - Motion command rate limiting (50Hz max)
 * - Health endpoint at /health
 * - mDNS (zip.local)
 */

#include <Arduino.h>
#include <WiFi.h>
#include <WebServer.h>
#include <WebSocketsServer.h>
#include <ESPmDNS.h>
#include "config.h"

// ============================================================================
// UART Configuration for ESP32-S3
// ============================================================================
// CRITICAL: On ESP32-S3, Serial is USB-CDC, NOT hardware UART!
// Must use HardwareSerial(1) with explicit pin binding to GPIO0/GPIO1.
// Serial2 does NOT properly bind to these pins on ESP32-S3.
HardwareSerial RobotSerial(1);  // UART1 peripheral

// ============================================================================
// Global State
// ============================================================================

// Servers
WebServer httpServer(HTTP_PORT);
WebSocketsServer wsServer(WS_PORT, WS_PATH);

// Controller state (-1 = no controller connected)
int8_t controllerClientNum = -1;

// UART ring buffer
static uint8_t rxBuffer[RX_BUFFER_SIZE];
static volatile size_t rxHead = 0;
static volatile size_t rxTail = 0;

// Line accumulation buffer
static char lineBuffer[MAX_LINE_LENGTH];
static size_t linePos = 0;

// Telemetry counters
static uint32_t rxLines = 0;
static uint32_t txLines = 0;
static uint32_t droppedLines = 0;
static uint32_t wsRxMessages = 0;
static uint32_t wsTxMessages = 0;

// Safety state
static unsigned long lastMotionTime = 0;
static bool motionWatchdogTriggered = false;
static unsigned long lastMotionForwardTime = 0;

// ============================================================================
// Ring Buffer Helpers
// ============================================================================

static inline size_t ringBufferCount() {
    if (rxHead >= rxTail) {
        return rxHead - rxTail;
    }
    return RX_BUFFER_SIZE - rxTail + rxHead;
}

static inline bool ringBufferFull() {
    return ringBufferCount() >= (RX_BUFFER_SIZE - 1);
}

static inline void ringBufferPush(uint8_t byte) {
    size_t next = (rxHead + 1) % RX_BUFFER_SIZE;
    if (next != rxTail) {
        rxBuffer[rxHead] = byte;
        rxHead = next;
    }
    // If full, silently drop (could add overflow counter)
}

static inline int ringBufferPop() {
    if (rxHead == rxTail) {
        return -1;
    }
    uint8_t byte = rxBuffer[rxTail];
    rxTail = (rxTail + 1) % RX_BUFFER_SIZE;
    return byte;
}

// ============================================================================
// Motion Command Detection
// ============================================================================

/**
 * Check if a message is a motion command (N=200 or N=999).
 * Uses lightweight pattern matching without full JSON parsing.
 * 
 * Looks for patterns like:
 *   "N":200  or  "N": 200
 *   "N":999  or  "N": 999
 */
static bool isMotionCommand(const char* msg, size_t len) {
    // Scan for "N": pattern
    for (size_t i = 0; i + 6 < len; i++) {
        if (msg[i] == '"' && msg[i+1] == 'N' && msg[i+2] == '"' && msg[i+3] == ':') {
            // Found "N": - now check the value
            size_t valStart = i + 4;
            
            // Skip optional whitespace
            while (valStart < len && (msg[valStart] == ' ' || msg[valStart] == '\t')) {
                valStart++;
            }
            
            // Parse the number
            int nValue = 0;
            while (valStart < len && msg[valStart] >= '0' && msg[valStart] <= '9') {
                nValue = nValue * 10 + (msg[valStart] - '0');
                valStart++;
            }
            
            // Check if it's a motion command
            if (nValue == MOTION_CMD_SETPOINT || nValue == MOTION_CMD_DIRECT) {
                return true;
            }
            
            // Only check first "N" field
            break;
        }
    }
    return false;
}

// ============================================================================
// UART Functions
// ============================================================================

// Boot guard state (GPIO0 is a boot strapping pin)
static bool uartBootGuardExpired = false;
static unsigned long uartBootStartTime = 0;
#define BOOT_GUARD_MS 1000  // Wait 1 second before enabling UART RX

/**
 * Initialize UART for communication with Arduino UNO.
 * 
 * CRITICAL HARDWARE ISSUE (ESP32-S3 Camera Board + SmartCar Shield):
 * 
 * GPIO0 has a CONFLICT on the ESP32-S3 Camera board:
 * - The auto-program circuit has transistor Q3 that can drive GPIO0
 * - Q3 is controlled by CH340C RTS signal for boot mode entry
 * - When USB is disconnected, Q3 may be in undefined state
 * - This can interfere with UART RX from Arduino
 * 
 * Solution:
 * 1. Enable internal pullup on GPIO0 to counteract Q3 effects
 * 2. Extended boot delay for circuits to settle
 * 3. Use HardwareSerial(1) with explicit pin binding
 */
static void uartInit() {
    uartBootStartTime = millis();
    
    LOG("UART init: RX=GPIO%d TX=GPIO%d @ %d baud (UART1)", 
        UART_RX_PIN, UART_TX_PIN, UART_BAUD);
    
    // CRITICAL: Enable internal pullup on GPIO0 BEFORE UART init
    // This counteracts the Q3 transistor on the auto-program circuit
    // which can pull GPIO0 low and block UART RX
    pinMode(UART_RX_PIN, INPUT_PULLUP);
    LOG("GPIO%d pullup enabled to counteract auto-program circuit", UART_RX_PIN);
    
    // Extended delay for boot circuits to settle
    // - GPIO0 boot strapping needs time
    // - Q3 transistor state needs to stabilize  
    // - CH340C needs to reach idle state
    LOG("Boot guard active for %d ms (GPIO0 protection)", BOOT_GUARD_MS);
    delay(500);
    
    // Check GPIO0 state before UART init
    int gpio0State = digitalRead(UART_RX_PIN);
    LOG("GPIO%d state before UART init: %s", UART_RX_PIN, gpio0State ? "HIGH" : "LOW");
    
    if (gpio0State == LOW) {
        LOG_W("WARNING: GPIO0 is LOW - Q3 may be pulling it down!");
    }
    
    // Initialize UART1 with explicit pin binding to shield-fixed GPIO0/GPIO1
    RobotSerial.begin(UART_BAUD, SERIAL_8N1, UART_RX_PIN, UART_TX_PIN);
    
    LOG("RobotSerial UART1 bound to GPIO%d/GPIO%d", UART_RX_PIN, UART_TX_PIN);
    
    // Send immediate STOP to halt any motors that may have started
    // from noise during boot
    delay(50);
    RobotSerial.print("{\"N\":201,\"H\":\"boot\"}\n");
    LOG("Boot STOP sent to UNO");
}

/**
 * Send a string to UART.
 */
static void uartSend(const char* msg) {
    RobotSerial.print(msg);
    txLines++;
    LOG_V("UART TX: %s", msg);
}

/**
 * Send emergency stop command.
 */
static void sendEstop() {
    uartSend(ESTOP_COMMAND);
    LOG("ESTOP sent to UNO");
}

/**
 * Process UART receive buffer - accumulate into lines.
 * Returns true if a complete line is ready.
 */
static bool uartTick() {
    // Check boot guard window
    if (!uartBootGuardExpired) {
        if ((millis() - uartBootStartTime) >= BOOT_GUARD_MS) {
            uartBootGuardExpired = true;
            LOG("Boot guard expired - UART RX active");
        } else {
            // Drain any data during boot guard but don't process
            while (RobotSerial.available()) {
                RobotSerial.read();
            }
            return false;
        }
    }
    
    // Read available data into ring buffer
    while (RobotSerial.available() && !ringBufferFull()) {
        int byte = RobotSerial.read();
        if (byte >= 0) {
            ringBufferPush((uint8_t)byte);
        }
    }
    
    // Process ring buffer into line buffer
    while (ringBufferCount() > 0 && linePos < MAX_LINE_LENGTH - 1) {
        int byte = ringBufferPop();
        if (byte < 0) break;
        
        if (byte == '\n' || byte == '\r') {
            if (linePos > 0) {
                lineBuffer[linePos] = '\0';
                return true;  // Complete line ready
            }
            // Skip empty lines
        } else {
            lineBuffer[linePos++] = (char)byte;
        }
    }
    
    // Check for line overflow
    if (linePos >= MAX_LINE_LENGTH - 1) {
        LOG_W("Line buffer overflow, discarding");
        linePos = 0;
        droppedLines++;
    }
    
    return false;
}

/**
 * Check if the accumulated line looks like valid JSON.
 * Simple check: starts with { and ends with }
 */
static bool isValidJsonLine(const char* line) {
    if (!line || line[0] == '\0') return false;
    
    // Find first non-whitespace
    while (*line == ' ' || *line == '\t') line++;
    if (*line != '{') return false;
    
    // Find last non-whitespace
    size_t len = strlen(line);
    while (len > 0 && (line[len-1] == ' ' || line[len-1] == '\t')) len--;
    if (len == 0 || line[len-1] != '}') return false;
    
    return true;
}

// ============================================================================
// WebSocket Event Handler
// ============================================================================

static void webSocketEvent(uint8_t num, WStype_t type, uint8_t* payload, size_t length) {
    switch (type) {
        case WStype_DISCONNECTED:
            LOG("WS[%u] Disconnected", num);
            
            // If this was the controller, send ESTOP and clear
            if ((int8_t)num == controllerClientNum) {
                LOG("Controller disconnected - sending ESTOP");
                sendEstop();
                controllerClientNum = -1;
                lastMotionTime = 0;
                motionWatchdogTriggered = false;
            }
            break;
            
        case WStype_CONNECTED:
            {
                IPAddress ip = wsServer.remoteIP(num);
                LOG("WS[%u] Connected from %s", num, ip.toString().c_str());
                
                // Check if we already have a controller
                if (controllerClientNum >= 0) {
                    LOG("WS[%u] Rejected - controller slot taken by client %d", num, controllerClientNum);
                    wsServer.disconnect(num);
                    // Note: WebSocketsServer doesn't support custom close codes easily
                    // The disconnect will use a generic close
                } else {
                    // This client becomes the controller
                    controllerClientNum = (int8_t)num;
                    lastMotionTime = millis();  // Reset watchdog
                    motionWatchdogTriggered = false;
                    LOG("WS[%u] Assigned as controller", num);
                }
            }
            break;
            
        case WStype_TEXT:
            {
                wsRxMessages++;
                
                // Only accept messages from controller
                if ((int8_t)num != controllerClientNum) {
                    LOG_V("WS[%u] Ignored (not controller)", num);
                    break;
                }
                
                const char* msg = (const char*)payload;
                bool isMotion = isMotionCommand(msg, length);
                
                if (isMotion) {
                    // Update motion timestamp for watchdog
                    lastMotionTime = millis();
                    motionWatchdogTriggered = false;
                    
                    // Rate limiting for motion commands
                    unsigned long now = millis();
                    if (now - lastMotionForwardTime < MOTION_RATE_LIMIT_MS) {
                        // Too fast, drop this message
                        droppedLines++;
                        LOG_V("Motion rate limited, dropped");
                        break;
                    }
                    lastMotionForwardTime = now;
                }
                
                // Forward to UART, ensuring newline
                RobotSerial.print(msg);
                if (length == 0 || msg[length - 1] != '\n') {
                    RobotSerial.print('\n');
                }
                txLines++;
                
                LOG_V("WS[%u] -> UART: %s", num, msg);
            }
            break;
            
        case WStype_BIN:
            LOG_W("WS[%u] Binary message ignored (text only)", num);
            break;
            
        case WStype_PING:
            LOG_V("WS[%u] Ping", num);
            break;
            
        case WStype_PONG:
            LOG_V("WS[%u] Pong", num);
            break;
            
        case WStype_ERROR:
            LOG_E("WS[%u] Error", num);
            break;
            
        default:
            break;
    }
}

// ============================================================================
// HTTP Handlers
// ============================================================================

static void handleHealth() {
    // Calculate last motion time ago
    String lastMotionAgo = "null";
    if (lastMotionTime > 0 && controllerClientNum >= 0) {
        lastMotionAgo = String(millis() - lastMotionTime);
    }
    
    // Build JSON response
    String json = "{";
    json += "\"ok\":true,";
    json += "\"ssid\":\"" + String(WIFI_SSID) + "\",";
    json += "\"ip\":\"" + WiFi.softAPIP().toString() + "\",";
    json += "\"ws_port\":" + String(WS_PORT) + ",";
    json += "\"ws_path\":\"" + String(WS_PATH) + "\",";
    json += "\"clients\":" + String(wsServer.connectedClients()) + ",";
    json += "\"controller\":" + String(controllerClientNum >= 0 ? "true" : "false") + ",";
    json += "\"uart_baud\":" + String(UART_BAUD) + ",";
    json += "\"rx_lines\":" + String(rxLines) + ",";
    json += "\"tx_lines\":" + String(txLines) + ",";
    json += "\"dropped_lines\":" + String(droppedLines) + ",";
    json += "\"last_motion_ms_ago\":" + lastMotionAgo;
    json += "}";
    
    httpServer.send(200, "application/json", json);
}

static void handleNotFound() {
    httpServer.send(404, "text/plain", "Not Found");
}

static void handleRoot() {
    String html = "<!DOCTYPE html><html><head><title>ZIP Robot Bridge</title></head><body>";
    html += "<h1>ZIP Robot Bridge</h1>";
    html += "<p>WebSocket: <code>ws://" + WiFi.softAPIP().toString() + ":" + String(WS_PORT) + WS_PATH + "</code></p>";
    html += "<p>Health: <a href=\"/health\">/health</a></p>";
    html += "<p>mDNS: <code>ws://" + String(MDNS_HOSTNAME) + ".local:" + String(WS_PORT) + WS_PATH + "</code></p>";
    html += "</body></html>";
    httpServer.send(200, "text/html", html);
}

// ============================================================================
// WiFi Setup
// ============================================================================

static void wifiSetup() {
    LOG("Starting WiFi AP...");
    
    // Configure AP
    WiFi.mode(WIFI_AP);
    
    // Start AP with or without password
    bool result;
    if (strlen(WIFI_PASSWORD) > 0) {
        result = WiFi.softAP(WIFI_SSID, WIFI_PASSWORD, WIFI_CHANNEL, 0, WIFI_MAX_CONNECTIONS);
    } else {
        result = WiFi.softAP(WIFI_SSID, NULL, WIFI_CHANNEL, 0, WIFI_MAX_CONNECTIONS);
        LOG("AP is OPEN (no password)");
    }
    
    if (!result) {
        LOG_E("Failed to start AP!");
        return;
    }
    
    // Wait for AP to stabilize
    delay(100);
    
    IPAddress ip = WiFi.softAPIP();
    LOG("AP started successfully");
    LOG("  SSID: %s", WIFI_SSID);
    LOG("  IP: %s", ip.toString().c_str());
    LOG("  Channel: %d", WIFI_CHANNEL);
    
    // Print connection banner
    Serial.println();
    Serial.println("========================================");
    Serial.printf("  SSID: %s\n", WIFI_SSID);
    if (strlen(WIFI_PASSWORD) > 0) {
        Serial.printf("  Password: %s\n", WIFI_PASSWORD);
    } else {
        Serial.println("  Password: (none - open network)");
    }
    Serial.printf("  IP: %s\n", ip.toString().c_str());
    Serial.printf("  WebSocket: ws://%s:%d%s\n", ip.toString().c_str(), WS_PORT, WS_PATH);
    Serial.printf("  Health: http://%s/health\n", ip.toString().c_str());
    Serial.println("========================================");
    Serial.println();
}

// ============================================================================
// mDNS Setup
// ============================================================================

static void mdnsSetup() {
    if (MDNS.begin(MDNS_HOSTNAME)) {
        MDNS.addService("http", "tcp", HTTP_PORT);
        MDNS.addService("ws", "tcp", WS_PORT);
        LOG("mDNS started: %s.local", MDNS_HOSTNAME);
    } else {
        LOG_W("mDNS failed to start");
    }
}

// ============================================================================
// Server Setup
// ============================================================================

static void serversSetup() {
    // HTTP server
    httpServer.on("/", handleRoot);
    httpServer.on("/health", handleHealth);
    httpServer.onNotFound(handleNotFound);
    httpServer.begin();
    LOG("HTTP server started on port %d", HTTP_PORT);
    
    // WebSocket server
    wsServer.begin();
    wsServer.onEvent(webSocketEvent);
    LOG("WebSocket server started on port %d, path %s", WS_PORT, WS_PATH);
}

// ============================================================================
// Safety Watchdog
// ============================================================================

static void safetyTick() {
    // Only run watchdog if we have a controller connected
    if (controllerClientNum < 0) {
        return;
    }
    
    // Check if motion watchdog should trigger
    if (!motionWatchdogTriggered && lastMotionTime > 0) {
        unsigned long elapsed = millis() - lastMotionTime;
        if (elapsed >= MOTION_WATCHDOG_MS) {
            LOG("Motion watchdog triggered (%lu ms since last motion)", elapsed);
            sendEstop();
            motionWatchdogTriggered = true;
        }
    }
}

// ============================================================================
// Main Loop - UART to WS forwarding
// ============================================================================

static void bridgeTick() {
    // Process UART data and check for complete lines
    if (uartTick()) {
        rxLines++;
        
        // Check if it's valid JSON
        if (isValidJsonLine(lineBuffer)) {
            // Forward to controller if connected
            if (controllerClientNum >= 0) {
                wsServer.sendTXT(controllerClientNum, lineBuffer);
                wsTxMessages++;
                LOG_V("UART -> WS[%d]: %s", controllerClientNum, lineBuffer);
            }
        } else {
            // Not JSON, might be debug output - drop or log
            LOG_V("UART non-JSON dropped: %s", lineBuffer);
            droppedLines++;
        }
        
        // Reset line buffer
        linePos = 0;
    }
}

// ============================================================================
// Arduino Entry Points
// ============================================================================

void setup() {
    // Debug serial
    Serial.begin(115200);
    delay(100);
    
    Serial.println();
    Serial.println("===============================");
    Serial.println("  ZIP ESP32 Bridge v1.0.0");
    Serial.println("===============================");
    Serial.println();
    
    // Initialize subsystems
    uartInit();
    wifiSetup();
    mdnsSetup();
    serversSetup();
    
    LOG("Bridge ready!");
}

void loop() {
    // Handle HTTP requests
    httpServer.handleClient();
    
    // Handle WebSocket events
    wsServer.loop();
    
    // Bridge UART to WebSocket
    bridgeTick();
    
    // Safety watchdog
    safetyTick();
    
    // Small yield to prevent WDT issues
    yield();
}

