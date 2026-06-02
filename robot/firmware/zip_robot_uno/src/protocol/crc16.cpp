/*
 * CRC16 Implementation
 */

#include "protocol/crc16.h"

uint16_t CRC16::crcTable[256];
bool CRC16::tableInitialized = false;

void CRC16::initTable() {
  if (tableInitialized) {
    return;
  }
  
  for (uint16_t i = 0; i < 256; i++) {
    uint16_t crc = i << 8;
    for (uint8_t j = 0; j < 8; j++) {
      if (crc & 0x8000) {
        crc = (crc << 1) ^ POLYNOMIAL;
      } else {
        crc = crc << 1;
      }
    }
    crcTable[i] = crc;
  }
  
  tableInitialized = true;
}

uint16_t CRC16::calculate(const uint8_t* data, uint16_t length) {
  initTable();
  
  uint16_t crc = 0xFFFF;
  
  for (uint16_t i = 0; i < length; i++) {
    crc = update(crc, data[i]);
  }
  
  return crc;
}

uint16_t CRC16::update(uint16_t crc, uint8_t byte) {
  initTable();
  
  uint8_t index = (crc >> 8) ^ byte;
  crc = (crc << 8) ^ crcTable[index];
  
  return crc;
}

