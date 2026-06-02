/*
 * Status LED Implementation
 */

#include "hal/status_led.h"

StatusLED::StatusLED()
  : r(0), g(0), b(0)
  , brightness(LED_BRIGHTNESS_DEFAULT)
  , lastUpdate(0)
  , animationPhase(0)
{
}

void StatusLED::init() {
#ifdef LED_USE_FASTLED
  // Use NEOPIXEL (same as original Elegoo firmware) - automatically handles GRB order
  FastLED.addLeds<NEOPIXEL, PIN_RGB_LED>(leds, NUM_LEDS);
  // Don't set brightness here - let setStateIdle() set it
#else
  // PWM fallback - configure pins if needed
  pinMode(PIN_RGB_LED, OUTPUT);
#endif
  
  setStateIdle();
}

void StatusLED::setColor(uint8_t red, uint8_t green, uint8_t blue) {
  r = red;
  g = green;
  b = blue;
  
#ifdef LED_USE_FASTLED
  leds[0] = CRGB(r, g, b);
  FastLED.show();
#else
  setPWMColor(r, g, b);
#endif
}

void StatusLED::setBrightness(uint8_t bright) {
  brightness = constrain(bright, 0, LED_BRIGHTNESS_MAX);
  
#ifdef LED_USE_FASTLED
  FastLED.setBrightness(brightness);
  FastLED.show();
#else
  // PWM fallback - adjust overall brightness
  analogWrite(PIN_RGB_LED, brightness);
#endif
}

// Helper function matching original Elegoo Color() function
static uint32_t Color(uint8_t r, uint8_t g, uint8_t b) {
  return (((uint32_t)r << 16) | ((uint32_t)g << 8) | b);
}

void StatusLED::setStateIdle() {
  // Cyan color for ready state (matching original Elegoo pattern exactly)
  // Original uses: leds[0] = CRGB::Violet; FastLED.setBrightness(); FastLED.show();
  // For cyan: R=0, G=255, B=255 (green + blue, no red)
  // Using Color() helper like original code does for RGB values
#ifdef LED_USE_FASTLED
  leds[0] = Color(0, 255, 255);  // Cyan using Color() helper: R=0, G=255, B=255
  FastLED.setBrightness(40);  // 50% of previous brightness (was 80)
  FastLED.show();
#else
  // Fallback: Cyan = R=0, G=255, B=255
  setColor(0, 255, 255);
  setBrightness(80);
#endif
}

void StatusLED::setStateListening() {
  // Pulsing cyan
  setColor(0, 200, 255);
  setBrightness(180);
}

void StatusLED::setStateThinking() {
  // Blue-cyan shift
  setColor(0, 150, 200);
  setBrightness(150);
}

void StatusLED::setStateSpeaking() {
  // Bright cyan
  setColor(0, 255, 255);
  setBrightness(255);
}

void StatusLED::setStateError() {
  // Red
  setColor(255, 0, 0);
  setBrightness(255);
}

void StatusLED::setStateLowBattery() {
  // Blinking red
  setColor(255, 0, 0);
  setBrightness(255);
}

void StatusLED::update() {
  // Animation updates (breathing, pulsing, etc.)
  unsigned long now = millis();
  
  // Simple breathing animation for idle state
  if (now - lastUpdate > 50) {  // 20Hz update
    animationPhase = (animationPhase + 1) % 100;
    lastUpdate = now;
    
    // Breathing effect (can be enhanced)
    // For now, just update if needed
  }
}

#ifndef LED_USE_FASTLED
void StatusLED::setPWMColor(uint8_t red, uint8_t green, uint8_t blue) {
  // Simple PWM fallback - use single pin with brightness
  // This is a simplified implementation
  uint8_t avg = (red + green + blue) / 3;
  analogWrite(PIN_RGB_LED, (avg * brightness) / 255);
}
#endif

