/*
 * Motion Control Types
 * 
 * Type definitions for motion control system
 */

#ifndef MOTION_TYPES_H
#define MOTION_TYPES_H

#include <Arduino.h>

// Macro IDs for N=210 command
enum MacroID {
  MACRO_FIGURE_8 = 1,
  MACRO_SPIN_360 = 2,
  MACRO_WIGGLE = 3,
  MACRO_FORWARD_THEN_STOP = 4
};

// Motion controller state
enum MotionState {
  MOTION_STATE_IDLE = 0,
  MOTION_STATE_SETPOINT = 1,  // Active setpoint (N=200)
  MOTION_STATE_MACRO = 2,     // Active macro (N=210)
  MOTION_STATE_DIRECT = 3     // Direct motor control (N=999) - bypasses TTL
};

// Setpoint command structure
struct SetpointCommand {
  int16_t v;        // Forward command (-255..255)
  int16_t w;        // Yaw command (-255..255)
  uint32_t ttl_ms;  // Time-to-live in milliseconds
  uint32_t timestamp; // When command was received
};

// Macro state structure
struct MacroState {
  MacroID id;
  uint8_t stepIndex;
  uint32_t stepStartTime;
  uint32_t stepDuration;
  int16_t targetV;
  int16_t targetW;
  bool active;
  uint32_t ttl_ms;
  uint32_t startTime;
};

#endif // MOTION_TYPES_H

