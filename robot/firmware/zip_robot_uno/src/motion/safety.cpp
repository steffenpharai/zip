/*
 * Safety Layer Implementation
 */

#include "safety.h"

const uint32_t SafetyLayer::MAX_COMMANDS_PER_SECOND;
const uint32_t SafetyLayer::RATE_LIMIT_WINDOW_MS;

SafetyLayer::SafetyLayer()
  : commandIndex(0)
  , commandCount(0)
  , motorsEnabled(false)  // Startup safe: motors disabled
{
  for (uint8_t i = 0; i < 10; i++) {
    commandTimestamps[i] = 0;
  }
}

void SafetyLayer::init() {
  commandIndex = 0;
  commandCount = 0;
  motorsEnabled = false;  // Startup safe
  
  for (uint8_t i = 0; i < 10; i++) {
    commandTimestamps[i] = 0;
  }
}

bool SafetyLayer::checkRateLimit() {
  // Check if rate limit exceeded
  if (isRateLimitExceeded()) {
    return false;  // Reject command
  }
  
  return true;  // Accept command
}

void SafetyLayer::recordCommand() {
  uint32_t now = millis();
  
  // Add timestamp to circular buffer
  commandTimestamps[commandIndex] = now;
  commandIndex = (commandIndex + 1) % 10;
  
  if (commandCount < 10) {
    commandCount++;
  }
}

bool SafetyLayer::isRateLimitExceeded() const {
  uint32_t now = millis();
  uint32_t windowStart = now - RATE_LIMIT_WINDOW_MS;
  
  // Count commands in the last second
  uint8_t count = 0;
  for (uint8_t i = 0; i < commandCount; i++) {
    if (commandTimestamps[i] >= windowStart) {
      count++;
    }
  }
  
  return count >= MAX_COMMANDS_PER_SECOND;
}

