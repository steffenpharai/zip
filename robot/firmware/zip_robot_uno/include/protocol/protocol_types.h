/*
 * Protocol Message Types
 */

#ifndef PROTOCOL_TYPES_H
#define PROTOCOL_TYPES_H

// Message types (Host → Robot)
#define MSG_TYPE_HELLO 0x01
#define MSG_TYPE_SET_MODE 0x02
#define MSG_TYPE_DRIVE_TWIST 0x03
#define MSG_TYPE_DRIVE_TANK 0x04
#define MSG_TYPE_SERVO 0x05
#define MSG_TYPE_LED 0x06
#define MSG_TYPE_E_STOP 0x07
#define MSG_TYPE_CONFIG_SET 0x08

// Message types (Robot → Host)
#define MSG_TYPE_INFO 0x81
#define MSG_TYPE_ACK 0x82
#define MSG_TYPE_TELEMETRY 0x83
#define MSG_TYPE_FAULT 0x84

// Protocol frame structure
#define PROTOCOL_HEADER_0 0xAA
#define PROTOCOL_HEADER_1 0x55

// Protocol limits - use value from config.h
#ifndef PROTOCOL_MAX_PAYLOAD_SIZE
#define PROTOCOL_MAX_PAYLOAD_SIZE 32
#endif
#define PROTOCOL_MAX_LEN (2 + PROTOCOL_MAX_PAYLOAD_SIZE)  // TYPE(1) + SEQ(1) + PAYLOAD

#endif // PROTOCOL_TYPES_H

