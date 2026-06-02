/*
 * IMU HAL - MPU6050
 * 
 * 6-axis accelerometer/gyroscope
 */

#ifndef IMU_MPU6050_H
#define IMU_MPU6050_H

#include <Arduino.h>
#include <Wire.h>
#include "../pins.h"
#include "../config.h"

// MPU6050 I2C address
#define MPU6050_ADDR 0x68

// MPU6050 registers
#define MPU6050_REG_PWR_MGMT_1 0x6B
#define MPU6050_REG_ACCEL_XOUT_H 0x3B
#define MPU6050_REG_GYRO_XOUT_H 0x43

class IMU_MPU6050 {
public:
  IMU_MPU6050();
  
  bool init();
  
  // Check if IMU is initialized
  bool isInitialized() const { return initialized; }
  
  // Read raw sensor data
  void readRaw(int16_t* accelX, int16_t* accelY, int16_t* accelZ,
               int16_t* gyroX, int16_t* gyroY, int16_t* gyroZ);
  
  // Get fused yaw estimate (complementary filter)
  float getYaw();  // Returns yaw in degrees (converted from int16_t)
  
  // Calibration
  void calibrate();  // Calibrate gyro offset
  
  // Update (call from fast task)
  void update();
  
private:
  bool initialized;  // Track if IMU init succeeded
  // Raw sensor data
  int16_t accelX, accelY, accelZ;
  int16_t gyroX, gyroY, gyroZ;
  
  // Gyro calibration offsets
  int16_t gyroOffsetX, gyroOffsetY, gyroOffsetZ;
  
  // Fused yaw (complementary filter) - using int16_t to save RAM (0.1 degree precision)
  int16_t yaw;  // Changed from float to int16_t (yaw * 10, so 900 = 90.0 degrees)
  unsigned long lastUpdateTime;
  
  // I2C helpers
  void writeRegister(uint8_t reg, uint8_t value);
  uint8_t readRegister(uint8_t reg);
  void readRegisters(uint8_t reg, uint8_t* data, uint8_t len);
  
  // Complementary filter
  void updateYaw();
};

#endif // IMU_MPU6050_H

