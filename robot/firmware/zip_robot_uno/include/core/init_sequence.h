/*
 * Init Sequence
 * 
 * Deterministic hardware initialization routine executed at boot.
 * Non-blocking state machine that validates sensors, IMU, and drivetrain
 * without requiring wheel encoders.
 */

#ifndef INIT_SEQUENCE_H
#define INIT_SEQUENCE_H

#include <Arduino.h>

// ============================================================================
// INIT SEQUENCE TIMING (milliseconds)
// ============================================================================

#define INIT_STEP_STBY_MS         20    // STBY pin setup
#define INIT_STEP_SERVO_MS        350   // Servo center (attach/write/detach)
#define INIT_STEP_SENSOR_MS       100   // Sensor smoke tests
#define INIT_STEP_MOTOR_MS        150   // Motor pulse duration
#define INIT_STEP_PAUSE_MS        200   // Pause between motor tests
#define INIT_STEP_SPIN_MS         150   // Spin test duration

// Total expected time: ~1.7 seconds

// ============================================================================
// INIT STATE ENUMS
// ============================================================================

// Overall init state (for diagnostics)
enum InitState : uint8_t {
  INIT_PENDING  = 0,  // Not yet started
  INIT_RUNNING  = 1,  // Currently executing
  INIT_DONE     = 2,  // Completed successfully
  INIT_WARN     = 3   // Completed with warnings
};

// Internal state machine steps
enum InitStep : uint8_t {
  STEP_IDLE = 0,        // Not running
  STEP_STBY_SETUP,      // Set STBY low then high
  STEP_SERVO_CENTER,    // Center pan servo
  STEP_SENSOR_CHECK,    // Battery, ultrasonic, line sensor reads
  STEP_MOTOR_FWD,       // Forward pulse both wheels
  STEP_PAUSE_1,         // Pause, sample IMU baseline
  STEP_MOTOR_REV,       // Reverse pulse both wheels
  STEP_PAUSE_2,         // Pause
  STEP_SPIN_L,          // Spin left (L=-PWM, R=+PWM)
  STEP_PAUSE_3,         // Pause
  STEP_SPIN_R,          // Spin right (L=+PWM, R=-PWM)
  STEP_COMPLETE         // Finalize and report
};

// ============================================================================
// WARNING BIT FLAGS
// ============================================================================

#define WARN_NONE           0x00
#define WARN_BATT_LOW       0x01  // Battery below OK threshold
#define WARN_BATT_CRIT      0x02  // Battery critical
#define WARN_IMU_MISSING    0x04  // IMU not detected at boot
#define WARN_IMU_NO_MOTION  0x08  // IMU didn't detect spin motion
#define WARN_ULTRA_MISSING  0x10  // Ultrasonic returned 0/invalid
#define WARN_SERVO_SKIP     0x20  // Servo step skipped (low battery)

// ============================================================================
// INIT SEQUENCE CLASS
// ============================================================================

class InitSequence {
public:
  InitSequence();
  
  // Initialize (call once in setup, before starting)
  void init();
  
  // Start the init sequence (call after all HAL init)
  void start();
  
  // Update state machine (call from task_control_loop at 50Hz)
  // Returns true while sequence is running
  bool update();
  
  // Request re-run (for N=130 command)
  void requestRerun();
  
  // Abort sequence (for N=201 stop preemption)
  void abort();
  
  // ---- Getters for diagnostics ----
  
  InitState getState() const { return state; }
  uint8_t getWarnBits() const { return warnBits; }
  bool isRunning() const { return (currentStep != STEP_IDLE); }
  bool isDone() const { return (state == INIT_DONE || state == INIT_WARN); }
  
  // IMU yaw delta observed during spins (degrees * 10, e.g., 120 = 12.0°)
  int16_t getYawDelta() const { return yawDelta; }
  
private:
  // Current state
  InitState state;
  InitStep currentStep;
  uint8_t warnBits;
  
  // Timing
  uint32_t stepStartTime;
  
  // IMU tracking for motion correlation
  int16_t yawBeforeSpin;    // Yaw * 10 before spin tests
  int16_t yawAfterSpinL;    // Yaw * 10 after spin left
  int16_t yawDelta;         // Total yaw change * 10
  
  // Sensor readings during init
  uint16_t initBatteryMv;
  uint16_t initUltrasonicCm;
  
  // ---- Step handlers ----
  
  void enterStep(InitStep step);
  void handleStbySetup();
  void handleServoCenter();
  void handleSensorCheck();
  void handleMotorFwd();
  void handlePause1();
  void handleMotorRev();
  void handlePause2();
  void handleSpinL();
  void handlePause3();
  void handleSpinR();
  void handleComplete();
  
  // Helpers
  void setMotors(int16_t left, int16_t right);
  void stopMotors();
  uint8_t getInitPwm() const;  // Returns PWM based on battery state
  void printInitStatus();
};

// Global instance (declared in init_sequence.cpp)
extern InitSequence initSequence;

#endif // INIT_SEQUENCE_H

