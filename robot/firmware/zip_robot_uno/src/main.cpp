/*
 * ZIP Robot Firmware - Main Entry Point
 * 
 * ELEGOO UNO R3 + SmartCar-Shield-v1.1 (TB6612FNG)
 * Arduino UNO Platform (ATmega328P)
 * 
 * ═══════════════════════════════════════════════════════════════════
 * VERIFIED CONFIGURATION (January 2026) - v2.7.0
 * ═══════════════════════════════════════════════════════════════════
 * Hardware: ELEGOO UNO R3 Car V2.0 + SmartCar-Shield-v1.1 (TB6612FNG V1_20230201)
 * 
 * RAM:   ~57% (estimated ~1170/2048 bytes) - Good (servo works!)
 * Flash: ~55% (estimated)
 * 
 * ENABLED SUBSYSTEMS:
 *   ✅ motorDriver      - TB6612FNG motor control (STBY on D3)
 *   ✅ batteryMonitor   - ADC battery voltage (10Hz read)
 *   ✅ servoPan         - Pan servo (Servo library)
 *   ✅ ultrasonic       - HC-SR04 distance (10Hz read)
 *   ✅ lineSensor       - 3x IR line detect (10Hz read)
 *   ✅ modeButton       - Digital input
 *   ✅ imu              - MPU6050 gyro/accel (10Hz polling)
 *   ✅ motionController - Setpoint tracking
 *   ✅ macroEngine      - Motion macros
 *   ✅ safetyLayer      - Safety checks
 * 
 * DISABLED SUBSYSTEMS (RAM constraints):
 *   ❌ statusLED        - FastLED uses ~100 bytes RAM
 *   ❌ commandHandler   - Legacy ELEGOO runtime (removed)
 * 
 * SCHEDULER TASKS:
 *   task_control_loop  - 50 Hz (motion + macros)
 *   task_sensors_fast  - 50 Hz (reserved)
 *   task_sensors_slow  - 10 Hz (ultrasonic, battery, line, IMU)
 *   task_protocol_rx   - 1 kHz (serial command parsing)
 * 
 * COMMANDS SUPPORTED:
 *   N=0     Hello/ping
 *   N=5     Servo control
 *   N=21    Ultrasonic read
 *   N=22    Line sensor read
 *   N=23    Battery voltage
 *   N=120   Diagnostics (includes IMU status, HW profile)
 *   N=200   Setpoint streaming (fire-and-forget)
 *   N=201   Stop (immediate)
 *   N=210   Macro start
 *   N=211   Macro cancel
 *   N=999   Direct motor PWM
 * ═══════════════════════════════════════════════════════════════════
 */

#include <Arduino.h>
#include <avr/wdt.h>

// Configuration (includes board header)
#include "config.h"
#include "pins.h"

// HAL/Drivers
#include "hal/motor_driver.h"
#include "hal/servo_pan.h"
#include "hal/ultrasonic.h"
#include "hal/line_sensor.h"
#include "hal/imu_mpu6050.h"
#include "hal/battery_monitor.h"
#include "hal/status_led.h"
#include "hal/mode_button.h"

// Core
#include "core/scheduler.h"

// Motion Control
#include "motion_types.h"
#include "motion/motion_controller.h"
#include "motion/macro_engine.h"
#include "motion/safety.h"
#include "motion/drive_safety_layer.h"
#include "serial/frame_parser.h"
#include "serial/json_protocol.h"

// Core
#include "core/init_sequence.h"

// Self-test
#include "self_test.h"

// Global instances
MotorDriverTB6612 motorDriver;
ServoPan servoPan;
UltrasonicHC_SR04 ultrasonic;
LineSensorITR20001 lineSensor;
IMU_MPU6050 imu;
BatteryMonitor batteryMonitor;
StatusLED statusLED;
ModeButton modeButton;

Scheduler scheduler;

