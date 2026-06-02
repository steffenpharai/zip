/*
 * Status LED HAL - FastLED
 * 
 * Graceful degradation if memory is tight
 */

#ifndef STATUS_LED_H
#define STATUS_LED_H

#include <Arduino.h>
#include "../pins.h"
#include "../config.h"

// Try to use FastLED, but degrade gracefully if not available
#ifdef LED_USE_FASTLED
#include <FastLED.h>
#else
// Fallback to simple PWM
#define LED_USE_PWM
#endif

class StatusLED {
public:
  StatusLED();
  
  void init();
  
  // Set color (RGB, 0-255 each)
  void setColor(uint8_t r, uint8_t g, uint8_t b);
  
  // Set brightness (0-255)
  void setBrightness(uint8_t brightness);
  
  // State-based patterns
  void setStateIdle();
  void setStateListening();
  void setStateThinking();
  void setStateSpeaking();
  void setStateError();
  void setStateLowBattery();
  
  // Update (for animations)
  void update();
  
private:
  uint8_t r, g, b;
  uint8_t brightness;
  
#ifdef LED_USE_FASTLED
  CRGB leds[NUM_LEDS];
#else
  // PWM fallback - use single pin for brightness
  void setPWMColor(uint8_t r, uint8_t g, uint8_t b);
#endif
  
  unsigned long lastUpdate;
  uint8_t animationPhase;  // Could be reduced but animation needs 0-99 range
};

#endif // STATUS_LED_H

