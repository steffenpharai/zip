/*
 * Ultrasonic Sensor HAL - HC-SR04
 * 
 * Non-blocking where possible, rate-limited reads
 */

#ifndef ULTRASONIC_H
#define ULTRASONIC_H

#include <Arduino.h>
#include "../pins.h"
#include "../config.h"

class UltrasonicHC_SR04 {
public:
  UltrasonicHC_SR04();
  
  void init();
  
  // Get distance (non-blocking if possible, otherwise rate-limited)
  uint16_t getDistance();  // Returns distance in cm, 0 if error/timeout
  
  // Rate limiting
  void setMaxRate(uint8_t rateHz);
  
  // Check if reading is available (for non-blocking operation)
  bool isReadingAvailable() const;
  
private:
  unsigned long lastReadTime;
  uint16_t lastDistance;
  uint8_t minIntervalMs;  // Minimum time between reads (for rate limiting) - changed to uint8_t to save RAM
  
  // Blocking read (fallback)
  uint16_t readBlocking();
};

#endif // ULTRASONIC_H