// Motion Control instances
MotionController motionController;
MacroEngine macroEngine;
SafetyLayer safetyLayer;
FrameParser jsonFrameParser;

// Forward declarations
void handleMotionCommand(const ParsedCommand& cmd);
void handleLegacyCommand(const ParsedCommand& cmd);
void hardwareValidation();

// Store direct motor values for continuous re-application in DIRECT mode
static int16_t directLeftPWM = 0;
static int16_t directRightPWM = 0;

// Motion ownership tracking for diagnostics (N=120)
static uint8_t g_resetCounter = 0;
static char g_lastOwner = 'I';  // I=Idle, D=Direct, M=Motion, X=Stopped

// IMU initialization status (non-static for access from init_sequence)
bool g_imuInitialized = false;

// Boot-time battery voltage (mV)
static uint16_t g_bootBatteryMv = 0;

// Runtime free RAM measurement (AVR classic pattern)
// Returns bytes between stack and heap - should never go below ~150 on UNO
extern unsigned int __bss_end;
extern unsigned int __heap_start;
extern void *__brkval;

static int16_t g_minFreeRam = 32767;  // Track minimum observed free RAM

int freeRam() {
  int v;
  return (int)&v - (__brkval == 0 ? (int)&__heap_start : (int)__brkval);
}

// Call this at critical points to track minimum headroom
void updateMinFreeRam() {
  int current = freeRam();
  if (current < g_minFreeRam) {
    g_minFreeRam = current;
  }
}

// ============================================================================
// Boot-time Hardware Validation (fast, non-blocking)
// ============================================================================
// Runs once in setup() after IMU init. Validates hardware and prints status.
// Does NOT block on errors - just warns. Robot will still attempt to run.

void hardwareValidation() {
  // 1. Read battery voltage
  batteryMonitor.update();
  float voltage = batteryMonitor.readVoltage();
  g_bootBatteryMv = (uint16_t)(voltage * 1000);
  
  // 2. Warn if battery voltage is out of expected range (6.0V - 8.5V)
  bool batteryOk = (voltage >= 6.0f && voltage <= 8.5f);
  
  // 3. Attempt one ultrasonic read (timeout protected via HAL)
  uint16_t usDist = ultrasonic.getDistance();
  bool usOk = (usDist > 0 && usDist < 400);  // Plausible range check
  
  // 4. Print single boot status line (compact)
  // Format: HW:<hash> imu=<0/1> batt=<mV> [warnings]
  if (Serial.availableForWrite() >= 40) {
    Serial.print(F("HW:"));
    Serial.print(F(HARDWARE_PROFILE_HASH));
    Serial.print(F(" imu="));
    Serial.print(g_imuInitialized ? '1' : '0');
    Serial.print(F(" batt="));
    Serial.print(g_bootBatteryMv);
    
    // Print warnings if any
    if (!batteryOk) {
      Serial.print(F(" !batt"));
    }
    if (!usOk) {
      Serial.print(F(" !us"));
    }
    
    Serial.println();
  }
  
  wdt_reset();
}

// Task: Control loop (50Hz)
void task_control_loop() {
  // Run init sequence state machine if active
  if (initSequence.isRunning()) {
    initSequence.update();
    return;  // Don't run normal motion control during init
  }
  
  // Only update motion controller for N=200 commands (but skip if DIRECT mode)
  if (motionController.getState() != MOTION_STATE_DIRECT) {
    motionController.update();
  }
  
  // macroEngine.update() for macro support
  macroEngine.update();
}

// Task: Fast sensors (50Hz)
void task_sensors_fast() {
  // Reserved for high-frequency sensor reads if needed
}

