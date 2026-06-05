/*
 * Init Sequence Implementation
 * 
 * Non-blocking state machine for hardware validation at boot.
 */

#include "../../include/core/init_sequence.h"
#include "../../include/board/board_elegoo_uno_smartcar_shield_v11.h"
#include "../../include/motion/drive_safety_layer.h"
#include "../../include/hal/battery_monitor.h"
#include "../../include/hal/ultrasonic.h"
#include "../../include/hal/line_sensor.h"
#include "../../include/hal/imu_mpu6050.h"
#include "../../include/hal/servo_pan.h"

// External HAL instances (from main.cpp)
extern BatteryMonitor batteryMonitor;
extern UltrasonicHC_SR04 ultrasonic;
extern LineSensorITR20001 lineSensor;
extern IMU_MPU6050 imu;
extern ServoPan servoPan;
extern bool g_imuInitialized;

// Global instance
InitSequence initSequence;

InitSequence::InitSequence()
  : state(INIT_PENDING)
  , currentStep(STEP_IDLE)
  , warnBits(WARN_NONE)
  , stepStartTime(0)
  , yawBeforeSpin(0)
  , yawAfterSpinL(0)
  , yawDelta(0)
  , initBatteryMv(0)
  , initUltrasonicCm(0)
{
}

void InitSequence::init() {
  state = INIT_PENDING;
  currentStep = STEP_IDLE;
  warnBits = WARN_NONE;
  stepStartTime = 0;
  yawBeforeSpin = 0;
  yawAfterSpinL = 0;
  yawDelta = 0;
  initBatteryMv = 0;
  initUltrasonicCm = 0;
}

void InitSequence::start() {
  if (state == INIT_RUNNING) {
    return;  // Already running
  }
  
  state = INIT_RUNNING;
  warnBits = WARN_NONE;
  enterStep(STEP_STBY_SETUP);
}

void InitSequence::requestRerun() {
  // Stop motors first
  stopMotors();
  
  // Reset state
  init();
  
  // Start fresh
  start();
}

void InitSequence::abort() {
  stopMotors();
  currentStep = STEP_IDLE;
  
  // Keep current state/warnings if we completed, otherwise mark as pending
  if (state == INIT_RUNNING) {
    state = INIT_PENDING;
  }
}

bool InitSequence::update() {
  if (currentStep == STEP_IDLE) {
    return false;  // Not running
  }
  
  uint32_t elapsed = millis() - stepStartTime;
  
  switch (currentStep) {
    case STEP_STBY_SETUP:
      handleStbySetup();
      if (elapsed >= INIT_STEP_STBY_MS) {
        enterStep(STEP_SERVO_CENTER);
      }
      break;
      
    case STEP_SERVO_CENTER:
      handleServoCenter();
      if (elapsed >= INIT_STEP_SERVO_MS) {
        enterStep(STEP_SENSOR_CHECK);
      }
      break;
      
    case STEP_SENSOR_CHECK:
      handleSensorCheck();
      if (elapsed >= INIT_STEP_SENSOR_MS) {
        enterStep(STEP_MOTOR_FWD);
      }
      break;
      
    case STEP_MOTOR_FWD:
      handleMotorFwd();
      if (elapsed >= INIT_STEP_MOTOR_MS) {
        enterStep(STEP_PAUSE_1);
      }
      break;
      
    case STEP_PAUSE_1:
      handlePause1();
      if (elapsed >= INIT_STEP_PAUSE_MS) {
        enterStep(STEP_MOTOR_REV);
      }
      break;
      
    case STEP_MOTOR_REV:
      handleMotorRev();
      if (elapsed >= INIT_STEP_MOTOR_MS) {
        enterStep(STEP_PAUSE_2);
      }
      break;
      
    case STEP_PAUSE_2:
      handlePause2();
      if (elapsed >= INIT_STEP_PAUSE_MS) {
        // Skip spins if battery is critical
        if (warnBits & WARN_BATT_CRIT) {
          enterStep(STEP_COMPLETE);
        } else {
          enterStep(STEP_SPIN_L);
        }
      }
      break;
      
    case STEP_SPIN_L:
      handleSpinL();
      if (elapsed >= INIT_STEP_SPIN_MS) {
        enterStep(STEP_PAUSE_3);
      }
      break;
      
    case STEP_PAUSE_3:
      handlePause3();
      if (elapsed >= INIT_STEP_PAUSE_MS) {
        enterStep(STEP_SPIN_R);
      }
      break;
      
    case STEP_SPIN_R:
      handleSpinR();
      if (elapsed >= INIT_STEP_SPIN_MS) {
        enterStep(STEP_COMPLETE);
      }
      break;
      
    case STEP_COMPLETE:
      handleComplete();
      currentStep = STEP_IDLE;
      return false;  // Done
      
    default:
      currentStep = STEP_IDLE;
      return false;
  }
  
  return true;  // Still running
}

