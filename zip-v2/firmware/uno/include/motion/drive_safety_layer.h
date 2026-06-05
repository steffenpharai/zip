/*
 * Drive Safety Layer
 * 
 * Battery-aware PWM limiting with deadband compensation, slew-rate limiting,
 * and kickstart pulse for torque-safe motor control.
 * 
 * All PWM commands route through this layer before reaching the TB6612 driver.
 */

#ifndef DRIVE_SAFETY_LAYER_H
#define DRIVE_SAFETY_LAYER_H

#include <Arduino.h>

// ============================================================================
// COMPILE-TIME CONFIGURATION FLAGS
// ============================================================================

// Enable/disable safety layer globally (default: enabled)
#ifndef SAFETY_LAYER_ENABLED
#define SAFETY_LAYER_ENABLED 1
#endif

// Bypass safety layer for direct motor commands N=999 (default: disabled)
#ifndef SAFETY_LAYER_BYPASS_DIRECT
#define SAFETY_LAYER_BYPASS_DIRECT 0
#endif

// Enable kickstart pulse feature (default: enabled)
#ifndef KICKSTART_ENABLED
#define KICKSTART_ENABLED 1
#endif

// Enable stall detection heuristic (default: disabled - conservative)
#ifndef STALL_DETECT_ENABLED
#define STALL_DETECT_ENABLED 0
#endif

// ============================================================================
// BATTERY THRESHOLDS (millivolts)
// ============================================================================

#ifndef BATT_THRESH_OK_MV
#define BATT_THRESH_OK_MV   7400  // >= this is OK
#endif

#ifndef BATT_THRESH_LOW_MV
#define BATT_THRESH_LOW_MV  7000  // >= this and < OK is LOW
#endif
// < LOW_MV is CRITICAL

// ============================================================================
// DEFAULT DEADBAND VALUES (PWM units, 0-255)
// ============================================================================

#ifndef PWM_DEADBAND_L_DEFAULT
#define PWM_DEADBAND_L_DEFAULT  55
#endif

#ifndef PWM_DEADBAND_R_DEFAULT
#define PWM_DEADBAND_R_DEFAULT  55
#endif

// ============================================================================
// SLEW RATE LIMITS (PWM units per 50Hz tick)
// ============================================================================

// OK battery state
#ifndef RAMP_ACCEL_STEP_OK
#define RAMP_ACCEL_STEP_OK  12
#endif

#ifndef RAMP_DECEL_STEP_OK
#define RAMP_DECEL_STEP_OK  20
#endif

// LOW battery state (gentler)
#ifndef RAMP_ACCEL_STEP_LOW
#define RAMP_ACCEL_STEP_LOW  6
#endif

#ifndef RAMP_DECEL_STEP_LOW
#define RAMP_DECEL_STEP_LOW  15
#endif

// CRIT battery state (very gentle)
#ifndef RAMP_ACCEL_STEP_CRIT
#define RAMP_ACCEL_STEP_CRIT  4
#endif

#ifndef RAMP_DECEL_STEP_CRIT
#define RAMP_DECEL_STEP_CRIT  10
#endif

// ============================================================================
// PWM CAPS BY BATTERY STATE
// ============================================================================

#ifndef PWM_CAP_OK
#define PWM_CAP_OK    255
#endif

#ifndef PWM_CAP_LOW
#define PWM_CAP_LOW   180
#endif

#ifndef PWM_CAP_CRIT
#define PWM_CAP_CRIT  100
#endif

// ============================================================================
// KICKSTART CONFIGURATION
// ============================================================================

#ifndef KICKSTART_DURATION_TICKS
#define KICKSTART_DURATION_TICKS  4  // 80ms at 50Hz
#endif

#ifndef KICKSTART_BOOST
#define KICKSTART_BOOST  25  // Added to deadband during kickstart
#endif

// ============================================================================
// ENUMS AND TYPES
// ============================================================================

// Battery state classification
enum BatteryState : uint8_t {
  BATT_OK   = 0,  // >= 7400mV - full capability
  BATT_LOW  = 1,  // 7000-7399mV - reduced capability
  BATT_CRIT = 2   // < 7000mV - minimal capability
};

