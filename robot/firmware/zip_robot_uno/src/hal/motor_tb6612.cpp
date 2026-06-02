/*
 * Motor Driver Implementation - TB6612FNG
 * 
 * Toshiba TB6612FNG dual H-bridge motor driver
 * On ELEGOO SmartCar Shield v1.1 (V1_20230201 version)
 * 
 * Direction control logic (from official ELEGOO code):
 *   Motor A (Right): Forward = AIN_1 HIGH, Reverse = AIN_1 LOW
 *   Motor B (Left):  Forward = BIN_1 HIGH, Reverse = BIN_1 LOW
 * 
 * CRITICAL: STBY pin must be HIGH to enable motor output!
 */

#include "hal/motor_tb6612.h"

MotorDriverTB6612::MotorDriverTB6612()
  : targetLeftPWM(0)
  , targetRightPWM(0)
  , currentLeftPWM(0)
  , currentRightPWM(0)
  , rampRate(MOTOR_RAMP_RATE_MAX)
  , deadband(MOTOR_PWM_DEADBAND)
  , enabled(false)
  , needsKickstartLeft(false)
  , needsKickstartRight(false)
  , kickstartEndTimeLeft(0)
  , kickstartEndTimeRight(0)
{
}

void MotorDriverTB6612::init() {
  // Configure motor PWM pins as outputs
  pinMode(PIN_MOTOR_PWMA, OUTPUT);
  pinMode(PIN_MOTOR_PWMB, OUTPUT);
  
  // Configure motor direction pins as outputs
  pinMode(PIN_MOTOR_AIN_1, OUTPUT);
  pinMode(PIN_MOTOR_BIN_1, OUTPUT);
  
  // Configure STANDBY pin (TB6612FNG specific)
  pinMode(PIN_MOTOR_STBY, OUTPUT);
  digitalWrite(PIN_MOTOR_STBY, LOW);  // Start disabled for safety
  
  // Set safe initial state: PWM = 0, direction = forward
  analogWrite(PIN_MOTOR_PWMA, 0);
  analogWrite(PIN_MOTOR_PWMB, 0);
  digitalWrite(PIN_MOTOR_AIN_1, HIGH);  // Right motor forward direction (TB6612: HIGH=forward)
  digitalWrite(PIN_MOTOR_BIN_1, HIGH);  // Left motor forward direction (TB6612: HIGH=forward)
  
  enabled = false;
  currentLeftPWM = 0;
  currentRightPWM = 0;
  targetLeftPWM = 0;
  targetRightPWM = 0;
}

void MotorDriverTB6612::enable() {
  // TB6612FNG: Set STBY HIGH to enable motor output
  digitalWrite(PIN_MOTOR_STBY, HIGH);
  enabled = true;
}

void MotorDriverTB6612::disable() {
  // TB6612FNG: Set STBY LOW to disable motor output
  digitalWrite(PIN_MOTOR_STBY, LOW);
  enabled = false;
  analogWrite(PIN_MOTOR_PWMA, 0);
  analogWrite(PIN_MOTOR_PWMB, 0);
  currentLeftPWM = 0;
  currentRightPWM = 0;
  targetLeftPWM = 0;
  targetRightPWM = 0;
}

void MotorDriverTB6612::setLeftMotor(int16_t pwm) {
  targetLeftPWM = constrain(pwm, -255, 255);
}

void MotorDriverTB6612::setRightMotor(int16_t pwm) {
  targetRightPWM = constrain(pwm, -255, 255);
}

void MotorDriverTB6612::setMotors(int16_t left, int16_t right) {
  // Enable motors when setting new PWM values
  enabled = true;
  
  // Set targets
  targetLeftPWM = constrain(left, -255, 255);
  targetRightPWM = constrain(right, -255, 255);
  
  // Check if we need kickstart (transitioning from 0 to non-zero)
  if (currentLeftPWM == 0 && targetLeftPWM != 0) {
    needsKickstartLeft = true;
    kickstartEndTimeLeft = millis() + MOTOR_KICKSTART_MS;
  }
  if (currentRightPWM == 0 && targetRightPWM != 0) {
    needsKickstartRight = true;
    kickstartEndTimeRight = millis() + MOTOR_KICKSTART_MS;
  }
  
  // Update current values immediately (no ramping for immediate response)
  currentLeftPWM = targetLeftPWM;
  currentRightPWM = targetRightPWM;
  
  // Apply to hardware immediately
  applyMotorB(currentLeftPWM);   // Left motor is Motor B
  applyMotorA(currentRightPWM);  // Right motor is Motor A
}

void MotorDriverTB6612::tankDrive(int16_t leftPWM, int16_t rightPWM) {
  setMotors(leftPWM, rightPWM);
}

void MotorDriverTB6612::twistDrive(int16_t v, int16_t omega) {
  // Convert twist (v, omega) to left/right PWM
  // Differential drive model:
  //   left  = v - omega
  //   right = v + omega
  
  const int16_t maxPWM = 255;
  
  int16_t left = v - omega;
  int16_t right = v + omega;
  
  // Constrain to max PWM
  left = constrain(left, -maxPWM, maxPWM);
  right = constrain(right, -maxPWM, maxPWM);
  
  setMotors(left, right);
}

void MotorDriverTB6612::stop() {
  // Immediate stop - set PWM to 0
  targetLeftPWM = 0;
  targetRightPWM = 0;
  currentLeftPWM = 0;
  currentRightPWM = 0;
  
  // Apply to hardware
  analogWrite(PIN_MOTOR_PWMA, 0);
  analogWrite(PIN_MOTOR_PWMB, 0);
  
  enabled = false;
}

