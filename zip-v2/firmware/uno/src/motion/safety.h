/*
 * Safety Layer
 * 
 * Implements safety features: deadman stop, rate limiting, startup safe state
 */

#ifndef SAFETY_H
#define SAFETY_H

#include <Arduino.h>

class SafetyLayer {
public:
  SafetyLayer();
  
  void init();
  
  // Check if command should be accepted (rate limiting)
  // Returns true if command should be processed
  bool checkRateLimit();
  
  // Record command reception
  void recordCommand();
  
  // Check if motors should be enabled (startup safe state)
  bool shouldEnableMotors() const { return motorsEnabled; }
  
  // Enable motors (after first valid command)
  void enableMotors() { motorsEnabled = true; }
  
  // Force disable motors (emergency)
  void forceDisable() { motorsEnabled = false; }
  
private:
  // Rate limiting: max commands per second
  static const uint32_t MAX_COMMANDS_PER_SECOND = 50;
  static const uint32_t RATE_LIMIT_WINDOW_MS = 1000;
  
  uint32_t commandTimestamps[10];  // Circular buffer
  uint8_t commandIndex;
  uint8_t commandCount;
  
  // Startup safe state
  bool motorsEnabled;
  
  // Check if rate limit exceeded
  bool isRateLimitExceeded() const;
};

#endif // SAFETY_H

