/*
 * Drive Safety Layer Implementation
 * 
 * Battery-aware PWM limiting with deadband compensation, slew-rate limiting,
 * and kickstart pulse for torque-safe motor control.
 */

#include "../../include/motion/drive_safety_layer.h"

// Global instance
DriveSafetyLayer driveSafety;

DriveSafetyLayer::DriveSafetyLayer()
  : batteryState(BATT_OK)
  , deadbandL(PWM_DEADBAND_L_DEFAULT)
  , deadbandR(PWM_DEADBAND_R_DEFAULT)
  , currentLimitedL(0)
  , currentLimitedR(0)
  , kickLeftEndTick(0)
  , kickRightEndTick(0)
  , tickCounter(0)
  , accelStepOverride(0)
  , decelStepOverride(0)
  , maxPwmOverride(0)
  , kickEnabledOverride(0xFF)
#if STALL_DETECT_ENABLED
  , stallSuspected(false)
  , highPwmStartTick(0)
  , lastBatteryMv(7400)
#endif
{
}

void DriveSafetyLayer::init() {
  batteryState = BATT_OK;
  deadbandL = PWM_DEADBAND_L_DEFAULT;
  deadbandR = PWM_DEADBAND_R_DEFAULT;
  currentLimitedL = 0;
  currentLimitedR = 0;
  kickLeftEndTick = 0;
  kickRightEndTick = 0;
  tickCounter = 0;
  accelStepOverride = 0;
  decelStepOverride = 0;
  maxPwmOverride = 0;
  kickEnabledOverride = 0xFF;
  
#if STALL_DETECT_ENABLED
  stallSuspected = false;
  highPwmStartTick = 0;
  lastBatteryMv = 7400;
#endif
}

void DriveSafetyLayer::updateBatteryState(uint16_t voltage_mv) {
#if STALL_DETECT_ENABLED
  lastBatteryMv = voltage_mv;
#endif
  
  // Classify battery state based on voltage thresholds
  if (voltage_mv >= BATT_THRESH_OK_MV) {
    batteryState = BATT_OK;
  } else if (voltage_mv >= BATT_THRESH_LOW_MV) {
    batteryState = BATT_LOW;
  } else {
    batteryState = BATT_CRIT;
  }
}

uint8_t DriveSafetyLayer::getEffectiveAccelStep() const {
  // Use override if set, otherwise use battery-based default
  if (accelStepOverride > 0) {
    return accelStepOverride;
  }
  
  switch (batteryState) {
    case BATT_LOW:  return RAMP_ACCEL_STEP_LOW;
    case BATT_CRIT: return RAMP_ACCEL_STEP_CRIT;
    default:        return RAMP_ACCEL_STEP_OK;
  }
}

uint8_t DriveSafetyLayer::getEffectiveDecelStep() const {
  // Use override if set, otherwise use battery-based default
  if (decelStepOverride > 0) {
    return decelStepOverride;
  }
  
  switch (batteryState) {
    case BATT_LOW:  return RAMP_DECEL_STEP_LOW;
    case BATT_CRIT: return RAMP_DECEL_STEP_CRIT;
    default:        return RAMP_DECEL_STEP_OK;
  }
}

uint8_t DriveSafetyLayer::getEffectiveMaxPwm() const {
  // Use override if set, otherwise use battery-based default
  if (maxPwmOverride > 0) {
    return maxPwmOverride;
  }
  
  switch (batteryState) {
    case BATT_LOW:  return PWM_CAP_LOW;
    case BATT_CRIT: return PWM_CAP_CRIT;
    default:        return PWM_CAP_OK;
  }
}

bool DriveSafetyLayer::isKickEnabled() const {
#if !KICKSTART_ENABLED
  return false;
#else
  // If override is set (0 or 1), use it
  if (kickEnabledOverride != 0xFF) {
    return kickEnabledOverride == 1;
  }
  
  // Default: enabled only in OK battery state
  return (batteryState == BATT_OK);
#endif
}

void DriveSafetyLayer::resetSlew() {
  currentLimitedL = 0;
  currentLimitedR = 0;
  kickLeftEndTick = 0;
  kickRightEndTick = 0;
}