void InitSequence::enterStep(InitStep step) {
  currentStep = step;
  stepStartTime = millis();
}

void InitSequence::handleStbySetup() {
  // Ensure STBY is properly initialized
  // Start with LOW (disabled) then set HIGH (enabled)
  static bool stbyToggled = false;
  
  uint32_t elapsed = millis() - stepStartTime;
  
  if (!stbyToggled && elapsed < 10) {
    digitalWrite(PIN_MOTOR_STBY, LOW);
  } else if (!stbyToggled && elapsed >= 10) {
    digitalWrite(PIN_MOTOR_STBY, HIGH);
    stbyToggled = true;
  }
}

void InitSequence::handleServoCenter() {
  // Non-blocking servo center - only do this once at step entry
  static bool servoCentered = false;
  
  if (!servoCentered && (millis() - stepStartTime) < 50) {
    // Check battery - skip servo if critical to save power
    if (!(warnBits & WARN_BATT_CRIT)) {
      servoPan.setAngle(SERVO_ANGLE_CENTER);
      servoCentered = true;
    } else {
      warnBits |= WARN_SERVO_SKIP;
      servoCentered = true;
    }
  }
}

void InitSequence::handleSensorCheck() {
  // Only read once at step entry
  static bool sensorsRead = false;
  
  if (!sensorsRead) {
    // Battery
    batteryMonitor.update();
    initBatteryMv = (uint16_t)(batteryMonitor.readVoltage() * 1000);
    driveSafety.updateBatteryState(initBatteryMv);
    
    // Set battery warning bits
    if (initBatteryMv < BATT_THRESH_LOW_MV) {
      warnBits |= WARN_BATT_CRIT;
    } else if (initBatteryMv < BATT_THRESH_OK_MV) {
      warnBits |= WARN_BATT_LOW;
    }
    
    // Ultrasonic
    initUltrasonicCm = ultrasonic.getDistance();
    if (initUltrasonicCm == 0 || initUltrasonicCm > 400) {
      warnBits |= WARN_ULTRA_MISSING;
    }
    
    // Line sensors (just read to verify they work)
    lineSensor.readAll(nullptr, nullptr, nullptr);
    
    // IMU status
    if (!g_imuInitialized) {
      warnBits |= WARN_IMU_MISSING;
    }
    
    sensorsRead = true;
  }
}

void InitSequence::handleMotorFwd() {
  // Forward pulse - both wheels forward
  uint8_t pwm = getInitPwm();
  setMotors(pwm, pwm);
}

void InitSequence::handlePause1() {
  // Stop motors and sample IMU baseline
  static bool baselineSampled = false;
  
  stopMotors();
  
  if (!baselineSampled && g_imuInitialized) {
    imu.update();
    yawBeforeSpin = (int16_t)(imu.getYaw() * 10);  // Store as yaw * 10
    baselineSampled = true;
  }
}

void InitSequence::handleMotorRev() {
  // Reverse pulse - both wheels backward
  uint8_t pwm = getInitPwm();
  setMotors(-pwm, -pwm);
}

void InitSequence::handlePause2() {
  stopMotors();
}

