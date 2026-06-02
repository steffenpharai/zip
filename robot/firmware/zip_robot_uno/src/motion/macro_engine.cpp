/*
 * Macro Engine Implementation
 */

#include "macro_engine.h"
#include "../../include/motion/drive_safety_layer.h"

// FIGURE_8 macro steps (using official ELEGOO obstacle avoidance speed ~150)
const MacroEngine::MacroStep MacroEngine::figure8_steps[] = {
  {150, 75, 2000},   // Forward-right arc
  {150, -75, 2000},  // Forward-left arc
  {150, 75, 2000},   // Forward-right arc
  {150, -75, 2000},  // Forward-left arc
  {0, 0, 500}        // Stop
};
const size_t MacroEngine::figure8_step_count = sizeof(figure8_steps) / sizeof(MacroStep);

// SPIN_360 macro steps (using official ELEGOO rocker speed ~250)
const MacroEngine::MacroStep MacroEngine::spin360_steps[] = {
  {0, 250, 1800},    // Spin in place (360 degrees)
  {0, 0, 500}        // Stop
};
const size_t MacroEngine::spin360_step_count = sizeof(spin360_steps) / sizeof(MacroStep);

// WIGGLE macro steps (using official ELEGOO speeds)
const MacroEngine::MacroStep MacroEngine::wiggle_steps[] = {
  {100, 150, 300},   // Forward-right
  {100, -150, 300},  // Forward-left
  {100, 150, 300},   // Forward-right
  {100, -150, 300},  // Forward-left
  {0, 0, 500}        // Stop
};
const size_t MacroEngine::wiggle_step_count = sizeof(wiggle_steps) / sizeof(MacroStep);

// FORWARD_THEN_STOP macro steps (using official ELEGOO speed)
const MacroEngine::MacroStep MacroEngine::forward_then_stop_steps[] = {
  {200, 0, 2000},    // Forward at good speed
  {0, 0, 500}        // Stop
};
const size_t MacroEngine::forward_then_stop_step_count = sizeof(forward_then_stop_steps) / sizeof(MacroStep);

MacroEngine::MacroEngine()
  : motorDriver(nullptr)
{
  state.active = false;
  state.id = MACRO_FIGURE_8;
  state.stepIndex = 0;
  state.stepStartTime = 0;
  state.stepDuration = 0;
  state.targetV = 0;
  state.targetW = 0;
  state.ttl_ms = 0;
  state.startTime = 0;
}

void MacroEngine::init(MotorDriverTB6612* motor) {
  motorDriver = motor;
  state.active = false;
}

bool MacroEngine::startMacro(MacroID id, uint8_t intensity, uint32_t ttl_ms) {
  // Validate macro ID
  if (id < MACRO_FIGURE_8 || id > MACRO_FORWARD_THEN_STOP) {
    return false;
  }
  
  // Clamp intensity (0-255, scales macro speeds)
  intensity = constrain(intensity, 0, 255);
  
  // Set TTL (minimum 1000ms, maximum 10000ms)
  ttl_ms = constrain(ttl_ms, 1000, 10000);
  
  state.id = id;
  state.stepIndex = 0;
  state.stepStartTime = millis();
  state.startTime = millis();
  state.ttl_ms = ttl_ms;
  state.active = true;
  
  // Get macro steps
  size_t stepCount;
  const MacroStep* steps = getMacroSteps(id, stepCount);
  if (steps == nullptr || stepCount == 0) {
    state.active = false;
    return false;
  }
  
  // Initialize first step
  state.stepDuration = steps[0].duration_ms;
  // Scale by intensity (0-255 -> 0.0-1.0)
  float scale = intensity / 255.0f;
  state.targetV = (int16_t)(steps[0].v * scale);
  state.targetW = (int16_t)(steps[0].w * scale);
  
  // Enable motors
  if (motorDriver) {
    motorDriver->enable();
  }
  
  return true;
}

void MacroEngine::cancel() {
  // Just mark as inactive - don't touch motor pins
  // Motor control is handled by the single-ownership model in main.cpp
  state.active = false;
  // REMOVED: motorDriver->stop() - causes multiple-writer conflict
}

void MacroEngine::update() {
  if (!state.active || !motorDriver) {
    return;
  }
  
  // Check TTL expiration
  uint32_t elapsed = millis() - state.startTime;
  if (elapsed >= state.ttl_ms) {
    // TTL expired - stop
    cancel();
    return;
  }
  
  // Check if current step is complete
  uint32_t stepElapsed = millis() - state.stepStartTime;
  if (stepElapsed >= state.stepDuration) {
    // Move to next step
    state.stepIndex++;
    state.stepStartTime = millis();
    
    // Get macro steps
    size_t stepCount;
    const MacroStep* steps = getMacroSteps(state.id, stepCount);
    
    if (steps == nullptr || state.stepIndex >= stepCount) {
      // Macro complete
      cancel();
      return;
    }
    
    // Initialize next step
    state.stepDuration = steps[state.stepIndex].duration_ms;
    // For simplicity, use original values (intensity applied at start only)
    state.targetV = steps[state.stepIndex].v;
    state.targetW = steps[state.stepIndex].w;
  }
  
  // Apply current step target to motors with differential mixing
  // Official ELEGOO pattern: left = v - w, right = v + w
  int16_t left = state.targetV - state.targetW;
  int16_t right = state.targetV + state.targetW;
  left = constrain(left, -255, 255);
  right = constrain(right, -255, 255);
  
#if SAFETY_LAYER_ENABLED
  // Apply safety layer limits (battery-aware cap, ramping, deadband, kickstart)
  driveSafety.applyLimits(&left, &right);
#endif
  
  motorDriver->setMotors(left, right);
}

const MacroEngine::MacroStep* MacroEngine::getMacroSteps(MacroID id, size_t& count) {
  switch (id) {
    case MACRO_FIGURE_8:
      count = figure8_step_count;
      return figure8_steps;
      
    case MACRO_SPIN_360:
      count = spin360_step_count;
      return spin360_steps;
      
    case MACRO_WIGGLE:
      count = wiggle_step_count;
      return wiggle_steps;
      
    case MACRO_FORWARD_THEN_STOP:
      count = forward_then_stop_step_count;
      return forward_then_stop_steps;
      
    default:
      count = 0;
      return nullptr;
  }
}

