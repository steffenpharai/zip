/*
 * Motion Controller Implementation
 */

#include "motion_controller.h"
#include "../../include/motion/drive_safety_layer.h"

// Official ELEGOO differential mixing constant
const float MotionController::DIFF_MIX_K = 1.0f;  // k in left = v - k*w, right = v + k*w
// Official ELEGOO has NO slew limiting - PWM applied immediately
// Setting to 255 effectively disables slew limiting for immediate response
const int16_t MotionController::SLEW_LIMIT = 255; // Disabled (official: instant PWM)

MotionController::MotionController()
  : motorDriver(nullptr)
  , state(MOTION_STATE_IDLE)
  , currentLeft(0)
  , currentRight(0)
{
  currentSetpoint.v = 0;
  currentSetpoint.w = 0;
  currentSetpoint.ttl_ms = 0;
  currentSetpoint.timestamp = 0;
}

void MotionController::init(MotorDriverTB6612* motor) {
  motorDriver = motor;
  state = MOTION_STATE_IDLE;
  currentLeft = 0;
  currentRight = 0;
}

void MotionController::setSetpoint(int16_t v, int16_t w, uint32_t ttl_ms) {
  // Clamp inputs
  v = constrain(v, -255, 255);
  w = constrain(w, -255, 255);
  
  // Set TTL (minimum 150ms, maximum 10000ms for single commands)
  // For streaming at 20Hz, use 200-300ms. For single commands, can use longer TTL.
  ttl_ms = constrain(ttl_ms, 150, 10000);
  
  uint32_t now = millis();
  
  // TTL Extension Logic: When motion is already active, extend TTL instead of resetting
  // This ensures continuous motion when streaming commands
  if (state == MOTION_STATE_SETPOINT && motorDriver && currentSetpoint.timestamp > 0) {
    // Motion already active - extend TTL window
    // Check timestamp > 0 to avoid issues with uninitialized timestamp
    uint32_t elapsed = now - currentSetpoint.timestamp;
    // Handle millis() wraparound: if now < timestamp, wraparound occurred
    if (elapsed < currentSetpoint.ttl_ms && now >= currentSetpoint.timestamp) {
      // TTL hasn't expired - calculate remaining time and extend
      uint32_t remaining = currentSetpoint.ttl_ms - elapsed;
      // Extend: new expiration = current expiration + new_ttl
      // Current expiration = timestamp + ttl_ms = now - elapsed + ttl_ms = now + remaining
      // New expiration = now + remaining + new_ttl
      // So: new_timestamp = now, new_ttl = remaining + new_ttl
      currentSetpoint.timestamp = now;
      currentSetpoint.ttl_ms = remaining + ttl_ms;
    } else {
      // TTL already expired or wraparound - reset to new command
      currentSetpoint.timestamp = now;
      currentSetpoint.ttl_ms = ttl_ms;
    }
  } else {
    // New motion or idle - reset timestamp
    currentSetpoint.timestamp = now;
    currentSetpoint.ttl_ms = ttl_ms;
  }
  
  // Update setpoint values
  currentSetpoint.v = v;
  currentSetpoint.w = w;
  
  state = MOTION_STATE_SETPOINT;
  
  // Enable motors if not already enabled
  if (motorDriver) {
    motorDriver->enable();
    
    // Official Elegoo pattern: Apply PWM immediately (matching DeviceDriverSet_Motor_control)
    // Don't wait for update() loop - apply immediately like official code
    int16_t targetLeft, targetRight;
    applyDifferentialMix(v, w, targetLeft, targetRight);
    
#if SAFETY_LAYER_ENABLED
    // Apply safety layer limits (battery-aware cap, ramping, deadband, kickstart)
    driveSafety.applyLimits(&targetLeft, &targetRight);
#endif
    
    // Update current values
    currentLeft = targetLeft;
    currentRight = targetRight;
    
    // Apply PWM immediately (matching official behavior)
    motorDriver->setMotors(currentLeft, currentRight);
  }
}

void MotionController::update() {
  if (state != MOTION_STATE_SETPOINT || !motorDriver) {
    return;
  }
  
  // Check TTL expiration
  // Note: With TTL extension logic, when new setpoints arrive during active motion,
  // the timestamp and TTL are adjusted to extend the expiration window.
  // This ensures continuous motion when streaming commands.
  uint32_t elapsed = millis() - currentSetpoint.timestamp;
  if (elapsed >= currentSetpoint.ttl_ms) {
    // TTL expired - stop
    stop();
    return;
  }
  
  // Official Elegoo pattern: Re-apply PWM on every update to maintain motion
  // (Official code doesn't have update loop, but we need to maintain setpoint until TTL expires)
  // Recalculate targets (in case setpoint changed)
  int16_t targetLeft, targetRight;
  applyDifferentialMix(currentSetpoint.v, currentSetpoint.w, targetLeft, targetRight);
  
#if SAFETY_LAYER_ENABLED
  // Apply safety layer limits (battery-aware cap, ramping, deadband, kickstart)
  driveSafety.applyLimits(&targetLeft, &targetRight);
#endif
  
  // Update current values to match targets
  currentLeft = targetLeft;
  currentRight = targetRight;
  
  // Re-apply PWM to maintain motion (matching official Elegoo behavior)
  // This ensures PWM is maintained even if something tries to change it
  motorDriver->setMotors(currentLeft, currentRight);
}

void MotionController::stop() {
  // Stop motion regardless of current state (IDLE, SETPOINT, DIRECT, MACRO)
  state = MOTION_STATE_IDLE;
  currentSetpoint.v = 0;
  currentSetpoint.w = 0;
  currentLeft = 0;
  currentRight = 0;
  
  // REMOVED: motorDriver->stop() - motor control is centralized in main.cpp
  // This function only updates state, actual motor pins are controlled by main.cpp
}

void MotionController::setDirectMode() {
  // Set to DIRECT state - update loop will skip this state
  // Motor driver maintains PWM values set by direct commands
  state = MOTION_STATE_DIRECT;
  // Don't clear setpoint values - they're not used in DIRECT mode anyway
}

void MotionController::getCurrentSetpoint(int16_t& v, int16_t& w) const {
  v = currentSetpoint.v;
  w = currentSetpoint.w;
}

void MotionController::applyDifferentialMix(int16_t v, int16_t w, int16_t& left, int16_t& right) {
  // Differential drive mixing:
  // left = v - k*w
  // right = v + k*w
  left = v - (int16_t)(DIFF_MIX_K * w);
  right = v + (int16_t)(DIFF_MIX_K * w);
  
  // Clamp to valid PWM range
  left = constrain(left, -255, 255);
  right = constrain(right, -255, 255);
}

void MotionController::applySlewLimit(int16_t& value, int16_t target) {
  int16_t diff = target - value;
  
  if (abs(diff) <= SLEW_LIMIT) {
    value = target;  // Close enough
  } else {
    // Ramp towards target
    if (diff > 0) {
      value += SLEW_LIMIT;
    } else {
      value -= SLEW_LIMIT;
    }
  }
}

