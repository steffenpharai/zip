/*
 * IMU Implementation - MPU6050
 */

#include "hal/imu_mpu6050.h"

IMU_MPU6050::IMU_MPU6050()
  : initialized(false)
  , accelX(0), accelY(0), accelZ(0)
  , gyroX(0), gyroY(0), gyroZ(0)
  , gyroOffsetX(0), gyroOffsetY(0), gyroOffsetZ(0)
  , yaw(0)  // Changed from 0.0 to 0 (int16_t, stored as yaw * 10)
  , lastUpdateTime(0)
{
}

bool IMU_MPU6050::init() {
  Wire.begin();
  
  // Add timeout protection - if I2C bus is locked, this will fail quickly
  unsigned long startTime = millis();
  const unsigned long timeoutMs = 500;  // 500ms timeout for I2C operations
  
  // Wake up MPU6050 (clear sleep bit)
  writeRegister(MPU6050_REG_PWR_MGMT_1, 0x00);
  delay(100);
  
  // Check timeout
  if (millis() - startTime > timeoutMs) {
    return false;  // Timeout during init
  }
  
  // Verify communication with timeout check
  uint8_t whoami = readRegister(0x75);  // WHO_AM_I register
  
  // Check if readRegister returned valid data (0xFF indicates no data received)
  if (whoami == 0xFF || (millis() - startTime > timeoutMs)) {
    return false;  // Wrong device or timeout
  }
  
  if (whoami != 0x68) {
    return false;  // Wrong device ID
  }
  
  // Calibrate gyro (with timeout protection)
  unsigned long calStartTime = millis();
  calibrate();
  if (millis() - calStartTime > 2000) {  // Calibration should take < 2 seconds
    return false;  // Calibration timeout
  }
  
  lastUpdateTime = millis();
  initialized = true;
  
  return true;
}

void IMU_MPU6050::writeRegister(uint8_t reg, uint8_t value) {
  Wire.beginTransmission(MPU6050_ADDR);
  Wire.write(reg);
  Wire.write(value);
  Wire.endTransmission();
}

uint8_t IMU_MPU6050::readRegister(uint8_t reg) {
  Wire.beginTransmission(MPU6050_ADDR);
  Wire.write(reg);
  uint8_t error = Wire.endTransmission(false);
  if (error != 0) {
    return 0xFF;  // I2C error
  }
  
  uint8_t bytesReceived = Wire.requestFrom((int)MPU6050_ADDR, (int)1);
  if (bytesReceived == 0) {
    return 0xFF;  // No data received
  }
  
  return Wire.read();
}

void IMU_MPU6050::readRegisters(uint8_t reg, uint8_t* data, uint8_t len) {
  Wire.beginTransmission(MPU6050_ADDR);
  Wire.write(reg);
  Wire.endTransmission(false);
  Wire.requestFrom((int)MPU6050_ADDR, (int)len);
  
  for (uint8_t i = 0; i < len; i++) {
    data[i] = Wire.read();
  }
}

void IMU_MPU6050::readRaw(int16_t* ax, int16_t* ay, int16_t* az,
                          int16_t* gx, int16_t* gy, int16_t* gz) {
  if (!initialized) {
    // Return zeros if IMU not initialized
    *ax = *ay = *az = 0;
    *gx = *gy = *gz = 0;
    return;
  }
  uint8_t data[14];
  readRegisters(MPU6050_REG_ACCEL_XOUT_H, data, 14);
  
  // Accelerometer (2's complement, 16-bit)
  *ax = (int16_t)((data[0] << 8) | data[1]);
  *ay = (int16_t)((data[2] << 8) | data[3]);
  *az = (int16_t)((data[4] << 8) | data[5]);
  
  // Gyroscope (2's complement, 16-bit)
  *gx = (int16_t)((data[8] << 8) | data[9]) - gyroOffsetX;
  *gy = (int16_t)((data[10] << 8) | data[11]) - gyroOffsetY;
  *gz = (int16_t)((data[12] << 8) | data[13]) - gyroOffsetZ;
}

void IMU_MPU6050::calibrate() {
  // Calibrate gyro offset (assume robot is stationary)
  // Reduced samples from 100 to 50 to save RAM
  const uint8_t samples = 50;  // Changed from uint16_t to uint8_t, reduced count
  int32_t sumX = 0, sumY = 0, sumZ = 0;
  
  for (uint8_t i = 0; i < samples; i++) {  // Changed from uint16_t to uint8_t
    uint8_t data[6];
    readRegisters(MPU6050_REG_GYRO_XOUT_H, data, 6);
    
    sumX += (int16_t)((data[0] << 8) | data[1]);
    sumY += (int16_t)((data[2] << 8) | data[3]);
    sumZ += (int16_t)((data[4] << 8) | data[5]);
    delay(10);
  }
  
  gyroOffsetX = sumX / samples;
  gyroOffsetY = sumY / samples;
  gyroOffsetZ = sumZ / samples;
}

void IMU_MPU6050::update() {
  if (!initialized) {
    return;  // Skip if IMU not initialized
  }
  readRaw(&accelX, &accelY, &accelZ, &gyroX, &gyroY, &gyroZ);
  updateYaw();
}

void IMU_MPU6050::updateYaw() {
  unsigned long now = millis();
  if (lastUpdateTime == 0) {
    lastUpdateTime = now;
    return;
  }
  
  float dt = (now - lastUpdateTime) / 1000.0;  // Convert to seconds
  lastUpdateTime = now;
  
  // Complementary filter for yaw
  // Gyro Z rate (degrees per second)
  // MPU6050 default: ±250°/s range, 131 LSB/(°/s)
  float gyroZRate = gyroZ / 131.0;
  
  // Integrate gyro (yaw stored as int16_t * 10, so multiply by 10)
  int16_t yawValue = yaw;  // yaw is stored as yaw * 10
  yawValue += (int16_t)(gyroZRate * dt * 10.0);
  
  // Normalize to -1800 to 1800 (representing -180.0 to 180.0 degrees)
  while (yawValue > 1800) yawValue -= 3600;
  while (yawValue < -1800) yawValue += 3600;
  
  yaw = yawValue;
}

float IMU_MPU6050::getYaw() {
  return yaw / 10.0;  // Convert from int16_t (yaw * 10) to degrees
}