// Task: Slow sensors (10Hz)
void task_sensors_slow() {
  // Read sensors (results cached in drivers)
  ultrasonic.getDistance();
  batteryMonitor.update();
  lineSensor.readAll(nullptr, nullptr, nullptr);  // Cache line sensor values
  
  // Update drive safety layer with current battery voltage
  uint16_t voltage_mv = (uint16_t)(batteryMonitor.readVoltage() * 1000);
  driveSafety.updateBatteryState(voltage_mv);
  
  // Update IMU at 10Hz (non-blocking I2C read)
  if (g_imuInitialized) {
    imu.update();
  }
}

// Task: Protocol RX (continuous, 1ms interval)
// Single RX pipeline with deterministic parsing
void task_protocol_rx() {
  wdt_reset();
  
  // Flush any pending TX response
  JsonProtocol::flushPending();
  
  // Limit bytes per call to prevent blocking
  uint8_t bytesProcessed = 0;
  const uint8_t MAX_BYTES_PER_CALL = 48;  // Process up to 48 bytes per iteration
  unsigned long taskStartTime = millis();
  const unsigned long MAX_TASK_TIME_MS = 5;
  
  while (Serial.available() > 0 && bytesProcessed < MAX_BYTES_PER_CALL) {
    // Safety: Ensure task doesn't run too long
    if (millis() - taskStartTime > MAX_TASK_TIME_MS) {
      wdt_reset();
      break;
    }
    
    uint8_t byte = Serial.read();
    bytesProcessed++;
    
    // Reset watchdog every 8 bytes
    if ((bytesProcessed & 0x07) == 0) {
      wdt_reset();
    }
    
    // Binary protocol (0xAA 0x55) REMOVED - JSON only for RAM savings
    // If we receive binary header, just skip it
    if (byte == 0xAA || byte == 0x55) {
      continue;  // Ignore legacy binary protocol bytes
    }
    
    // JSON protocol - use frame parser
    if (jsonFrameParser.processByte(byte)) {
      ParsedCommand cmd;
      if (jsonFrameParser.getCommand(cmd)) {
        // Reset parser after getting command
        jsonFrameParser.reset();
        wdt_reset();
        
        // Route command based on N value
        if (cmd.N == 0) {
          // N=0: Hello handshake
          JsonProtocol::sendHelloOk();
        } else if (cmd.N == 5) {
          // N=5: Servo control - D1 is angle (0-180)
          // Probe RAM before servo.attach() - known stack-heavy path
          updateMinFreeRam();
          uint8_t angle = constrain(cmd.D1, 0, 180);
          servoPan.setAngle(angle);
          updateMinFreeRam();  // Probe after servo path
          JsonProtocol::sendOk(cmd.H);
        } else if (cmd.N == 120) {
          // N=120: Diagnostics - compact debug state + HW + RAM + IMU + safety layer + init
          // Format: {owner,lpwm,rpwm,mstate,reset,hw:<hash>,imu:<0/1>,ram:<free>,min:<min>,
          //          batt:<mV>,b:<state>,cap:<max>,db:<L>/<R>,ramp:<a>/<d>,kick:<0/1>,init:<state>}
          updateMinFreeRam();  // Probe at diagnostics path
          if (Serial.availableForWrite() >= 100) {
            uint16_t voltage_mv = (uint16_t)(batteryMonitor.readVoltage() * 1000);
            Serial.print(F("{"));
            Serial.print(g_lastOwner);
            Serial.print(directLeftPWM);
            Serial.print(',');
            Serial.print(directRightPWM);
            Serial.print(',');
            Serial.print((uint8_t)motionController.getState());
            Serial.print(',');
            Serial.print(g_resetCounter);
            Serial.print(F(",hw:"));
            Serial.print(F(HARDWARE_PROFILE_HASH));
            Serial.print(F(",imu:"));
            Serial.print(g_imuInitialized ? 1 : 0);
            Serial.print(F(",ram:"));
            Serial.print(freeRam());
            Serial.print(F(",min:"));
            Serial.print(g_minFreeRam);
            // Safety layer fields
            Serial.print(F(",batt:"));
            Serial.print(voltage_mv);
            Serial.print(F(",b:"));
            Serial.print((uint8_t)driveSafety.getBatteryState());
            Serial.print(F(",cap:"));
            Serial.print(driveSafety.getEffectiveMaxPwm());
            Serial.print(F(",db:"));
            Serial.print(driveSafety.getDeadbandL());
            Serial.print('/');
            Serial.print(driveSafety.getDeadbandR());
            Serial.print(F(",ramp:"));
            Serial.print(driveSafety.getEffectiveAccelStep());
            Serial.print('/');
            Serial.print(driveSafety.getEffectiveDecelStep());
            Serial.print(F(",kick:"));
            Serial.print(driveSafety.isKickEnabled() ? 1 : 0);
            // Init sequence state
            Serial.print(F(",init:"));
            Serial.print((uint8_t)initSequence.getState());
            Serial.println('}');
          }
          JsonProtocol::sendStats(g_parseStats);
        } else if (cmd.N == 130) {
          // N=130: Re-run Init Sequence
          // Stops motors, resets state, runs init sequence again
          motionController.stop();
          macroEngine.cancel();
          driveSafety.resetSlew();
          initSequence.requestRerun();
          JsonProtocol::sendOk(cmd.H);
        } else if (cmd.N == 140) {
          // N=140: Set Drive Config
          // D1: parameter selector, D2: value
          // 1=deadband (high=L, low=R), 2=accel step, 3=decel step, 4=kick enable, 5=max PWM cap
          switch (cmd.D1) {
            case 1: {
              // Deadband: D2 high byte = L, low byte = R
              uint8_t dbL = (cmd.D2 >> 8) & 0xFF;
              uint8_t dbR = cmd.D2 & 0xFF;
              if (dbL == 0) dbL = PWM_DEADBAND_L_DEFAULT;
              if (dbR == 0) dbR = PWM_DEADBAND_R_DEFAULT;
              driveSafety.setDeadbandL(dbL);
              driveSafety.setDeadbandR(dbR);
              break;
            }
            case 2:
              // Accel step (0 = use battery-based default)
              if (cmd.D2 == 0) {
                driveSafety.clearAccelOverride();
              } else {
                driveSafety.setAccelStep(constrain(cmd.D2, 1, 50));
              }
              break;
            case 3:
              // Decel step (0 = use battery-based default)
              if (cmd.D2 == 0) {
                driveSafety.clearDecelOverride();
              } else {
                driveSafety.setDecelStep(constrain(cmd.D2, 1, 50));
              }
              break;
            case 4:
              // Kick enable (0/1, 0xFF = use default)
              if (cmd.D2 == 0xFF || cmd.D2 > 1) {
                driveSafety.clearKickOverride();
              } else {
                driveSafety.setKickEnabled(cmd.D2 == 1);
              }
              break;
            case 5:
              // Max PWM cap (0 = use battery-based default)
              if (cmd.D2 == 0) {
                driveSafety.clearMaxPwmOverride();
              } else {
                driveSafety.setMaxPwmCap(constrain(cmd.D2, 50, 255));
              }
              break;
            default:
              break;
          }
          JsonProtocol::sendOk(cmd.H);
        } else if (cmd.N >= 200) {
          // N=200+: Motion commands
          handleMotionCommand(cmd);
        } else if (cmd.N == 100 || cmd.N == 110) {
          // N=100/110: Legacy stop commands - override motion
          motionController.stop();
          macroEngine.cancel();
          motorDriver.stop();
          JsonProtocol::sendOk();
        } else {
          // N=1-199: Legacy ELEGOO commands
          handleLegacyCommand(cmd);
        }
        
        // Break after processing one command
        break;
      }
    }
  }
  
  wdt_reset();
}

