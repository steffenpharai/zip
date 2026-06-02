/*
 * Protocol Encoder Implementation
 */

#include "protocol/protocol_encode.h"
#include "protocol/crc16.h"

ProtocolEncoder::ProtocolEncoder()
  : nextSeq(1)
{
}

uint8_t ProtocolEncoder::encode(uint8_t type, uint8_t seq, const uint8_t* payload, uint8_t payloadLen, uint8_t* buffer, uint8_t bufferSize) {
  // Frame structure: [0xAA 0x55][LEN][TYPE][SEQ][PAYLOAD...][CRC16]
  // LEN = TYPE(1) + SEQ(1) + PAYLOAD_LEN
  
  uint8_t len = 1 + 1 + payloadLen;  // TYPE + SEQ + PAYLOAD
  uint8_t frameSize = 2 + 1 + len + 2;  // HEADER(2) + LEN(1) + DATA + CRC16(2)
  
  if (frameSize > bufferSize) {
    return 0;  // Buffer too small
  }
  
  uint8_t pos = 0;
  
  // Header
  buffer[pos++] = PROTOCOL_HEADER_0;
  buffer[pos++] = PROTOCOL_HEADER_1;
  
  // Length
  buffer[pos++] = len;
  
  // Type and Seq
  buffer[pos++] = type;
  buffer[pos++] = seq;
  
  // Payload
  for (uint8_t i = 0; i < payloadLen; i++) {
    buffer[pos++] = payload[i];
  }
  
  // Calculate CRC16 over LEN..PAYLOAD
  uint16_t crc = CRC16::calculate(&buffer[2], len + 1);  // LEN + TYPE + SEQ + PAYLOAD
  
  // Append CRC16 (little-endian)
  buffer[pos++] = crc & 0xFF;
  buffer[pos++] = (crc >> 8) & 0xFF;
  
  return pos;
}

uint8_t ProtocolEncoder::getNextSeq() {
  uint8_t seq = nextSeq;
  nextSeq++;
  if (nextSeq == 0) {
    nextSeq = 1;  // Skip 0
  }
  return seq;
}

