/*
 * Line Sensor HAL - ITR20001 (3-channel analog)
 */

#ifndef LINE_SENSOR_H
#define LINE_SENSOR_H

#include <Arduino.h>
#include "../pins.h"
#include "../config.h"

class LineSensorITR20001 {
public:
  LineSensorITR20001();
  
  void init();
  
  // Read raw ADC values
  uint16_t readLeft() const;
  uint16_t readMiddle() const;
  uint16_t readRight() const;
  void readAll(uint16_t* left, uint16_t* middle, uint16_t* right) const;
  
  // Calibration
  void calibrate();  // Run calibration routine
  void setThreshold(uint16_t threshold);
  uint16_t getThreshold() const { return threshold; }
  
  // Threshold-based detection
  bool isLineDetected() const;
  bool isLineLeft() const;
  bool isLineMiddle() const;
  bool isLineRight() const;
  
  // Get calibrated values (0-1023)
  uint16_t getCalibratedLeft() const;
  uint16_t getCalibratedMiddle() const;
  uint16_t getCalibratedRight() const;
  
private:
  uint16_t threshold;
  uint16_t baselineLeft;
  uint16_t baselineMiddle;
  uint16_t baselineRight;
  bool calibrated;
  
  void readBaseline();
};

#endif // LINE_SENSOR_H