// Handle legacy ELEGOO commands (N=1-199)
void handleLegacyCommand(const ParsedCommand& cmd) {
  wdt_reset();
  
  // Handle sensor commands with actual data
  switch (cmd.N) {
    case 21: {
      // N=21: Ultrasonic sensor
      // D1=1: Return obstacle detection (true/false)
      // D1=2: Return distance in cm
      uint16_t distance = ultrasonic.getDistance();
      
      if (cmd.D1 == 1) {
        // Obstacle detection mode (within 20cm)
        if (distance > 0 && distance <= 20) {
          JsonProtocol::sendTrue(cmd.H);
        } else {
          JsonProtocol::sendFalse(cmd.H);
        }
      } else if (cmd.D1 == 2) {
        // Distance mode - return actual cm value
        char valueStr[8];
        snprintf(valueStr, sizeof(valueStr), "%u", distance);
        JsonProtocol::sendValue(cmd.H, valueStr);
      } else {
        JsonProtocol::sendOk(cmd.H);
      }
      return;
    }
    
    case 22: {
      // N=22: Line sensor (tracking module)
      // D1=0: Left sensor value
      // D1=1: Middle sensor value
      // D1=2: Right sensor value
      uint16_t value = 0;
      
      if (cmd.D1 == 0) {
        value = lineSensor.readLeft();
      } else if (cmd.D1 == 1) {
        value = lineSensor.readMiddle();
      } else if (cmd.D1 == 2) {
        value = lineSensor.readRight();
      }
      
      char valueStr[8];
      snprintf(valueStr, sizeof(valueStr), "%u", value);
      JsonProtocol::sendValue(cmd.H, valueStr);
      return;
    }
    
    case 23: {
      // N=23: Battery voltage (ZIP extension)
      // D1=0 (default): Returns voltage in millivolts
      // D1=1: Returns raw ADC value and voltage for diagnostics
      if (cmd.D1 == 1) {
        // Diagnostic mode: show raw ADC + calculated voltage
        uint16_t adc = analogRead(PIN_VOLTAGE);
        uint16_t voltage_mv = (uint16_t)(batteryMonitor.readVoltage() * 1000);
        // Calculate expected A3 pin voltage (mV) = adc / 1023 * 5000
        uint16_t a3_mv = (uint16_t)((adc * 5000UL) / 1023);
        Serial.print(F("{"));
        Serial.print(cmd.H);
        Serial.print(F("_adc:"));
        Serial.print(adc);
        Serial.print(F(",a3_mv:"));
        Serial.print(a3_mv);
        Serial.print(F(",batt_mv:"));
        Serial.print(voltage_mv);
        Serial.println(F("}"));
      } else {
        // Normal mode: just voltage in millivolts
        uint16_t voltage_mv = (uint16_t)(batteryMonitor.readVoltage() * 1000);
        char valueStr[8];
        snprintf(valueStr, sizeof(valueStr), "%u", voltage_mv);
        JsonProtocol::sendValue(cmd.H, valueStr);
      }
      return;
    }
    
    default:
      break;
  }
  
  // Commands 2 and 7 have delayed response in official firmware
  // (they respond after timer expires)
  if (cmd.N == 2 || cmd.N == 7) {
    return;
  }
  
  // All other legacy commands respond with {H_ok}
  if (strlen(cmd.H) > 0) {
    JsonProtocol::sendOk(cmd.H);
  } else {
    JsonProtocol::sendOk();
  }
}