void DriveSafetyLayer::applyLimits(int16_t* left, int16_t* right) {
#if !SAFETY_LAYER_ENABLED
  // Safety layer disabled - pass through unchanged
  return;
#endif

  // Increment tick counter (wraps at 255)
  tickCounter++;
  
  // Get effective parameters based on battery state and overrides
  uint8_t accelStep = getEffectiveAccelStep();
  uint8_t decelStep = getEffectiveDecelStep();
  uint8_t maxPwm = getEffectiveMaxPwm();
  
  // Store targets before modification
  int16_t targetL = *left;
  int16_t targetR = *right;
  
  // Step 1: Apply PWM cap
  targetL = applyCap(targetL, maxPwm);
  targetR = applyCap(targetR, maxPwm);
  
  // Step 2: Apply slew rate limiting
  int16_t limitedL = applySlewLimit(currentLimitedL, targetL, accelStep, decelStep);
  int16_t limitedR = applySlewLimit(currentLimitedR, targetR, accelStep, decelStep);
  
  // Step 3: Apply kickstart if enabled (before deadband, after slew)
#if KICKSTART_ENABLED
  if (isKickEnabled()) {
    limitedL = applyKickstart(limitedL, currentLimitedL, deadbandL, &kickLeftEndTick);
    limitedR = applyKickstart(limitedR, currentLimitedR, deadbandR, &kickRightEndTick);
  }
#endif
  
  // Step 4: Apply deadband compensation
  limitedL = applyDeadband(limitedL, deadbandL);
  limitedR = applyDeadband(limitedR, deadbandR);
  
  // Update tracked current values
  currentLimitedL = limitedL;
  currentLimitedR = limitedR;
  
  // Output the limited values
  *left = limitedL;
  *right = limitedR;
}

int16_t DriveSafetyLayer::applySlewLimit(int16_t current, int16_t target, 
                                          uint8_t accelStep, uint8_t decelStep) {
  int16_t diff = target - current;
  
  if (diff == 0) {
    return target;
  }
  
  // Determine if accelerating or decelerating
  // Acceleration: moving away from 0 or increasing magnitude
  // Deceleration: moving toward 0 or decreasing magnitude
  bool isAccel;
  if (target == 0) {
    // Going to stop - always deceleration
    isAccel = false;
  } else if (current == 0) {
    // Starting from stop - always acceleration
    isAccel = true;
  } else if ((current > 0 && target > 0) || (current < 0 && target < 0)) {
    // Same direction: accel if magnitude increasing
    isAccel = (abs(target) > abs(current));
  } else {
    // Direction reversal: treat as decel then accel (use decel for safety)
    isAccel = false;
  }
  
  uint8_t maxStep = isAccel ? accelStep : decelStep;
  
  // Clamp the change to max step
  if (abs(diff) <= maxStep) {
    return target;
  }
  
  if (diff > 0) {
    return current + maxStep;
  } else {
    return current - maxStep;
  }
}

int16_t DriveSafetyLayer::applyDeadband(int16_t pwm, uint8_t deadband) {
  // If PWM is 0, keep it at 0
  if (pwm == 0) {
    return 0;
  }
  
  // If magnitude is below deadband, bump to deadband
  if (abs(pwm) < deadband) {
    return (pwm > 0) ? deadband : -((int16_t)deadband);
  }
  
  return pwm;
}

int16_t DriveSafetyLayer::applyCap(int16_t pwm, uint8_t cap) {
  if (pwm > (int16_t)cap) {
    return (int16_t)cap;
  }
  if (pwm < -((int16_t)cap)) {
    return -((int16_t)cap);
  }
  return pwm;
}

int16_t DriveSafetyLayer::applyKickstart(int16_t pwm, int16_t currentPwm, 
                                          uint8_t deadband, uint8_t* kickEndTick) {
#if !KICKSTART_ENABLED
  return pwm;
#else
  // Check if kickstart is currently active
  if (*kickEndTick != 0) {
    // Check if kick period has ended (handle wraparound)
    uint8_t elapsed = tickCounter - *kickEndTick + KICKSTART_DURATION_TICKS;
    if (elapsed >= KICKSTART_DURATION_TICKS) {
      // Kick period ended
      *kickEndTick = 0;
    } else {
      // Still in kick period - apply boosted PWM
      if (pwm != 0) {
        int16_t kickPwm = deadband + KICKSTART_BOOST;
        if (abs(pwm) < kickPwm) {
          return (pwm > 0) ? kickPwm : -kickPwm;
        }
      }
    }
  }
  
  // Check if we should start a new kickstart
  // Trigger: transitioning from 0 to non-zero
  if (currentPwm == 0 && pwm != 0 && *kickEndTick == 0) {
    // Start kickstart
    *kickEndTick = tickCounter + KICKSTART_DURATION_TICKS;
    
    // Apply boosted PWM
    int16_t kickPwm = deadband + KICKSTART_BOOST;
    if (abs(pwm) < kickPwm) {
      return (pwm > 0) ? kickPwm : -kickPwm;
    }
  }
  
  return pwm;
#endif
}

