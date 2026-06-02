/*
 * Pin Mapping - ELEGOO Smart Robot Car V4.0
 * 
 * This file provides pin definitions for backward compatibility.
 * The authoritative pin definitions are in:
 *   board/board_elegoo_uno_smartcar_shield_v11.h
 * 
 * Hardware: ELEGOO UNO R3 + SmartCar-Shield-v1.1 (TB6612FNG motor driver)
 */

#ifndef PINS_H
#define PINS_H

#include <Arduino.h>

// Include the authoritative board header
#include "board/board_elegoo_uno_smartcar_shield_v11.h"

// ============================================================================
// All pin definitions are now in board/board_elegoo_uno_smartcar_shield_v11.h
// This file exists for backward compatibility with existing code.
// ============================================================================

// Note: The following pin names are defined in the board header:
//
// Motor Driver (TB6612FNG):
//   PIN_MOTOR_PWMA    - Right motor PWM (D5)
//   PIN_MOTOR_PWMB    - Left motor PWM (D6)
//   PIN_MOTOR_AIN_1   - Right motor direction (D7)
//   PIN_MOTOR_BIN_1   - Left motor direction (D8)
//   PIN_MOTOR_STBY    - Standby pin (D3) - MUST be HIGH to enable motors!
//   PIN_MOTOR_AIN1    - Alias for PIN_MOTOR_AIN_1
//   PIN_MOTOR_BIN1    - Alias for PIN_MOTOR_BIN_1
//
// Servos:
//   PIN_SERVO_Z       - Camera pan (D10)
//   PIN_SERVO_Y       - Camera tilt (D11)
//
// Ultrasonic (HC-SR04):
//   PIN_ULTRASONIC_TRIG (D13)
//   PIN_ULTRASONIC_ECHO (D12)
//
// Line Sensors (ITR20001):
//   PIN_LINE_L (A2), PIN_LINE_M (A1), PIN_LINE_R (A0)
//
// Battery:
//   PIN_VOLTAGE (A3)
//
// I2C (MPU6050):
//   PIN_I2C_SDA (A4), PIN_I2C_SCL (A5)
//   MPU6050_I2C_ADDR (0x68)
//
// Other:
//   PIN_RGB_LED (D4), PIN_IR_RECEIVER (D9), PIN_MODE_BUTTON (D2)

// ============================================================================
// Constants are also defined in the board header:
// ============================================================================
//
// Motor Constants:
//   MOTOR_PWM_MAX, MOTOR_PWM_MIN, MOTOR_PWM_DEADBAND
//   MOTOR_RAMP_RATE_MAX, MOTOR_KICKSTART_PWM, MOTOR_KICKSTART_MS
//
// Servo Constants:
//   SERVO_ANGLE_MIN, SERVO_ANGLE_MAX, SERVO_ANGLE_CENTER
//   SERVO_PULSE_MIN_US, SERVO_PULSE_MAX_US
//
// Ultrasonic Constants:
//   ULTRASONIC_MAX_DISTANCE_CM, ULTRASONIC_MIN_DISTANCE_CM, ULTRASONIC_TIMEOUT_US
//
// Line Sensor Constants:
//   LINE_SENSOR_ADC_MAX, LINE_SENSOR_THRESHOLD_DEFAULT
//
// Battery Constants:
//   BATTERY_VOLTAGE_MIN, BATTERY_VOLTAGE_MAX, BATTERY_VOLTAGE_LOW
//   BATTERY_ADC_SCALE, BATTERY_DIVIDER_RATIO

// Legacy constant names (for backward compatibility)
#ifndef MOTOR_DEADBAND
#define MOTOR_DEADBAND MOTOR_PWM_DEADBAND
#endif

#endif // PINS_H
