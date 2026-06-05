/*
 * IR Receiver HAL
 * 
 * Captures last IR code and timestamp
 */

#ifndef IR_RECEIVER_H
#define IR_RECEIVER_H

#include <Arduino.h>
#include "../pins.h"
#include "../config.h"

class IRReceiver {
public:
  IRReceiver();
  
  void init();
  
  // Get last received code
  uint32_t getLastCode() const { return lastCode; }
  
  // Get timestamp of last code
  unsigned long getLastCodeTime() const { return lastCodeTime; }
  
  // Check if new code received
  bool hasNewCode() const;
  
  // Update (call from slow task or interrupt)
  void update();
  
private:
  uint32_t lastCode;
  unsigned long lastCodeTime;
  bool newCodeFlag;
  
  // Simple IR decoding (can be enhanced with IRremote library if memory allows)
  uint32_t decodeIR();
};

#endif // IR_RECEIVER_H

