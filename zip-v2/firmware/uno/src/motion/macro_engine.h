/*
 * Macro Engine
 * 
 * Non-blocking macro execution for complex motion sequences
 */

#ifndef MACRO_ENGINE_H
#define MACRO_ENGINE_H

#include <Arduino.h>
#include "../../include/motion_types.h"
#include "../../include/hal/motor_driver.h"

class MacroEngine {
public:
  MacroEngine();
  
  void init(MotorDriverTB6612* motor);
  
  // Start a macro
  bool startMacro(MacroID id, uint8_t intensity, uint32_t ttl_ms);
  
  // Cancel current macro
  void cancel();
  
  // Update macro engine (call from control loop)
  void update();
  
  // Check if macro is active
  bool isActive() const { return state.active; }
  
  // Get current macro ID
  MacroID getCurrentMacro() const { return state.id; }
  
private:
  MotorDriverTB6612* motorDriver;
  MacroState state;
  
  // Macro step definitions
  struct MacroStep {
    int16_t v;      // Target forward velocity
    int16_t w;      // Target yaw velocity
    uint32_t duration_ms;  // Step duration
  };
  
  // Macro definitions (non-blocking state machines)
  static const MacroStep figure8_steps[];
  static const size_t figure8_step_count;
  
  static const MacroStep spin360_steps[];
  static const size_t spin360_step_count;
  
  static const MacroStep wiggle_steps[];
  static const size_t wiggle_step_count;
  
  static const MacroStep forward_then_stop_steps[];
  static const size_t forward_then_stop_step_count;
  
  // Execute current step
  void executeStep();
  
  // Get macro step array
  const MacroStep* getMacroSteps(MacroID id, size_t& count);
};

#endif // MACRO_ENGINE_H

