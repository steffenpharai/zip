/*
 * CRC16-CCITT Implementation
 * 
 * Standard CRC16 for protocol validation
 */

#ifndef CRC16_H
#define CRC16_H

#include <Arduino.h>

class CRC16 {
public:
  // Calculate CRC16-CCITT
  static uint16_t calculate(const uint8_t* data, uint16_t length);
  
  // Update CRC incrementally
  static uint16_t update(uint16_t crc, uint8_t byte);
  
private:
  static const uint16_t POLYNOMIAL = 0x1021;  // CRC16-CCITT polynomial
  static uint16_t crcTable[256];
  static bool tableInitialized;
  
  static void initTable();
};

#endif // CRC16_H

