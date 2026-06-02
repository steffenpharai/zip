/*
 * Ultrasonic Sensor Implementation - HC-SR04
 */

#include "hal/ultrasonic.h"

UltrasonicHC_SR04::UltrasonicHC_SR04()
  : lastReadTime(0)
  , lastDistance(0)
  , minIntervalMs(1000 / ULTRASONIC_MAX_RATE_HZ)  // Default: 10Hz = 100ms
{
}

void UltrasonicHC_SR04::init() {
  pinMode(PIN_ULTRASONIC_TRIG, OUTPUT);
  pinMode(PIN_ULTRASONIC_ECHO, INPUT);
  
  digitalWrite(PIN_ULTRASONIC_TRIG, LOW);
  lastReadTime = 0;
}

void UltrasonicHC_SR04::setMaxRate(uint8_t rateHz) {
  if (rateHz > 0) {
    minIntervalMs = (uint8_t)(1000 / rateHz);  // Cast to uint8_t (max 255ms interval)
  }
}

uint16_t UltrasonicHC_SR04::getDistance() {
  unsigned long now = millis();
  
  // Rate limiting
  if (now - lastReadTime < minIntervalMs) {
    return lastDistance;  // Return cached value
  }
  
  // Perform reading
  lastDistance = readBlocking();
  lastReadTime = now;
  
  return lastDistance;
}

bool UltrasonicHC_SR04::isReadingAvailable() const {
  unsigned long now = millis();
  return (now - lastReadTime) >= minIntervalMs;
}

uint16_t UltrasonicHC_SR04::readBlocking() {
  // Trigger pulse
  digitalWrite(PIN_ULTRASONIC_TRIG, LOW);
  delayMicroseconds(2);
  digitalWrite(PIN_ULTRASONIC_TRIG, HIGH);
  delayMicroseconds(10);
  digitalWrite(PIN_ULTRASONIC_TRIG, LOW);
  
  // Read echo pulse
  unsigned long duration = pulseIn(PIN_ULTRASONIC_ECHO, HIGH, ULTRASONIC_TIMEOUT_US);
  
  if (duration == 0) {
    return 0;  // Timeout
  }
  
  // Convert to distance (cm)
  // Speed of sound = 343 m/s = 0.0343 cm/us
  // Distance = (duration * 0.0343) / 2 (round trip)
  uint16_t distance = (duration * 0.0343) / 2;
  
  // Clamp to valid range
  if (distance < ULTRASONIC_MIN_DISTANCE_CM) {
    distance = ULTRASONIC_MIN_DISTANCE_CM;
  }
  if (distance > ULTRASONIC_MAX_DISTANCE_CM) {
    distance = ULTRASONIC_MAX_DISTANCE_CM;
  }
  
  return distance;
}

