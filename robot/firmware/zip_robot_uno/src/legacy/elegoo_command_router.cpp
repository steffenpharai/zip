/*
 * ELEGOO Command Router Implementation
 */

#include "elegoo_command_router.h"
#include "../serial/json_protocol.h"

ElegooCommandRouter::ElegooCommandRouter()
  : motorDriver(nullptr)
{
}

void ElegooCommandRouter::init(MotorDriverTB6612* motor) {
  motorDriver = motor;
}

bool ElegooCommandRouter::routeCommand(const ParsedCommand& cmd) {
  if (cmd.N < 1 || cmd.N > 110) {
    return false;  // Not a legacy command
  }
  
  // Route to appropriate handler
  switch (cmd.N) {
    case 100:
      return handleN100(cmd);
      
    case 3:
      return handleN3(cmd);
      
    case 4:
      return handleN4(cmd);
      
    default:
      // For other legacy commands, just acknowledge but don't implement
      // This preserves compatibility without full implementation
      JsonProtocol::sendOk(cmd.H);
      return true;
  }
}

void ElegooCommandRouter::handleStop() {
  if (motorDriver) {
    motorDriver->stop();
    motorDriver->disable();
  }
}

bool ElegooCommandRouter::handleN100(const ParsedCommand& cmd) {
  // N=100: Clear all functions - Enter standby mode
  handleStop();
  JsonProtocol::sendOk();  // {ok}
  return true;
}

bool ElegooCommandRouter::handleN3(const ParsedCommand& cmd) {
  // N=3: Car control - No time limit
  // D1: direction (9 = stop)
  // D2: speed
  
  if (cmd.D1 == 9) {
    // Stop command
    handleStop();
    JsonProtocol::sendOk(cmd.H);
    return true;
  }
  
  // Other directions not implemented in MVP
  // Just acknowledge
  JsonProtocol::sendOk(cmd.H);
  return true;
}

bool ElegooCommandRouter::handleN4(const ParsedCommand& cmd) {
  // N=4: Motor speed control
  // D1: left speed (0-255)
  // D2: right speed (0-255)
  
  if (!motorDriver) {
    return false;
  }
  
  // Enable motors
  motorDriver->enable();
  
  // Set motor speeds
  int16_t left = constrain(cmd.D1, 0, 255);
  int16_t right = constrain(cmd.D2, 0, 255);
  motorDriver->setMotors(left, right);
  
  JsonProtocol::sendOk(cmd.H);
  return true;
}

