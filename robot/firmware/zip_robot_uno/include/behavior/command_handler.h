/*
 * Command Handler
 * 
 * Executes commands from protocol layer
 */

#ifndef COMMAND_HANDLER_H
#define COMMAND_HANDLER_H

#include <Arduino.h>
#include "../protocol/protocol_types.h"
#include "../protocol/protocol_decode.h"

// Forward declarations
class MotorDriverTB6612;
class ServoPan;
class StatusLED;

// Operating modes
enum RobotMode {
  MODE_STANDBY = 0,
  MODE_MANUAL = 1,
  MODE_LINE_FOLLOW = 2,
  MODE_OBSTACLE_AVOID = 3,
  MODE_FOLLOW = 4
};

class CommandHandler {
public:
  CommandHandler();
  
  void init(MotorDriverTB6612* motor, ServoPan* servo, StatusLED* led);
  
  // Process decoded message
  void handleMessage(const DecodedMessage& msg);
  
  // Get current mode
  RobotMode getMode() const { return currentMode; }
  
  // Emergency stop
  void emergencyStop();
  
  // Update (for mode-specific behaviors)
  void update();
  
  // Send telemetry (called from scheduler)
  void sendTELEMETRY();
  
private:
  MotorDriverTB6612* motorDriver;
  ServoPan* servoPan;
  StatusLED* statusLED;
  
  RobotMode currentMode;
  bool eStopActive;
  
  unsigned long lastCommandTime;
  
  // Command handlers
  void handleHello(const DecodedMessage& msg);
  void handleSetMode(const DecodedMessage& msg);
  void handleDriveTwist(const DecodedMessage& msg);
  void handleDriveTank(const DecodedMessage& msg);
  void handleServo(const DecodedMessage& msg);
  void handleLED(const DecodedMessage& msg);
  void handleEStop(const DecodedMessage& msg);
  void handleConfigSet(const DecodedMessage& msg);
  
  // Send ACK
  void sendACK(uint8_t seq, bool ok, uint8_t errorCode = 0);
  void sendINFO();
  void sendFAULT(uint8_t faultCode, const char* detail);
  
  // Mode behaviors (optional assists)
  void updateManualMode();
  void updateLineFollowMode();
  void updateObstacleAvoidMode();
  void updateFollowMode();
};

#endif // COMMAND_HANDLER_H

