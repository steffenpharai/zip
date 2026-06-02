/*
 * Board Configuration - ELEGOO UNO R3 + SmartCar Shield v1.1 (TB6612FNG)
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 * AUTHORITATIVE BOARD HEADER - Single source of truth for all hardware pins.
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * This firmware is LOCKED to the following verified hardware stack:
 * 
 *   MCU:    ELEGOO UNO R3 (silkscreen: "ELEGOO UNO R3 Car V2.0") - ATmega328P
 *   Shield: ELEGOO SmartCar-Shield-v1.1 (silkscreen visible)
 *   Motor:  TB6612FNG dual H-bridge (kit version V1_20230201)
 *   IMU:    MPU6050 @ I2C 0x68
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 * VERIFIED FROM SHIELD SILKSCREEN LABELS (DO NOT CHANGE WITHOUT PHOTOS)
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Ultrasonic Header:    "+5V 13 12 GND"
 *   => PIN_ULTRASONIC_TRIG = D13, PIN_ULTRASONIC_ECHO = D12
 * 
 * Servo Header:         "GND +5V 10"
 *   => PIN_SERVO_Z = D10 (pan servo signal)
 * 
 * Line Tracking Header: "GND +5V A2 A1 A0"
 *   => PIN_LINE_L = A2, PIN_LINE_M = A1, PIN_LINE_R = A0
 * 
 * Power Input Header:   "GND / Vin"
 *   => Battery feeds VIN; PIN_VOLTAGE = A3 (via divider)
 * 
 * Mode Button:          D2 (INT0 capable)
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 */

#ifndef BOARD_ELEGOO_UNO_SMARTCAR_SHIELD_V11_H
#define BOARD_ELEGOO_UNO_SMARTCAR_SHIELD_V11_H

#include <Arduino.h>

// ============================================================================
// COMPILE-TIME MCU GUARD - Fail fast if wrong target
// ============================================================================
#if !defined(ARDUINO_AVR_UNO) && !defined(__AVR_ATmega328P__)
  #error "This firmware requires Arduino UNO (ATmega328P). Check platformio.ini board setting."
#endif

// ============================================================================
// HARDWARE PROFILE IDENTIFICATION
// ============================================================================
// Full profile string for boot/diagnostics
#define HARDWARE_PROFILE "ELEGOO UNO R3 Car V2.0 + SmartCar-Shield-v1.1 (TB6612FNG V1_20230201)"

// Short hash for compact diagnostics (8 chars max)
// Derived from: ELegoo shield V1.1 TB6612
#define HARDWARE_PROFILE_HASH "ELGV11TB"

// Firmware version
#define FW_VERSION_MAJOR 2
#define FW_VERSION_MINOR 8
#define FW_VERSION_PATCH 0
#define FW_VERSION_STRING "2.8.0"

// ============================================================================
// MOTOR DRIVER - TB6612FNG (Toshiba dual H-bridge)
// ============================================================================
// Official ELEGOO pin mapping from DeviceDriverSet_xxx0.h (V1_20230201)
// Motor A = Right motor, Motor B = Left motor
//
// CRITICAL: TB6612FNG has STBY pin that MUST be HIGH to enable motor output!
// This is the key difference from DRV8835 which has no standby control.

#define PIN_MOTOR_PWMA    5   // Right motor PWM (Timer0, OC0B)
#define PIN_MOTOR_PWMB    6   // Left motor PWM (Timer0, OC0A)
#define PIN_MOTOR_AIN_1   7   // Right motor direction
#define PIN_MOTOR_BIN_1   8   // Left motor direction
#define PIN_MOTOR_STBY    3   // STANDBY pin - MUST be HIGH to enable motors!

// TB6612 Direction Logic (from official ELEGOO code V1_20230201):
//   Motor A (Right): Forward = AIN_1 HIGH, Reverse = AIN_1 LOW
//   Motor B (Left):  Forward = BIN_1 HIGH, Reverse = BIN_1 LOW
// Note: Both motors use SAME direction logic (HIGH=forward)

// Legacy pin name aliases for compatibility
#define PIN_MOTOR_AIN1    PIN_MOTOR_AIN_1
#define PIN_MOTOR_BIN1    PIN_MOTOR_BIN_1

