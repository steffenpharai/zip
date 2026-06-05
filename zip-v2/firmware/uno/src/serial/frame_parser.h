/*
 * JSON Frame Parser
 * 
 * Lightweight parser for ELEGOO-style JSON commands.
 * Uses fixed-field scanner instead of ArduinoJson (saves 96+ bytes RAM).
 * 
 * Official ELEGOO protocol terminates JSON on '}' character.
 * Binary protocol (0xAA 0x55) has been REMOVED for RAM savings.
 */

#ifndef FRAME_PARSER_H
#define FRAME_PARSER_H

#include <Arduino.h>

// Diagnostic counters (shared with main for N=120 stats)
struct ParseStats {
  uint16_t rx_overflow;       // Ring buffer overflows
  uint16_t json_dropped_long; // JSON lines exceeding max length
  uint16_t parse_errors;      // JSON parse failures
  uint16_t reserved;          // Reserved (was binary_crc_fail)
  uint16_t tx_dropped;        // TX responses dropped (buffer full)
  uint32_t last_cmd_ms;       // Timestamp of last valid command
};

extern ParseStats g_parseStats;

struct ParsedCommand {
  int N;              // Command number
  char H[8];          // Command serial number/header (8 chars max)
  int D1;             // Data 1
  int D2;             // Data 2
  int D3;             // Data 3
  int D4;             // Data 4
  unsigned long T;    // Timer/TTL (milliseconds)
  bool valid;         // True if command was successfully parsed
};

class FrameParser {
public:
  FrameParser();
  
  // Process incoming byte, returns true if a complete frame was parsed
  // JSON only - binary protocol removed for RAM savings
  bool processByte(uint8_t byte);
  
  // Get the last parsed command (if valid)
  bool getCommand(ParsedCommand& cmd);
  
  // Reset parser state (call after handling command or on error)
  void reset();
  
private:
  // Ring buffer for RX data (minimal for RAM-constrained UNO)
  static const size_t RING_SIZE = 32;  // Power of 2 for efficient modulo
  static const size_t MAX_JSON_LINE = 64;  // Max JSON line length
  
  enum State {
    STATE_IDLE,          // Waiting for start character '{'
    STATE_JSON_READING,  // Reading JSON content
    STATE_JSON_COMPLETE  // JSON frame complete, ready to parse
  };
  
  // Ring buffer (kept for potential future use, but not actively used)
  uint8_t ring[RING_SIZE];
  volatile uint8_t head;  // Write position
  volatile uint8_t tail;  // Read position
  
  // JSON frame accumulator
  char jsonBuffer[MAX_JSON_LINE + 1];
  size_t jsonPos;
  
  State state;
  ParsedCommand lastCommand;
  
  // Ring buffer helpers
  bool ringPush(uint8_t byte);
  bool ringPop(uint8_t& byte);
  uint8_t ringAvailable() const;
  void ringClear();
  
  // JSON parsing (uses lightweight fixed-field scanner)
  bool parseJson();
  void resyncToNewline();
};

#endif // FRAME_PARSER_H
