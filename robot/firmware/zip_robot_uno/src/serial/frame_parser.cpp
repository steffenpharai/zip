/*
 * JSON Frame Parser Implementation
 * 
 * Production-grade parser with:
 * - Ring buffer for robust RX handling
 * - JSON termination on '}' (official ELEGOO style)
 * - Binary protocol detection (0xAA 0x55)
 * - Resync on long lines
 * - Diagnostic counters
 * 
 * Uses lightweight fixed-field scanner instead of ArduinoJson.
 * ELEGOO protocol has fixed fields (N, H, D1, D2, D3, D4, T)
 * so we don't need a general-purpose JSON parser.
 * Saves ~96 bytes stack per parse + ArduinoJson library overhead.
 */

#include "frame_parser.h"
#include <avr/wdt.h>
#include <stdlib.h>  // for atoi, atol

// Global diagnostic counters
ParseStats g_parseStats = {0, 0, 0, 0, 0, 0};

FrameParser::FrameParser()
  : head(0)
  , tail(0)
  , jsonPos(0)
  , state(STATE_IDLE)
{
  reset();
}

void FrameParser::reset() {
  state = STATE_IDLE;
  jsonPos = 0;
  jsonBuffer[0] = '\0';
  lastCommand.valid = false;
  lastCommand.N = -1;
  lastCommand.H[0] = '\0';
  lastCommand.D1 = 0;
  lastCommand.D2 = 0;
  lastCommand.D3 = 0;
  lastCommand.D4 = 0;
  lastCommand.T = 0;
  // Don't clear ring buffer on reset - may have pending data
}

// Ring buffer push (returns false if full)
bool FrameParser::ringPush(uint8_t byte) {
  uint8_t nextHead = (head + 1) & (RING_SIZE - 1);  // Power of 2 modulo
  if (nextHead == tail) {
    // Buffer full - overflow
    g_parseStats.rx_overflow++;
    return false;
  }
  ring[head] = byte;
  head = nextHead;
  return true;
}

// Ring buffer pop (returns false if empty)
bool FrameParser::ringPop(uint8_t& byte) {
  if (head == tail) {
    return false;  // Empty
  }
  byte = ring[tail];
  tail = (tail + 1) & (RING_SIZE - 1);
  return true;
}

// Ring buffer available count
uint8_t FrameParser::ringAvailable() const {
  return (head - tail) & (RING_SIZE - 1);
}

// Clear ring buffer
void FrameParser::ringClear() {
  head = 0;
  tail = 0;
}

// Resync: discard bytes until newline or clear buffer
void FrameParser::resyncToNewline() {
  uint8_t byte;
  while (ringPop(byte)) {
    if (byte == '\n' || byte == '\r') {
      break;  // Found line terminator, ready for next frame
    }
  }
  state = STATE_IDLE;
  jsonPos = 0;
}

bool FrameParser::processByte(uint8_t byte) {
  // Handle state machine - JSON only (binary protocol removed)
  switch (state) {
    case STATE_IDLE:
      // Look for JSON frame start
      if (byte == '{') {
        jsonBuffer[0] = '{';
        jsonPos = 1;
        state = STATE_JSON_READING;
      }
      // Ignore other characters (whitespace, newlines, binary bytes)
      return false;
      
    case STATE_JSON_READING:
      // Accumulate JSON until '}'
      if (byte == '}') {
        // End of JSON frame
        if (jsonPos < MAX_JSON_LINE) {
          jsonBuffer[jsonPos++] = '}';
          jsonBuffer[jsonPos] = '\0';
          state = STATE_JSON_COMPLETE;
          return parseJson();
        } else {
          // Line too long even at terminator
          g_parseStats.json_dropped_long++;
          state = STATE_IDLE;
          jsonPos = 0;
          return false;
        }
      } else if (byte == '\n' || byte == '\r') {
        // Newline before '}' - treat as frame terminator for compatibility
        if (jsonPos > 1) {
          jsonBuffer[jsonPos] = '\0';
          if (jsonPos > 0 && jsonBuffer[jsonPos - 1] == '}') {
            state = STATE_JSON_COMPLETE;
            return parseJson();
          }
        }
        // Incomplete frame - discard and wait for new frame
        state = STATE_IDLE;
        jsonPos = 0;
        return false;
      } else if (byte == '{') {
        // New frame start in middle of old frame - discard old and start fresh
        jsonBuffer[0] = '{';
        jsonPos = 1;
        return false;
      } else {
        // Accumulate character
        if (jsonPos < MAX_JSON_LINE) {
          jsonBuffer[jsonPos++] = (char)byte;
        } else {
          // Line too long - discard and resync
          g_parseStats.json_dropped_long++;
          state = STATE_IDLE;
          jsonPos = 0;
          return false;
        }
      }
      return false;
      
    case STATE_JSON_COMPLETE:
      // Should not receive bytes in complete state - reset
      state = STATE_IDLE;
      jsonPos = 0;
      return false;
  }
  
  return false;
}