// ============================================================================
// DRIVE SAFETY LAYER CLASS
// ============================================================================

class DriveSafetyLayer {
public:
  DriveSafetyLayer();
  
  // Initialize with default configuration
  void init();
  
  // Update battery state from voltage reading (call from task_sensors_slow)
  void updateBatteryState(uint16_t voltage_mv);
  
  // Main entry point: Apply all limits to PWM values
  // Modifies left/right in place. Call at 50Hz from control loop.
  void applyLimits(int16_t* left, int16_t* right);
  
  // Reset slew state (call on stop commands)
  void resetSlew();
  
  // ---- Configuration setters (for N=140 runtime config) ----
  
  void setDeadbandL(uint8_t db) { deadbandL = db; }
  void setDeadbandR(uint8_t db) { deadbandR = db; }
  void setAccelStep(uint8_t step) { accelStepOverride = step; }
  void setDecelStep(uint8_t step) { decelStepOverride = step; }
  void setMaxPwmCap(uint8_t cap) { maxPwmOverride = cap; }
  void setKickEnabled(bool en) { kickEnabledOverride = en ? 1 : 0; }
  
  // Clear overrides (use battery-based defaults)
  void clearAccelOverride() { accelStepOverride = 0; }
  void clearDecelOverride() { decelStepOverride = 0; }
  void clearMaxPwmOverride() { maxPwmOverride = 0; }
  void clearKickOverride() { kickEnabledOverride = 0xFF; }
  
  // ---- Getters for diagnostics (N=120) ----
  
  BatteryState getBatteryState() const { return batteryState; }
  uint8_t getDeadbandL() const { return deadbandL; }
  uint8_t getDeadbandR() const { return deadbandR; }
  uint8_t getEffectiveAccelStep() const;
  uint8_t getEffectiveDecelStep() const;
  uint8_t getEffectiveMaxPwm() const;
  bool isKickEnabled() const;
  int16_t getCurrentLimitedL() const { return currentLimitedL; }
  int16_t getCurrentLimitedR() const { return currentLimitedR; }
  
#if STALL_DETECT_ENABLED
  bool isStallSuspected() const { return stallSuspected; }
  void clearStallFlag() { stallSuspected = false; }
#endif

private:
  // Current battery state
  BatteryState batteryState;
  
  // Deadband values (per-wheel)
  uint8_t deadbandL;
  uint8_t deadbandR;
  
  // Current limited PWM values (for slew tracking)
  int16_t currentLimitedL;
  int16_t currentLimitedR;
  
  // Kickstart state tracking
  uint8_t kickLeftEndTick;   // Tick count when kick ends (0 = inactive)
  uint8_t kickRightEndTick;
  uint8_t tickCounter;       // Rolling tick counter (0-255)
  
  // Runtime overrides (0 = use battery-based default, 0xFF for kick = use default)
  uint8_t accelStepOverride;
  uint8_t decelStepOverride;
  uint8_t maxPwmOverride;
  uint8_t kickEnabledOverride;  // 0=disabled, 1=enabled, 0xFF=use default
  
#if STALL_DETECT_ENABLED
  // Stall detection state
  bool stallSuspected;
  uint16_t highPwmStartTick;
  uint16_t lastBatteryMv;
#endif

  // ---- Internal helper methods ----
  
  // Apply slew rate limiting to a single value
  int16_t applySlewLimit(int16_t current, int16_t target, uint8_t accelStep, uint8_t decelStep);
  
  // Apply deadband compensation to a single value
  int16_t applyDeadband(int16_t pwm, uint8_t deadband);
  
  // Apply PWM cap
  int16_t applyCap(int16_t pwm, uint8_t cap);
  
  // Handle kickstart pulse for a single wheel
  int16_t applyKickstart(int16_t pwm, int16_t currentPwm, uint8_t deadband,
                         uint8_t* kickEndTick);
};

// Global instance (declared in drive_safety_layer.cpp)
extern DriveSafetyLayer driveSafety;

#endif // DRIVE_SAFETY_LAYER_H

