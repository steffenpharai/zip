/*
 * Servo Pan Implementation
 * 
 * EXACT official ELEGOO pattern from DeviceDriverSet_xxx0.cpp:
 * - attach(pin) before each write
 * - write(angle)
 * - delay(450ms) for movement
 * - detach() to release Timer1
 * 
 * REQUIRES: RAM usage below 75% for sufficient stack space
 */

#include "hal/servo_pan.h"

ServoPan::ServoPan()
  : currentAngle(90)
  , minAngle(SERVO_ANGLE_MIN)
  , maxAngle(SERVO_ANGLE_MAX)
{
}

void ServoPan::init() {
  // Official ELEGOO init pattern
  servo.attach(PIN_SERVO_Z, 500, 2400);  // Pulse calibration
  servo.attach(PIN_SERVO_Z);              // Re-attach (ELEGOO quirk)
  servo.write(90);                        // Center position
  delay(500);                             // Wait for movement
  servo.detach();                         // Release Timer1
  currentAngle = 90;
}

void ServoPan::setAngle(uint8_t angle) {
  // Constrain to valid range
  angle = constrain(angle, SERVO_ANGLE_MIN, SERVO_ANGLE_MAX);
  currentAngle = angle;
  
  // EXACT official ELEGOO pattern from DeviceDriverSet_Servo_control()
  servo.attach(PIN_SERVO_Z);   // Attach before write
  servo.write(angle);          // Set position
  delay(450);                  // Official ELEGOO delay for movement
  servo.detach();              // Release Timer1
}
