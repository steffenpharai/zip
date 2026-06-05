/*
 * Servo Pan HAL - SG90 Servo
 */

#ifndef SERVO_PAN_H
#define SERVO_PAN_H

#include <Arduino.h>
#include <Servo.h>
#include "../pins.h"
#include "../config.h"

class ServoPan {
public:
  ServoPan();
  
  void init();
  void setAngle(uint8_t angle);  // 0-180 degrees
  uint8_t getAngle() const { return currentAngle; }
  
  // Safety limits
  void setMinAngle(uint8_t min) { minAngle = min; }
  void setMaxAngle(uint8_t max) { maxAngle = max; }
  
private:
  Servo servo;
  uint8_t currentAngle;
  uint8_t minAngle;
  uint8_t maxAngle;
};

#endif // SERVO_PAN_H

