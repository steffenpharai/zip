/*
 * Protocol Encoder
 * 
 * Constructs binary frames for transmission
 */

#ifndef PROTOCOL_ENCODE_H
#define PROTOCOL_ENCODE_H

#include <Arduino.h>
#include "protocol_types.h"

class ProtocolEncoder {
public:
  ProtocolEncoder();
  
  // Encode a message into a frame
  // Returns number of bytes written, or 0 on error
  uint8_t encode(uint8_t type, uint8_t seq, const uint8_t* payload, uint8_t payloadLen, uint8_t* buffer, uint8_t bufferSize);
  
  // Get next sequence number
  uint8_t getNextSeq();
  
private:
  uint8_t nextSeq;
};

#endif // PROTOCOL_ENCODE_H