// ============================================================================
// SERVO MOTORS
// ============================================================================
// Silkscreen: "GND +5V 10" - Servo signal on rightmost pin
#define PIN_SERVO_Z       10  // Camera gimbal Z-axis (horizontal pan)
#define PIN_SERVO_Y       11  // Camera gimbal Y-axis (vertical tilt) - optional

// ============================================================================
// ULTRASONIC SENSOR (HC-SR04)
// ============================================================================
// Silkscreen: "+5V 13 12 GND"
// Pin order left-to-right: +5V, Trig(13), Echo(12), GND
#define PIN_ULTRASONIC_TRIG  13
#define PIN_ULTRASONIC_ECHO  12

// ============================================================================
// LINE TRACKING SENSORS (ITR20001/T reflective optical sensors)
// ============================================================================
// Silkscreen: "GND +5V A2 A1 A0"
// Pin order: GND, +5V, Left(A2), Middle(A1), Right(A0)
#define PIN_LINE_L        A2  // Left sensor (analog)
#define PIN_LINE_M        A1  // Middle sensor (analog)
#define PIN_LINE_R        A0  // Right sensor (analog)

// ============================================================================
// BATTERY VOLTAGE MONITORING
// ============================================================================
// Power header silkscreen: "GND / Vin"
// Voltage divider on A3: (10kΩ + 1.5kΩ) / 1.5kΩ = 7.67 ratio
#define PIN_VOLTAGE       A3  // Voltage divider ADC input

// ============================================================================
// I2C BUS (MPU6050 IMU)
// ============================================================================
// Standard Arduino UNO I2C pins (hardware I2C via Wire library)
#define PIN_I2C_SDA       A4
#define PIN_I2C_SCL       A5

// MPU6050 IMU address (GY-521 module, AD0 pin LOW)
#define MPU6050_I2C_ADDR  0x68

// ============================================================================
// RGB LED (WS2812 / NeoPixel) - DISABLED for RAM savings
// ============================================================================
#define PIN_RGB_LED       4
#define NUM_LEDS          1

// ============================================================================
// IR RECEIVER - Not used in ZIP firmware
// ============================================================================
#define PIN_IR_RECEIVER   9

// ============================================================================
// MODE BUTTON
// ============================================================================
#define PIN_MODE_BUTTON   2   // Hardware interrupt capable (INT0)

// ============================================================================
// MOTOR CONSTANTS
// ============================================================================
#define MOTOR_PWM_MAX           255
#define MOTOR_PWM_MIN           0
#define MOTOR_PWM_DEADBAND      10    // Minimum PWM to overcome static friction
#define MOTOR_RAMP_RATE_MAX     255   // Max PWM change per update (255 = no ramping)
#define MOTOR_KICKSTART_PWM     80    // Brief pulse PWM to overcome static friction
#define MOTOR_KICKSTART_MS      20    // Kickstart pulse duration

// ============================================================================
// DRIVE SAFETY LAYER CONSTANTS
// ============================================================================
// Battery state thresholds (millivolts)
// These can be overridden in config.h or at compile time
#ifndef BATT_THRESH_OK_MV
#define BATT_THRESH_OK_MV       7400  // >= this is OK state
#endif
#ifndef BATT_THRESH_LOW_MV
#define BATT_THRESH_LOW_MV      7000  // >= this and < OK is LOW state; < this is CRIT
#endif

// PWM deadband per wheel (minimum PWM to overcome static friction under load)
// Determined via drive_calibrate.js tool - these are conservative defaults
#ifndef PWM_DEADBAND_L_DEFAULT
#define PWM_DEADBAND_L_DEFAULT  55    // Left wheel deadband
#endif
#ifndef PWM_DEADBAND_R_DEFAULT
#define PWM_DEADBAND_R_DEFAULT  55    // Right wheel deadband
#endif

// Slew rate limits (PWM units per 50Hz tick = per 20ms)
// Asymmetric: acceleration slower than deceleration for safety
// OK battery state
#ifndef RAMP_ACCEL_STEP_OK
#define RAMP_ACCEL_STEP_OK      12    // ~600 PWM/sec acceleration
#endif
#ifndef RAMP_DECEL_STEP_OK
#define RAMP_DECEL_STEP_OK      20    // ~1000 PWM/sec deceleration
#endif