void MotorDriverTB6612::brake() {
  // TB6612FNG: brake by setting PWM to 0
  // The official ELEGOO code just sets PWM to 0 for stop
  // For compatibility, we do the same as stop()
  stop();
}

void MotorDriverTB6612::coast() {
  // TB6612FNG doesn't have a true coast mode without STBY control
  // Coast is the same as stop (PWM = 0)
  stop();
}

void MotorDriverTB6612::setRampRate(uint8_t rate) {
  rampRate = constrain(rate, 1, 255);
}

void MotorDriverTB6612::setDeadband(uint8_t db) {
  deadband = db;
}

void MotorDriverTB6612::update() {
  if (!enabled) {
    return;  // Motors disabled
  }
  
  // Apply ramping if targets have changed
  if (currentLeftPWM != targetLeftPWM || currentRightPWM != targetRightPWM) {
    currentLeftPWM = applyRamp(currentLeftPWM, targetLeftPWM);
    currentRightPWM = applyRamp(currentRightPWM, targetRightPWM);
  }
  
  // Apply to hardware
  applyMotorB(currentLeftPWM);   // Left motor is Motor B
  applyMotorA(currentRightPWM);  // Right motor is Motor A
}

void MotorDriverTB6612::applyMotorA(int16_t pwm) {
  // Motor A = Right motor
  // TB6612FNG direction logic (from official ELEGOO code):
  //   Forward (direction_just): AIN_1 = HIGH, then PWM
  //   Reverse (direction_back): AIN_1 = LOW,  then PWM
  //   Stop:                     PWM = 0
  
  if (pwm == 0) {
    analogWrite(PIN_MOTOR_PWMA, 0);
    return;
  }
  
  // Handle kickstart
  int16_t effectivePWM = applyKickstart(pwm, needsKickstartRight, kickstartEndTimeRight);
  
  // Set direction FIRST (matching official ELEGOO code order)
  if (effectivePWM > 0) {
    digitalWrite(PIN_MOTOR_AIN_1, HIGH);  // Forward (TB6612: HIGH)
  } else {
    digitalWrite(PIN_MOTOR_AIN_1, LOW);   // Reverse (TB6612: LOW)
  }
  
  // Then set PWM magnitude
  analogWrite(PIN_MOTOR_PWMA, abs(effectivePWM));
}

void MotorDriverTB6612::applyMotorB(int16_t pwm) {
  // Motor B = Left motor
  // TB6612FNG direction logic (from official ELEGOO code):
  //   Forward (direction_just): BIN_1 = HIGH, then PWM
  //   Reverse (direction_back): BIN_1 = LOW,  then PWM
  //   Stop:                     PWM = 0
  
  if (pwm == 0) {
    analogWrite(PIN_MOTOR_PWMB, 0);
    return;
  }
  
  // Handle kickstart
  int16_t effectivePWM = applyKickstart(pwm, needsKickstartLeft, kickstartEndTimeLeft);
  
  // Set direction FIRST (matching official ELEGOO code order)
  if (effectivePWM > 0) {
    digitalWrite(PIN_MOTOR_BIN_1, HIGH);  // Forward (TB6612: HIGH)
  } else {
    digitalWrite(PIN_MOTOR_BIN_1, LOW);   // Reverse (TB6612: LOW)
  }
  
  // Then set PWM magnitude
  analogWrite(PIN_MOTOR_PWMB, abs(effectivePWM));
}

int16_t MotorDriverTB6612::applyDeadband(int16_t pwm) {
  if (abs(pwm) < deadband) {
    return 0;
  }
  return pwm;
}

int16_t MotorDriverTB6612::applyRamp(int16_t current, int16_t target) {
  int16_t diff = target - current;
  
  if (abs(diff) <= rampRate) {
    return target;  // Close enough
  }
  
  // Ramp towards target
  if (diff > 0) {
    return current + rampRate;
  } else {
    return current - rampRate;
  }
}

int16_t MotorDriverTB6612::applyKickstart(int16_t pwm, bool& needsKickstart, unsigned long& kickstartEndTime) {
  // Kickstart: Apply a brief higher PWM pulse to overcome static friction
  // when transitioning from stopped to moving
  
  if (!needsKickstart) {
    return pwm;
  }
  
  // Check if kickstart period has ended
  if (millis() >= kickstartEndTime) {
    needsKickstart = false;
    return pwm;
  }
  
  // During kickstart, apply at least MOTOR_KICKSTART_PWM
  int16_t absPwm = abs(pwm);
  if (absPwm < MOTOR_KICKSTART_PWM && absPwm > 0) {
    // Boost PWM during kickstart
    return (pwm > 0) ? MOTOR_KICKSTART_PWM : -MOTOR_KICKSTART_PWM;
  }
  
  return pwm;
}

bool MotorDriverTB6612::test() {
  // Basic test: verify STBY pin and motor pins can be set
  
  // Enable motors via STBY
  enable();
  delay(10);
  
  // Test direction pins can be written
  digitalWrite(PIN_MOTOR_AIN_1, LOW);
  digitalWrite(PIN_MOTOR_BIN_1, HIGH);
  
  // Test PWM pins with brief pulse
  analogWrite(PIN_MOTOR_PWMA, 50);
  delay(10);
  analogWrite(PIN_MOTOR_PWMA, 0);
  
  analogWrite(PIN_MOTOR_PWMB, 50);
  delay(10);
  analogWrite(PIN_MOTOR_PWMB, 0);
  
  // Disable motors
  disable();
  
  return true;
}