// Handle motion commands (N=200+)
void handleMotionCommand(const ParsedCommand& cmd) {
  wdt_reset();
  
  switch (cmd.N) {
    case 200: {
      // N=200: Drive Setpoint (fire-and-forget, NO RESPONSE)
      // D1: v (forward command -255..255)
      // D2: w (yaw command -255..255)
      // T: TTL (150-300ms)
      
      g_lastOwner = 'M';  // Track motion mode for diagnostics
      
      // Cancel any active macro
      if (macroEngine.isActive()) {
        macroEngine.cancel();
      }
      
      // Enable motors (TB6612FNG requires STBY=HIGH)
      motorDriver.enable();
      
      // Apply setpoint
      motionController.setSetpoint(cmd.D1, cmd.D2, cmd.T);
      wdt_reset();
      
      // NO RESPONSE - fire and forget for streaming
      break;
    }
    
    case 201: {
      // N=201: Stop Now (MUST RESPOND)
      // ABSOLUTE STOP - highest priority, preempts everything
      
      g_lastOwner = 'X';  // Track stopped state for diagnostics
      
      // Clear DIRECT mode values FIRST (prevents control loop re-apply)
      directLeftPWM = 0;
      directRightPWM = 0;
      
      // Update state machines (these no longer touch motor pins)
      motionController.stop();  // Sets state to IDLE
      macroEngine.cancel();     // Sets active to false
      initSequence.abort();     // Abort init if running
      driveSafety.resetSlew();  // Reset safety layer slew state
      
      // SINGLE MOTOR WRITE POINT - only here we touch motor pins for stop
      // TB6612FNG: Set PWM to 0 AND disable STBY
      analogWrite(PIN_MOTOR_PWMA, 0);
      analogWrite(PIN_MOTOR_PWMB, 0);
      digitalWrite(PIN_MOTOR_STBY, LOW);  // Disable motor driver
      
      JsonProtocol::sendOk(cmd.H);
      wdt_reset();
      break;
    }
    
    case 999: {
      // N=999: Direct Motor Test (bypasses motion controller)
      // D1: left PWM (-255..255)
      // D2: right PWM (-255..255)
      // DIRECT MODE - single owner model
      
      g_lastOwner = 'D';  // Track direct mode for diagnostics
      
      // Set motion controller to DIRECT mode so update loop doesn't interfere
      motionController.setDirectMode();
      macroEngine.cancel();  // Safe: no longer touches motor pins
      
      // Apply PWM directly to pins using TB6612FNG direction logic
      int16_t left = constrain(cmd.D1, -255, 255);
      int16_t right = constrain(cmd.D2, -255, 255);
      
#if SAFETY_LAYER_ENABLED && !SAFETY_LAYER_BYPASS_DIRECT
      // Apply safety layer limits (battery-aware cap, ramping, deadband)
      driveSafety.applyLimits(&left, &right);
#endif
      
      // CRITICAL: Enable motor driver (TB6612FNG requires STBY=HIGH)
      digitalWrite(PIN_MOTOR_STBY, HIGH);
      
      // TB6612FNG Direction Logic (from official ELEGOO code V1_20230201):
      // Motor A (Right): Forward = AIN_1 HIGH, Reverse = AIN_1 LOW
      // Motor B (Left):  Forward = BIN_1 HIGH, Reverse = BIN_1 LOW
      
      // Right motor (Motor A: PWMA=5, AIN_1=7)
      if (right > 0) {
        digitalWrite(PIN_MOTOR_AIN_1, HIGH);  // Forward (TB6612: HIGH)
        analogWrite(PIN_MOTOR_PWMA, right);
      } else if (right < 0) {
        digitalWrite(PIN_MOTOR_AIN_1, LOW);   // Reverse (TB6612: LOW)
        analogWrite(PIN_MOTOR_PWMA, -right);
      } else {
        analogWrite(PIN_MOTOR_PWMA, 0);
      }
      
      // Left motor (Motor B: PWMB=6, BIN_1=8)
      if (left > 0) {
        digitalWrite(PIN_MOTOR_BIN_1, HIGH);  // Forward (TB6612: HIGH)
        analogWrite(PIN_MOTOR_PWMB, left);
      } else if (left < 0) {
        digitalWrite(PIN_MOTOR_BIN_1, LOW);   // Reverse (TB6612: LOW)
        analogWrite(PIN_MOTOR_PWMB, -left);
      } else {
        analogWrite(PIN_MOTOR_PWMB, 0);
      }
      
      // Store values for diagnostics (after safety layer applied)
      directLeftPWM = left;
      directRightPWM = right;
      
      JsonProtocol::sendOk(cmd.H);
      wdt_reset();
      break;
    }
    
    case 210: {
      // N=210: Macro Execute (MUST RESPOND)
      // D1: macro_id (1=FIGURE_8, 2=SPIN_360, 3=WIGGLE, 4=FORWARD_THEN_STOP)
      // D2: intensity (0-255)
      // T: TTL (1000-10000ms)
      
      // Probe RAM at macro transition
      updateMinFreeRam();
      
      // Stop any active setpoint
      motionController.stop();
      
      // Enable motors (TB6612FNG requires STBY=HIGH)
      motorDriver.enable();
      
      // Start macro
      MacroID macroId = (MacroID)cmd.D1;
      bool started = macroEngine.startMacro(macroId, cmd.D2, cmd.T);
      
      if (started) {
        JsonProtocol::sendOk(cmd.H);
      } else {
        JsonProtocol::sendFalse(cmd.H);
      }
      wdt_reset();
      break;
    }
    
    case 211: {
      // N=211: Macro Cancel (MUST RESPOND)
      macroEngine.cancel();
      JsonProtocol::sendOk(cmd.H);
      wdt_reset();
      break;
    }
    
    default:
      // Unknown motion command
      JsonProtocol::sendFalse(cmd.H);
      wdt_reset();
      break;
  }
}

