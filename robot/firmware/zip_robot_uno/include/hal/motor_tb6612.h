/*
 * Motor Driver HAL - TB6612FNG
 * 
 * Toshiba TB6612FNG dual H-bridge motor driver
 * On ELEGOO SmartCar Shield v1.1 (V1_20230201 version)
 * 
 * Key characteristics:
 *   - STBY pin REQUIRED (D3) - must be HIGH to enable motor output
 *   - Direction pins: AIN_1 (D7) for right, BIN_1 (D8) for left
 *   - Both motors use same polarity: HIGH = forward, LOW = reverse
 */

#ifndef MOTOR_TB6612_H
#define MOTOR_TB6612_H

#include <Arduino.h>
#include "../board/board_elegoo_uno_smartcar_shield_v11.h"

class MotorDriverTB6612 {
public:
  MotorDriverTB6612();
  
  // Initialization - sets up pins and ensures safe state
  void init();
  
  // Motor control (-255 to 255, negative = reverse)
  void setLeftMotor(int16_t pwm);
  void setRightMotor(int16_t pwm);
  void setMotors(int16_t left, int16_t right);
  
  // Tank drive (direct PWM control)
  void tankDrive(int16_t leftPWM, int16_t rightPWM);
  
  // Twist drive (v, omega) - converts to left/right PWM
  void twistDrive(int16_t v, int16_t omega);  // v in mm/s, omega in mrad/s
  
  // Stop methods
  void stop();         // Immediate stop (PWM = 0)
  void brake();        // Active brake (short motor windings)
  void coast();        // Coast to stop (same as stop for TB6612)
  
  // Enable/disable via STBY pin
  void enable();       // STBY HIGH - motors can run
  void disable();      // STBY LOW - motors disabled
  
  // Ramping (slew-rate limiting)
  void setRampRate(uint8_t rate);  // Max PWM change per iteration
  void update();  // Call from control loop to apply ramping
  
  // Deadband compensation
  void setDeadband(uint8_t deadband);
  
  // Get current PWM values
  int16_t getLeftPWM() const { return currentLeftPWM; }
  int16_t getRightPWM() const { return currentRightPWM; }
  
  // Check if motors are "enabled" (STBY high and non-zero target)
  bool isEnabled() const { return enabled; }
  
  // Self-test
  bool test();  // Returns true if motors respond
  
private:
  // Target PWM values (set by commands)
  int16_t targetLeftPWM;
  int16_t targetRightPWM;
  
  // Current PWM values (after ramping)
  int16_t currentLeftPWM;
  int16_t currentRightPWM;
  
  // Ramping
  uint8_t rampRate;
  
  // Deadband
  uint8_t deadband;
  
  // Enabled state (STBY pin state)
  bool enabled;
  
  // Kickstart tracking
  bool needsKickstartLeft;
  bool needsKickstartRight;
  unsigned long kickstartEndTimeLeft;
  unsigned long kickstartEndTimeRight;
  
  // Internal methods
  
  // Apply PWM to a motor with correct TB6612FNG direction logic
  // Motor A (Right): forward = AIN_1 HIGH
  // Motor B (Left):  forward = BIN_1 HIGH
  void applyMotorA(int16_t pwm);  // Right motor
  void applyMotorB(int16_t pwm);  // Left motor
  
  // Apply deadband compensation
  int16_t applyDeadband(int16_t pwm);
  
  // Apply ramping (slew-rate limiting)
  int16_t applyRamp(int16_t current, int16_t target);
  
  // Handle kickstart pulse for static friction
  int16_t applyKickstart(int16_t pwm, bool& needsKickstart, unsigned long& kickstartEndTime);
};

#endif // MOTOR_TB6612_H