// LOW battery state (gentler to prevent brownouts)
#ifndef RAMP_ACCEL_STEP_LOW
#define RAMP_ACCEL_STEP_LOW     6     // ~300 PWM/sec acceleration
#endif
#ifndef RAMP_DECEL_STEP_LOW
#define RAMP_DECEL_STEP_LOW     15    // ~750 PWM/sec deceleration
#endif

// CRIT battery state (very gentle)
#ifndef RAMP_ACCEL_STEP_CRIT
#define RAMP_ACCEL_STEP_CRIT    4     // ~200 PWM/sec acceleration
#endif
#ifndef RAMP_DECEL_STEP_CRIT
#define RAMP_DECEL_STEP_CRIT    10    // ~500 PWM/sec deceleration
#endif

// PWM caps by battery state
#ifndef PWM_CAP_OK
#define PWM_CAP_OK              255   // Full power when battery OK
#endif
#ifndef PWM_CAP_LOW
#define PWM_CAP_LOW             180   // Reduced power when battery low
#endif
#ifndef PWM_CAP_CRIT
#define PWM_CAP_CRIT            100   // Minimal power when battery critical
#endif

// Kickstart pulse configuration
#ifndef KICKSTART_DURATION_TICKS
#define KICKSTART_DURATION_TICKS 4    // 80ms at 50Hz control loop
#endif
#ifndef KICKSTART_BOOST
#define KICKSTART_BOOST         25    // PWM added to deadband during kickstart
#endif

// Init sequence motor test PWM
#ifndef INIT_MOTOR_PWM
#define INIT_MOTOR_PWM          80    // PWM for init motor direction tests
#endif
#ifndef INIT_MOTOR_PWM_LOW_BATT
#define INIT_MOTOR_PWM_LOW_BATT 60    // Reduced PWM when battery is low
#endif

// ============================================================================
// SERVO CONSTANTS
// ============================================================================
#define SERVO_ANGLE_MIN         0
#define SERVO_ANGLE_MAX         180
#define SERVO_ANGLE_CENTER      90
#define SERVO_PULSE_MIN_US      500   // 0 degrees (official ELEGOO calibration)
#define SERVO_PULSE_MAX_US      2400  // 180 degrees (official ELEGOO calibration)

// ============================================================================
// ULTRASONIC CONSTANTS
// ============================================================================
#define ULTRASONIC_MAX_DISTANCE_CM  200
#define ULTRASONIC_MIN_DISTANCE_CM  2
#define ULTRASONIC_TIMEOUT_US       30000  // 30ms timeout (~5m max)

// ============================================================================
// LINE SENSOR CONSTANTS
// ============================================================================
#define LINE_SENSOR_ADC_MAX             1023
#define LINE_SENSOR_THRESHOLD_DEFAULT   512

// ============================================================================
// BATTERY CONSTANTS (Official ELEGOO: 2x 18650 Li-ion pack)
// ============================================================================
#define BATTERY_VOLTAGE_MIN       6.0   // Minimum safe voltage (V)
#define BATTERY_VOLTAGE_MAX       8.4   // Maximum voltage (V) - fully charged
#define BATTERY_VOLTAGE_LOW       7.0   // Low battery warning threshold (V)
#define BATTERY_ADC_SCALE         0.0049  // 5V / 1024 = 0.0049V per ADC step
// Voltage divider: (10kΩ + 1.5kΩ) / 1.5kΩ = 7.67
#define BATTERY_DIVIDER_RATIO     7.67

// ============================================================================
// TASK TIMING CONSTANTS
// ============================================================================
#define TASK_CONTROL_LOOP_MS      20    // 50Hz control loop
#define TASK_SENSORS_SLOW_MS      100   // 10Hz slow sensors (ultrasonic, battery, IMU)
#define TASK_SENSORS_FAST_MS      20    // 50Hz fast sensors (reserved)

// ============================================================================
// COMPILE-TIME PIN VALIDATION
// ============================================================================

