/*
 * Protocol Decoder Implementation
 */

#include "protocol/protocol_decode.h"
#include "protocol/crc16.h"
#include "protocol/protocol_types.h"

ProtocolDecoder::ProtocolDecoder()
  : state(STATE_WAIT_HEADER_0)
  , bufferPos(0)
  , expectedLen(0)
  , expectedPayloadLen(0)
{
  message.valid = false;
}

bool ProtocolDecoder::processByte(uint8_t byte) {
  // Frame synchronization: if we see 0xAA while not waiting for header, reset and start new frame
  // This allows commands to interrupt telemetry frames
  if (byte == PROTOCOL_HEADER_0) {
    if (state != STATE_WAIT_HEADER_0) {
      // Serial.print(F("[DEC] Reset from state="));
      // Serial.println((uint8_t)state);
      reset();
    }
    // Now handle the 0xAA byte (we're in WAIT_HEADER_0 state after reset)
    buffer[0] = byte;
    bufferPos = 1;
    state = STATE_WAIT_HEADER_1;
    // Serial.println(F("[DEC] Header0 -> Header1"));
    return false;
  }
  
  switch (state) {
    case STATE_WAIT_HEADER_0:
      // Only non-0xAA bytes reach here
      break;
      
    case STATE_WAIT_HEADER_1:
      if (byte == PROTOCOL_HEADER_1) {
        buffer[1] = byte;
        bufferPos = 2;
        state = STATE_WAIT_LEN;
        // Serial.println(F("[DEC] Header1 -> Len"));
      } else {
        // Serial.print(F("[DEC] Invalid header1: 0x"));
        // Serial.println(byte, HEX);
        reset();  // Invalid header
      }
      break;
      
    case STATE_WAIT_LEN:
      expectedLen = byte;
      // LEN = TYPE(1) + SEQ(1) + PAYLOAD_LEN
      // Min: 2 (TYPE + SEQ, no payload)
      // Max: PROTOCOL_MAX_LEN (TYPE + SEQ + max payload)
      if (expectedLen < 2 || expectedLen > PROTOCOL_MAX_LEN) {
        // Serial.print(F("[DEC] Invalid len: "));
        // Serial.println(expectedLen);
        reset();
        break;
      }
      buffer[2] = byte;
      bufferPos = 3;
      expectedPayloadLen = expectedLen - 2;  // TYPE + SEQ
      state = STATE_WAIT_TYPE;
      // Serial.print(F("[DEC] Len="));
      // Serial.print(expectedLen);
      // Serial.print(F(", payloadLen="));
      // Serial.println(expectedPayloadLen);
      break;
      
    case STATE_WAIT_TYPE:
      message.type = byte;
      buffer[bufferPos++] = byte;
      state = STATE_WAIT_SEQ;
      // Serial.print(F("[DEC] Type=0x"));
      // Serial.println(byte, HEX);
      break;
      
    case STATE_WAIT_SEQ:
      message.seq = byte;
      buffer[bufferPos++] = byte;
      // Serial.print(F("[DEC] Seq="));
      // Serial.println(byte);
      if (expectedPayloadLen > 0) {
        state = STATE_WAIT_PAYLOAD;
        message.payloadLen = 0;
        // Serial.println(F("[DEC] -> Payload"));
      } else {
        state = STATE_WAIT_CRC_0;
        // Serial.println(F("[DEC] -> CRC0"));
      }
      break;
      
    case STATE_WAIT_PAYLOAD:
      if (message.payloadLen < sizeof(message.payload)) {
        message.payload[message.payloadLen++] = byte;
      }
      buffer[bufferPos++] = byte;
      
      if (message.payloadLen >= expectedPayloadLen) {
        state = STATE_WAIT_CRC_0;
        //         // Serial.print(F("[DEC] Payload complete ("));
        // Serial.print(message.payloadLen);
        // Serial.println(F(") -> CRC0"));
      }
      break;
      
    case STATE_WAIT_CRC_0:
      buffer[bufferPos++] = byte;
      state = STATE_WAIT_CRC_1;
      break;
      
    case STATE_WAIT_CRC_1:
      buffer[bufferPos++] = byte;
      
      // Validate frame
      if (validateFrame()) {
        message.valid = true;
        //         // Serial.print(F("[DEC] Frame valid! type=0x"));
        // Serial.print(message.type, HEX);
        // Serial.print(F(", seq="));
        // Serial.println(message.seq);
        // Don't reset here - let getMessage() retrieve the message first
        // Reset will happen in getMessage() after copying
        return true;  // Frame decoded
      } else {
        // Serial.println(F("[DEC] CRC validation FAILED"));
        reset();  // Invalid CRC
      }
      break;
  }
  
  // Check for buffer overflow
  if (bufferPos >= sizeof(buffer)) {
    // Serial.println(F("[DEC] Buffer overflow!"));
    reset();
    return false;
  }
  
  return false;
}

bool ProtocolDecoder::validateFrame() {
  // Calculate CRC16 over LEN..PAYLOAD (everything after header)
  // Frame: [HEADER(2)][LEN(1)][TYPE(1)][SEQ(1)][PAYLOAD...][CRC16(2)]
  // CRC covers: LEN + TYPE + SEQ + PAYLOAD
  
  uint8_t dataLen = expectedLen + 1;  // LEN + TYPE + SEQ + PAYLOAD
  uint16_t calculatedCRC = CRC16::calculate(&buffer[2], dataLen);
  
  // Extract received CRC (little-endian)
  uint16_t receivedCRC = buffer[bufferPos - 2] | (buffer[bufferPos - 1] << 8);
  
  if (calculatedCRC != receivedCRC) {
    Serial.print(F("[CRC] FAIL: calc=0x"));
    Serial.print(calculatedCRC, HEX);
    Serial.print(F(", recv=0x"));
    Serial.print(receivedCRC, HEX);
    Serial.print(F(", dataLen="));
    Serial.print(dataLen);
    Serial.print(F(", bufferPos="));
    Serial.println(bufferPos);
    
    // Print buffer for debugging
    Serial.print(F("[CRC] Buffer: "));
    for (uint8_t i = 0; i < bufferPos && i < 20; i++) {
      Serial.print(F("0x"));
      if (buffer[i] < 0x10) Serial.print(F("0"));
      Serial.print(buffer[i], HEX);
      Serial.print(F(" "));
    }
    Serial.println();
  }
  
  return calculatedCRC == receivedCRC;
}

bool ProtocolDecoder::getMessage(DecodedMessage* msg) {
  if (!message.valid) {
    // Serial.println(F("[DEC] getMessage: message not valid"));
    return false;
  }
  
  *msg = message;
  message.valid = false;  // Consume message
  reset();  // Reset decoder state for next frame
  // Serial.println(F("[DEC] getMessage: message copied, decoder reset"));
  return true;
}

void ProtocolDecoder::reset() {
  state = STATE_WAIT_HEADER_0;
  bufferPos = 0;
  expectedLen = 0;
  expectedPayloadLen = 0;
  message.valid = false;
}

