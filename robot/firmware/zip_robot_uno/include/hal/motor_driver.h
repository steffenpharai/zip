/*
 * Motor Driver HAL - Compatibility Header
 * 
 * This header provides the motor driver interface for ZIP Robot firmware.
 * The actual implementation is in motor_tb6612.h/.cpp for
 * ELEGOO SmartCar Shield v1.1 with TB6612FNG motor driver IC.
 * 
 * Hardware: ELEGOO UNO R3 + SmartCar-Shield-v1.1 (TB6612FNG V1_20230201)
 */

#ifndef MOTOR_DRIVER_H
#define MOTOR_DRIVER_H

// Include the TB6612FNG driver implementation
#include "motor_tb6612.h"

// MotorDriverTB6612 is now the canonical class name
// No typedef needed - code should use MotorDriverTB6612 directly

#endif // MOTOR_DRIVER_H