void setup() {
  g_resetCounter++;  // Track resets for debugging
  
  // Initialize serial communication
  // NOTE: Using 115200 (not official 9600) for better motion control throughput
  Serial.begin(SERIAL_BAUD);
  
  // Initialize hardware
  motorDriver.init();
  batteryMonitor.init();
  servoPan.init();  // Uses exact ELEGOO pattern with attach/delay/detach
  ultrasonic.init();
  lineSensor.init();
  modeButton.init();
  
  // Initialize IMU (MPU6050 on I2C)
  // This is non-blocking and will set g_imuInitialized based on success
#if defined(IMU_ENABLED) && IMU_ENABLED
  g_imuInitialized = imu.init();
#else
  g_imuInitialized = false;
#endif
  
  // Run boot-time hardware validation (fast, non-blocking)
  // Prints: HW:<hash> imu=<0/1> batt=<mV> [warnings]
  hardwareValidation();
  
  // Initialize motion control system
  motionController.init(&motorDriver);
  macroEngine.init(&motorDriver);
  safetyLayer.init();
  driveSafety.init();
  initSequence.init();
  
  // Initialize scheduler
  scheduler.init();
  
  // Register tasks
  scheduler.registerTask(task_control_loop, 1000 / TASK_CONTROL_LOOP_HZ, "ctrl");
  scheduler.registerTask(task_sensors_fast, 1000 / TASK_SENSORS_FAST_HZ, "sens_f");
  scheduler.registerTask(task_sensors_slow, 1000 / TASK_SENSORS_SLOW_HZ, "sens_s");
  scheduler.registerTask(task_protocol_rx, 1, "rx");
  
  // Enable watchdog (8 seconds)
  wdt_enable(WDTO_8S);
  wdt_reset();
  
  // Start init sequence (runs in task_control_loop, non-blocking)
  initSequence.start();
  
  // Send ready marker: "R\n"
  // Host waits for this after DTR reset
  if (Serial.availableForWrite() >= 2) {
    Serial.write('R');
    Serial.write('\n');
  }
  wdt_reset();
  
  // Status LED disabled (FastLED too heavy)
  // statusLED.setStateIdle();
}

void loop() {
  // Reset watchdog at start of every loop
  wdt_reset();
  
  // Run scheduler
  scheduler.run();
  
  // DISABLED: LED animations use too much stack
  // statusLED.update();
  
  // Flush pending TX responses
  JsonProtocol::flushPending();
  
  wdt_reset();
  
  // Small delay to prevent tight loop
  delay(1);
}
