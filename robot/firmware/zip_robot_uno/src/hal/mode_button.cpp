/*
 * Mode Button Implementation
 */

#include "hal/mode_button.h"

ModeButton* ModeButton::instance = nullptr;

ModeButton::ModeButton()
  : lastState(false)
  , currentState(false)
  , lastDebounceTime(0)
{
  instance = this;
}

void ModeButton::init() {
  pinMode(PIN_MODE_BUTTON, INPUT_PULLUP);
  lastState = digitalRead(PIN_MODE_BUTTON);
  currentState = lastState;
}

bool ModeButton::read() const {
  return !digitalRead(PIN_MODE_BUTTON);  // Inverted (pull-up)
}

bool ModeButton::isPressed() {
  update();
  return currentState && !lastState;  // Rising edge
}

void ModeButton::update() {
  bool reading = read();
  
  if (reading != lastState) {
    lastDebounceTime = millis();
  }
  
  if ((millis() - lastDebounceTime) > DEBOUNCE_DELAY_MS) {
    if (reading != currentState) {
      currentState = reading;
    }
  }
  
  lastState = reading;
}

void ModeButton::attachInterrupt() {
  ::attachInterrupt(digitalPinToInterrupt(PIN_MODE_BUTTON), onInterrupt, CHANGE);
}

void ModeButton::onInterrupt() {
  // This is now handled by lambda above
  // Keep for compatibility
  if (instance) {
    instance->update();
  }
}

