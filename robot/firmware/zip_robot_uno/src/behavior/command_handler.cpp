/*
 * Command Handler Implementation
 * 
 * LEGACY CODE - DISABLED
 * This file is kept as a stub for compilation compatibility.
 * The binary protocol and ArduinoJson have been removed for RAM savings.
 * All command handling now uses the JSON text protocol in main.cpp.
 */

#include "behavior/command_handler.h"
// ArduinoJson REMOVED - using lightweight fixed-field scanner instead

// Global instances (will be initialized in main)
extern MotorDriverTB6612 motorDriver;
extern ServoPan servoPan;
extern StatusLED statusLED;

CommandHandler::CommandHandler()
  : motorDriver(nullptr)
  , servoPan(nullptr)
  , statusLED(nullptr)
  , currentMode(MODE_STANDBY)
  , eStopActive(false)
  , lastCommandTime(0)
{
}

void CommandHandler::init(MotorDriverTB6612* motor, ServoPan* servo, StatusLED* led) {
  motorDriver = motor;
  servoPan = servo;
  statusLED = led;
}

// STUB - Binary protocol disabled
void CommandHandler::handleMessage(const DecodedMessage& msg) {
  (void)msg;  // Unused - binary protocol removed
}

void CommandHandler::emergencyStop() {
  eStopActive = true;
  // motorDriver->brake() removed - legacy code disabled
}

void CommandHandler::update() {
  // Mode behaviors disabled
}

void CommandHandler::sendTELEMETRY() {
  // Telemetry disabled
}

// All private methods stubbed out - not used
void CommandHandler::handleHello(const DecodedMessage& msg) { (void)msg; }
void CommandHandler::handleSetMode(const DecodedMessage& msg) { (void)msg; }
void CommandHandler::handleDriveTwist(const DecodedMessage& msg) { (void)msg; }
void CommandHandler::handleDriveTank(const DecodedMessage& msg) { (void)msg; }
void CommandHandler::handleServo(const DecodedMessage& msg) { (void)msg; }
void CommandHandler::handleLED(const DecodedMessage& msg) { (void)msg; }
void CommandHandler::handleEStop(const DecodedMessage& msg) { (void)msg; }
void CommandHandler::handleConfigSet(const DecodedMessage& msg) { (void)msg; }
void CommandHandler::sendACK(uint8_t seq, bool ok, uint8_t errorCode) { (void)seq; (void)ok; (void)errorCode; }
void CommandHandler::sendINFO() {}
void CommandHandler::sendFAULT(uint8_t faultCode, const char* detail) { (void)faultCode; (void)detail; }
void CommandHandler::updateManualMode() {}
void CommandHandler::updateLineFollowMode() {}
void CommandHandler::updateObstacleAvoidMode() {}
void CommandHandler::updateFollowMode() {}