// Lightweight fixed-field scanner - replaces ArduinoJson
// Scans for known field patterns in ELEGOO JSON format
// Saves 96+ bytes stack vs StaticJsonDocument<96>
//
// Supported format: {"N":200,"H":"abc","D1":100,"D2":-50,"T":200}
// Fields: N (required int), H (optional string), D1-D4 (optional int), T (optional ulong)

// Find field value start position after "fieldName":
// Returns pointer to value start, or nullptr if not found
static const char* findField(const char* json, const char* fieldName) {
  const char* p = json;
  size_t fnLen = strlen(fieldName);
  
  while (*p) {
    // Look for "fieldName"
    if (*p == '"') {
      if (strncmp(p + 1, fieldName, fnLen) == 0 && p[fnLen + 1] == '"') {
        // Found field name, skip to colon then value
        p += fnLen + 2;  // Skip past "fieldName"
        while (*p && (*p == ':' || *p == ' ')) p++;  // Skip : and spaces
        return p;
      }
    }
    p++;
  }
  return nullptr;
}

// Parse integer value at position (handles negative)
static int parseIntAt(const char* p) {
  if (!p) return 0;
  return atoi(p);
}

// Parse unsigned long value at position
static unsigned long parseULongAt(const char* p) {
  if (!p) return 0;
  return atol(p);
}

// Extract quoted string value into buffer (max bufLen-1 chars)
static void parseStringAt(const char* p, char* buf, size_t bufLen) {
  buf[0] = '\0';
  if (!p || *p != '"') return;
  
  p++;  // Skip opening quote
  size_t i = 0;
  while (*p && *p != '"' && i < bufLen - 1) {
    buf[i++] = *p++;
  }
  buf[i] = '\0';
}

bool FrameParser::parseJson() {
  // Reset watchdog before parsing
  wdt_reset();
  
  // Initialize defaults
  lastCommand.N = -1;
  lastCommand.H[0] = '\0';
  lastCommand.D1 = 0;
  lastCommand.D2 = 0;
  lastCommand.D3 = 0;
  lastCommand.D4 = 0;
  lastCommand.T = 0;
  lastCommand.valid = false;
  
  // N is required
  const char* nPos = findField(jsonBuffer, "N");
  if (!nPos) {
    g_parseStats.parse_errors++;
    state = STATE_IDLE;
    jsonPos = 0;
    return false;
  }
  lastCommand.N = parseIntAt(nPos);
  
  // H is optional string
  const char* hPos = findField(jsonBuffer, "H");
  if (hPos) {
    parseStringAt(hPos, lastCommand.H, sizeof(lastCommand.H));
  }
  
  // D1-D4 are optional integers
  const char* d1Pos = findField(jsonBuffer, "D1");
  if (d1Pos) lastCommand.D1 = parseIntAt(d1Pos);
  
  const char* d2Pos = findField(jsonBuffer, "D2");
  if (d2Pos) lastCommand.D2 = parseIntAt(d2Pos);
  
  const char* d3Pos = findField(jsonBuffer, "D3");
  if (d3Pos) lastCommand.D3 = parseIntAt(d3Pos);
  
  const char* d4Pos = findField(jsonBuffer, "D4");
  if (d4Pos) lastCommand.D4 = parseIntAt(d4Pos);
  
  // T is optional unsigned long
  const char* tPos = findField(jsonBuffer, "T");
  if (tPos) lastCommand.T = parseULongAt(tPos);
  
  lastCommand.valid = (lastCommand.N >= 0);
  
  // Update stats
  if (lastCommand.valid) {
    g_parseStats.last_cmd_ms = millis();
  }
  
  // Reset for next frame
  state = STATE_IDLE;
  jsonPos = 0;
  
  wdt_reset();
  return lastCommand.valid;
}

bool FrameParser::getCommand(ParsedCommand& cmd) {
  if (lastCommand.valid) {
    cmd = lastCommand;
    // Clear valid flag after retrieving
    lastCommand.valid = false;
    return true;
  }
  return false;
}
