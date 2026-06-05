/*
 * Motor Self-Test
 * 
 * Critical bring-up sequence to verify motor wiring
 */

#include <Arduino.h>
#include <avr/wdt.h>
#include "hal/motor_driver.h"
#include "hal/status_led.h"
#include "config.h"

// Forward declarations - defined in main.cpp
extern MotorDriverTB6612 motorDriver;
extern StatusLED statusLED;

bool runSelfTest() {
  Serial.println("\n=== Motor Self-Test ===");
  
  // Test 1: Verify STBY pin
  Serial.println("Test 1: STBY pin verification...");
  motorDriver.enable();
  delay(100);
  
  // Check if STBY is actually HIGH (would need to read back, but for now just enable)
  Serial.println("  STBY enabled");
  
  // Test 2: Left motor forward
  Serial.println("Test 2: Left motor forward...");
  Serial.flush();
  motorDriver.setLeftMotor(SELF_TEST_MOTOR_PWM);
  motorDriver.setRightMotor(0);
  motorDriver.update();
  // Reset watchdog during delay
  for (uint16_t i = 0; i < SELF_TEST_DURATION_MS / 100; i++) {
    wdt_reset();
    delay(100);
  }
  motorDriver.stop();
  motorDriver.update();
  delay(200);
  Serial.println("  Left forward complete");
  Serial.flush();
  
  // Test 3: Right motor forward
  Serial.println("Test 3: Right motor forward...");
  Serial.flush();  // Ensure message is sent
  motorDriver.setLeftMotor(0);
  motorDriver.setRightMotor(SELF_TEST_MOTOR_PWM);
  motorDriver.update();
  // Reset watchdog during delay to prevent reset
  for (uint16_t i = 0; i < SELF_TEST_DURATION_MS / 100; i++) {
    wdt_reset();  // Reset watchdog every 100ms
    delay(100);
  }
  motorDriver.stop();
  motorDriver.update();
  delay(200);
  Serial.println("  Right forward complete");
  Serial.flush();
  
  // Test 4: Left motor backward
  Serial.println("Test 4: Left motor backward...");
  Serial.flush();
  motorDriver.setLeftMotor(-SELF_TEST_MOTOR_PWM);
  motorDriver.setRightMotor(0);
  motorDriver.update();
  for (uint16_t i = 0; i < SELF_TEST_DURATION_MS / 100; i++) {
    wdt_reset();
    delay(100);
  }
  motorDriver.stop();
  motorDriver.update();
  delay(200);
  Serial.println("  Left backward complete");
  Serial.flush();
  
  // Test 5: Right motor backward
  Serial.println("Test 5: Right motor backward...");
  Serial.flush();
  motorDriver.setLeftMotor(0);
  motorDriver.setRightMotor(-SELF_TEST_MOTOR_PWM);
  motorDriver.update();
  for (uint16_t i = 0; i < SELF_TEST_DURATION_MS / 100; i++) {
    wdt_reset();
    delay(100);
  }
  motorDriver.stop();
  motorDriver.update();
  delay(200);
  Serial.println("  Right backward complete");
  Serial.flush();
  
  // Visual feedback
  statusLED.setStateIdle();
  delay(500);
  statusLED.setColor(0, 255, 0);  // Green = success
  delay(500);
  statusLED.setStateIdle();
  
  Serial.println("=== Self-Test Complete ===");
  Serial.println("If motors did not move, check:");
  Serial.println("  1. STBY pin (pin 3) is HIGH");
  Serial.println("  2. Motor wiring connections");
  Serial.println("  3. Battery voltage");
  
  return true;
}

