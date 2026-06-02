/*
 * JSON Protocol Handler Implementation
 * 
 * Production-grade non-blocking serial output with:
 * - Watchdog protection
 * - Single pending response queue
 * - TX buffer overflow prevention
 */

#include "json_protocol.h"
#include <avr/wdt.h>
#include <string.h>

// Static members
char JsonProtocol::pendingResponse[32] = {0};
bool JsonProtocol::hasPending = false;

// Helper: Safe Serial write with watchdog protection
// Writes character-by-character, checking buffer space
// Returns number of chars written (may be less than length if buffer full)
static size_t writeSerialSafe(const char* str) {
  wdt_reset();
  
  const char* p = str;
  size_t charsWritten = 0;
  
  while (*p != '\0') {
    size_t available = Serial.availableForWrite();
    if (available == 0) {
      // Buffer full - stop to prevent blocking
      wdt_reset();
      break;
    }
    
    Serial.write(*p);
    p++;
    charsWritten++;
    
    // Reset watchdog every 4 characters
    if (charsWritten % 4 == 0) {
      wdt_reset();
    }
  }
  
  wdt_reset();
  return charsWritten;
}

// Check if we can write response (enough buffer space)
static bool canWrite(size_t len) {
  return (size_t)Serial.availableForWrite() >= len;
}

void JsonProtocol::sendOk(const char* H) {
  char buffer[32];
  if (H && strlen(H) > 0) {
    snprintf(buffer, sizeof(buffer), "{%s_ok}\n", H);
  } else {
    snprintf(buffer, sizeof(buffer), "{ok}\n");
  }
  writeSerialSafe(buffer);
  Serial.flush();  // Ensure response is sent immediately
}

void JsonProtocol::sendFalse(const char* H) {
  char buffer[32];
  snprintf(buffer, sizeof(buffer), "{%s_false}\n", H);
  writeSerialSafe(buffer);
}

void JsonProtocol::sendTrue(const char* H) {
  char buffer[32];
  snprintf(buffer, sizeof(buffer), "{%s_true}\n", H);
  writeSerialSafe(buffer);
}

void JsonProtocol::sendValue(const char* H, const char* value) {
  char buffer[48];
  snprintf(buffer, sizeof(buffer), "{%s_%s}\n", H, value);
  writeSerialSafe(buffer);
}

void JsonProtocol::sendOk() {
  writeSerialSafe("{ok}\n");
}

void JsonProtocol::sendHelloOk() {
  // Hello response for N=0 handshake
  writeSerialSafe("{hello_ok}\n");
}

void JsonProtocol::sendStats(const ParseStats& stats) {
  // Format: {stats:rx_ov=X,json_drop=X,parse_err=X,crc_fail=X,tx_drop=X,last_ms=X}
  // Keep it compact to fit in TX buffer
  char buffer[80];
  
  // Calculate ms since last command
  uint32_t now = millis();
  uint32_t ms_ago = (stats.last_cmd_ms > 0) ? (now - stats.last_cmd_ms) : 0;
  
  snprintf(buffer, sizeof(buffer), 
    "{stats:rx=%u,jd=%u,pe=%u,tx=%u,ms=%lu}\n",
    stats.rx_overflow,
    stats.json_dropped_long,
    stats.parse_errors,
    stats.tx_dropped,
    ms_ago
  );
  
  writeSerialSafe(buffer);
}

bool JsonProtocol::trySendOk(const char* H) {
  char buffer[32];
  snprintf(buffer, sizeof(buffer), "{%s_ok}\n", H);
  
  size_t len = strlen(buffer);
  
  // First try to flush any pending response
  flushPending();
  
  // Check if we can write
  if (canWrite(len)) {
    writeSerialSafe(buffer);
    return true;
  }
  
  // Buffer full - store as pending (overwrites any existing pending)
  if (hasPending) {
    g_parseStats.tx_dropped++;  // Previous pending was dropped
  }
  strncpy(pendingResponse, buffer, sizeof(pendingResponse) - 1);
  pendingResponse[sizeof(pendingResponse) - 1] = '\0';
  hasPending = true;
  
  return true;  // Queued (may be sent later)
}

void JsonProtocol::flushPending() {
  if (!hasPending) {
    return;
  }
  
  size_t len = strlen(pendingResponse);
  if (canWrite(len)) {
    writeSerialSafe(pendingResponse);
    hasPending = false;
  }
  // If still can't write, leave pending for next flush
}
