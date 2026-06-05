/*
 * JSON Protocol Handler
 * 
 * Handles ELEGOO-style JSON protocol responses.
 * Non-blocking serial output with watchdog protection.
 * 
 * Response format matches official ELEGOO: {H_ok}, {H_false}, etc.
 */

#ifndef JSON_PROTOCOL_H
#define JSON_PROTOCOL_H

#include <Arduino.h>
#include "frame_parser.h"  // For ParseStats

class JsonProtocol {
public:
  // Send response in ELEGOO format: {H_ok}, {H_false}, {H_true}, {H_value}
  // All responses include trailing \n for host parsing convenience
  static void sendOk(const char* H);
  static void sendFalse(const char* H);
  static void sendTrue(const char* H);
  static void sendValue(const char* H, const char* value);
  static void sendOk();  // Generic {ok}
  
  // Hello response (N=0 handshake)
  static void sendHelloOk();
  
  // Stats response (N=120 diagnostics)
  static void sendStats(const ParseStats& stats);
  
  // Single pending response queue
  // If TX buffer is full, store one pending response
  // Returns true if response was sent or queued, false if dropped
  static bool trySendOk(const char* H);
  
  // Flush pending response if any
  static void flushPending();
  
private:
  // Pending response storage (single slot)
  static char pendingResponse[32];
  static bool hasPending;
};

#endif // JSON_PROTOCOL_H