// Verify PWM pins are actually PWM-capable on Arduino UNO
// UNO PWM pins: 3, 5, 6, 9, 10, 11
#if PIN_MOTOR_PWMA != 5 && PIN_MOTOR_PWMA != 6 && PIN_MOTOR_PWMA != 9 && \
    PIN_MOTOR_PWMA != 10 && PIN_MOTOR_PWMA != 11 && PIN_MOTOR_PWMA != 3
  #error "PIN_MOTOR_PWMA must be a PWM-capable pin (3, 5, 6, 9, 10, 11)"
#endif

#if PIN_MOTOR_PWMB != 5 && PIN_MOTOR_PWMB != 6 && PIN_MOTOR_PWMB != 9 && \
    PIN_MOTOR_PWMB != 10 && PIN_MOTOR_PWMB != 11 && PIN_MOTOR_PWMB != 3
  #error "PIN_MOTOR_PWMB must be a PWM-capable pin (3, 5, 6, 9, 10, 11)"
#endif

// Verify servo pin is PWM-capable
#if PIN_SERVO_Z != 5 && PIN_SERVO_Z != 6 && PIN_SERVO_Z != 9 && \
    PIN_SERVO_Z != 10 && PIN_SERVO_Z != 11 && PIN_SERVO_Z != 3
  #error "PIN_SERVO_Z must be a PWM-capable pin (3, 5, 6, 9, 10, 11)"
#endif

// Verify no pin conflicts between motor PWM and direction
#if PIN_MOTOR_PWMA == PIN_MOTOR_AIN_1
  #error "Motor A PWM and direction pins must be different"
#endif

#if PIN_MOTOR_PWMB == PIN_MOTOR_BIN_1
  #error "Motor B PWM and direction pins must be different"
#endif

// Verify STBY pin is defined and valid
#if PIN_MOTOR_STBY != 3
  #error "TB6612FNG STBY pin must be D3 on this shield"
#endif

// ============================================================================
// PIN MAPPING SUMMARY TABLE
// ============================================================================
/*
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ PIN MAPPING - ELEGOO SmartCar Shield v1.1 (TB6612FNG)                    │
 * ├──────────────┬─────────┬─────────────────────────────────────────────────┤
 * │ Function     │ Pin     │ Notes                                           │
 * ├──────────────┼─────────┼─────────────────────────────────────────────────┤
 * │ Motor A PWM  │ D5      │ Right motor speed (Timer0 OC0B)                 │
 * │ Motor B PWM  │ D6      │ Left motor speed (Timer0 OC0A)                  │
 * │ Motor A Dir  │ D7      │ Right motor direction (HIGH=fwd)                │
 * │ Motor B Dir  │ D8      │ Left motor direction (HIGH=fwd)                 │
 * │ Motor STBY   │ D3      │ TB6612 standby (HIGH=enabled) **CRITICAL**      │
 * ├──────────────┼─────────┼─────────────────────────────────────────────────┤
 * │ Servo Pan    │ D10     │ Silkscreen: "GND +5V 10"                        │
 * │ Servo Tilt   │ D11     │ Optional vertical tilt                          │
 * ├──────────────┼─────────┼─────────────────────────────────────────────────┤
 * │ US Trig      │ D13     │ Silkscreen: "+5V 13 12 GND"                     │
 * │ US Echo      │ D12     │ HC-SR04 echo return                             │
 * ├──────────────┼─────────┼─────────────────────────────────────────────────┤
 * │ Line L       │ A2      │ Silkscreen: "GND +5V A2 A1 A0"                  │
 * │ Line M       │ A1      │ ITR20001 middle sensor                          │
 * │ Line R       │ A0      │ ITR20001 right sensor                           │
 * ├──────────────┼─────────┼─────────────────────────────────────────────────┤
 * │ Battery      │ A3      │ Voltage divider (7.67:1)                        │
 * │ I2C SDA      │ A4      │ MPU6050 data                                    │
 * │ I2C SCL      │ A5      │ MPU6050 clock                                   │
 * ├──────────────┼─────────┼─────────────────────────────────────────────────┤
 * │ Mode Button  │ D2      │ INT0 capable                                    │
 * │ RGB LED      │ D4      │ WS2812 (disabled for RAM)                       │
 * │ IR Receiver  │ D9      │ Not used                                        │
 * └──────────────┴─────────┴─────────────────────────────────────────────────┘
 */

#endif // BOARD_ELEGOO_UNO_SMARTCAR_SHIELD_V11_H

