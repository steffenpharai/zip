/*
 * Motion Controller
 * 
 * Handles drive-by-wire setpoint control with differential mixing
 */

#ifndef MOTION_CONTROLLER_H
#define MOTION_CONTROLLER_H

#include <Arduino.h>
#include "../../include/motion_types.h"
#include "../../include/hal/motor_driver.h"

class MotionController {
public:
  MotionController();
  
  void init(MotorDriverTB6612* motor);
  
  // Set setpoint (v, w) with TTL
  // v: forward command (-255..255)
  // w: yaw command (-255..255)
  // ttl_ms: time-to-live in milliseconds
  void setSetpoint(int16_t v, int16_t w, uint32_t ttl_ms);
  
  // Update motion controller (call from control loop at fixed cadence)
  void update();
  
  // Stop motion immediately
  void stop();
  
  // Check if setpoint is active
  bool isActive() const { return state == MOTION_STATE_SETPOINT; }
  
  // Set direct motor control mode (N=999) - bypasses TTL and update loop
  void setDirectMode();
  
  // Get current state
  MotionState getState() const { return state; }
  
  // Get current setpoint
  void getCurrentSetpoint(int16_t& v, int16_t& w) const;
  
private:
  MotorDriverTB6612* motorDriver;
  MotionState state;
  SetpointCommand currentSetpoint;
  
  // Differential mixing constant (k in left = v - k*w, right = v + k*w)
  static const float DIFF_MIX_K;
  
  // Slew limiter: max change per update
  static const int16_t SLEW_LIMIT;
  
  // Current output values (after mixing and clamping)
  int16_t currentLeft;
  int16_t currentRight;
  
  // Apply differential mixing: v,w → left,right
  void applyDifferentialMix(int16_t v, int16_t w, int16_t& left, int16_t& right);
  
  // Apply slew limiting
  void applySlewLimit(int16_t& value, int16_t target);
};

#endif // MOTION_CONTROLLER_H

