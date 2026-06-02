/*
 * Mode Button HAL
 * 
 * Interrupt-safe debounce
 */

#ifndef MODE_BUTTON_H
#define MODE_BUTTON_H

#include <Arduino.h>
#include "../pins.h"
#include "../config.h"

class ModeButton {
public:
  ModeButton();
  
  void init();
  
  // Check if button was pressed (debounced)
  bool isPressed();
  
  // Check current state (raw)
  bool read() const;
  
  // Update (call from main loop or interrupt)
  void update();
  
  // Attach interrupt handler
  void attachInterrupt();
  
private:
  bool lastState;
  bool currentState;
  unsigned long lastDebounceTime;
  static const unsigned long DEBOUNCE_DELAY_MS = 50;
  
  // Interrupt handler (static)
  static void onInterrupt();
  static ModeButton* instance;
};

#endif // MODE_BUTTON_H

