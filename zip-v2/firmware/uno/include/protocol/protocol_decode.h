/*
 * Protocol Decoder
 * 
 * State machine for frame detection and parsing
 */

#ifndef PROTOCOL_DECODE_H
#define PROTOCOL_DECODE_H

#include <Arduino.h>
#include "protocol_types.h"

// Decoded message structure (minimized for RAM)
struct DecodedMessage {
  uint8_t type;
  uint8_t seq;
  uint8_t payload[32];  // Reduced from 64 to save RAM
  uint8_t payloadLen;
  bool valid;
};

class ProtocolDecoder {
public:
  ProtocolDecoder();
  
  // Process incoming byte
  // Returns true if a complete frame was decoded
  bool processByte(uint8_t byte);
  
  // Get decoded message (if available)
  bool getMessage(DecodedMessage* msg);
  
  // Reset decoder state
  void reset();
  
private:
  enum State {
    STATE_WAIT_HEADER_0,
    STATE_WAIT_HEADER_1,
    STATE_WAIT_LEN,
    STATE_WAIT_TYPE,
    STATE_WAIT_SEQ,
    STATE_WAIT_PAYLOAD,
    STATE_WAIT_CRC_0,
    STATE_WAIT_CRC_1
  };
  
  State state;
  uint8_t buffer[48];   // Reduced from 128 to save RAM (max frame: header+len+type+seq+32+crc = 38)
  uint8_t bufferPos;
  uint8_t expectedLen;
  uint8_t expectedPayloadLen;
  DecodedMessage message;
  
  bool validateFrame();
};

#endif // PROTOCOL_DECODE_H