void InitSequence::handleSpinL() {
  // Spin left: left wheel backward, right wheel forward
  uint8_t pwm = getInitPwm();
  setMotors(-pwm, pwm);
}

void InitSequence::handlePause3() {
  // Stop and sample IMU after spin left
  static bool afterLSampled = false;
  
  stopMotors();
  
  if (!afterLSampled && g_imuInitialized) {
    imu.update();
    yawAfterSpinL = (int16_t)(imu.getYaw() * 10);
    afterLSampled = true;
  }
}

void InitSequence::handleSpinR() {
  // Spin right: left wheel forward, right wheel backward
  uint8_t pwm = getInitPwm();
  setMotors(pwm, -pwm);
}

void InitSequence::handleComplete() {
  // Stop motors FIRST
  stopMotors();
  
  // Set final state
  state = INIT_DONE;
  
  // Reset safety layer slew state
  driveSafety.resetSlew();
  
  // Print status
  printInitStatus();
}

void InitSequence::setMotors(int16_t left, int16_t right) {
  // Apply safety layer limits
  driveSafety.applyLimits(&left, &right);
  
  // Enable motor driver
  digitalWrite(PIN_MOTOR_STBY, HIGH);
  
  // Apply to motors using TB6612 direction logic
  // Left motor (Motor B)
  if (left > 0) {
    digitalWrite(PIN_MOTOR_BIN_1, HIGH);
    analogWrite(PIN_MOTOR_PWMB, left);
  } else if (left < 0) {
    digitalWrite(PIN_MOTOR_BIN_1, LOW);
    analogWrite(PIN_MOTOR_PWMB, -left);
  } else {
    analogWrite(PIN_MOTOR_PWMB, 0);
  }
  
  // Right motor (Motor A)
  if (right > 0) {
    digitalWrite(PIN_MOTOR_AIN_1, HIGH);
    analogWrite(PIN_MOTOR_PWMA, right);
  } else if (right < 0) {
    digitalWrite(PIN_MOTOR_AIN_1, LOW);
    analogWrite(PIN_MOTOR_PWMA, -right);
  } else {
    analogWrite(PIN_MOTOR_PWMA, 0);
  }
}

void InitSequence::stopMotors() {
  analogWrite(PIN_MOTOR_PWMA, 0);
  analogWrite(PIN_MOTOR_PWMB, 0);
  driveSafety.resetSlew();
}

uint8_t InitSequence::getInitPwm() const {
  // Return appropriate PWM based on battery state
  if (warnBits & (WARN_BATT_CRIT | WARN_BATT_LOW)) {
    return INIT_MOTOR_PWM_LOW_BATT;
  }
  return INIT_MOTOR_PWM;
}

void InitSequence::printInitStatus() {
  // Print compact init status line
  // Format: INIT:<done/warn> batt=<mV> imu=<0/1> yaw=<d> [!warnings]
  
  if (Serial.availableForWrite() < 50) {
    return;  // Not enough buffer space
  }
  
  Serial.print(F("INIT:"));
  Serial.print((state == INIT_DONE) ? F("done") : F("warn"));
  
  Serial.print(F(" batt="));
  Serial.print(initBatteryMv);
  
  Serial.print(F(" imu="));
  Serial.print(g_imuInitialized ? '1' : '0');
  
  Serial.print(F(" yaw="));
  Serial.print(yawDelta / 10);  // Print as whole degrees
  
  // Print warning flags if any
  if (warnBits & WARN_BATT_LOW) Serial.print(F(" !batt"));
  if (warnBits & WARN_BATT_CRIT) Serial.print(F(" !batt_crit"));
  if (warnBits & WARN_IMU_MISSING) Serial.print(F(" !imu"));
  if (warnBits & WARN_IMU_NO_MOTION) Serial.print(F(" !imu_motion"));
  if (warnBits & WARN_ULTRA_MISSING) Serial.print(F(" !ultra"));
  if (warnBits & WARN_SERVO_SKIP) Serial.print(F(" !servo"));
  
  Serial.println();
}

