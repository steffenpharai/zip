/*
 * ELEGOO Command Router
 * 
 * Routes legacy ELEGOO commands (N=1..110) to minimal handlers
 * Preserves stop/standby functionality
 */

#ifndef ELEGOO_COMMAND_ROUTER_H
#define ELEGOO_COMMAND_ROUTER_H

#include <Arduino.h>
#include "../serial/frame_parser.h"
#include "../../include/hal/motor_driver.h"

class ElegooCommandRouter {
public:
  ElegooCommandRouter();
  
  void init(MotorDriverTB6612* motor);
  
  // Route command based on N value
  // Returns true if command was handled
  bool routeCommand(const ParsedCommand& cmd);
  
  // Handle legacy stop commands (N=100, N=3 D1=9)
  void handleStop();
  
private:
  MotorDriverTB6612* motorDriver;
  
  // Minimal handlers for critical legacy commands
  bool handleN100(const ParsedCommand& cmd);  // Clear all functions - standby
  bool handleN3(const ParsedCommand& cmd);    // Car control - check for stop (D1=9)
  bool handleN4(const ParsedCommand& cmd);   // Motor speed control (left, right)
};

#endif // ELEGOO_COMMAND_ROUTER_H

