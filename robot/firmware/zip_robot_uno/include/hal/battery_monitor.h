/*
 * Battery Monitor HAL
 * 
 * Voltage detection with low-voltage alarm
 */

#ifndef BATTERY_MONITOR_H
#define BATTERY_MONITOR_H

#include <Arduino.h>
#include "../pins.h"
#include "../config.h"

class BatteryMonitor {
public:
  BatteryMonitor();
  
  void init();
  
  // Read voltage
  float readVoltage();  // Returns voltage in volts
  
  // Low battery detection (with hysteresis)
  bool isLowBattery() const { return lowBattery; }
  bool isCriticalBattery() const { return criticalBattery; }
  
  // Update (call from slow task)
  void update();
  
private:
  uint16_t voltage_mv;  // Changed from float to uint16_t (voltage in millivolts) to save 2 bytes
  bool lowBattery;
  bool criticalBattery;
  
  // Hysteresis thresholds
  static const float LOW_THRESHOLD;
  static const float LOW_THRESHOLD_HYST;
  static const float CRITICAL_THRESHOLD;
  
  float adcToVoltage(uint16_t adc);
};

#endif // BATTERY_MONITOR_H

