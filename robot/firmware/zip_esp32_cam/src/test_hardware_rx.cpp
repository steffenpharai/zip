/**
 * Comprehensive RX Pin Detection Test
 * 
 * Tests ALL candidate GPIO pins to find which one receives data from Arduino Uno.
 * Uses GPIO40 as TX (verified) and systematically tests each pin as RX.
 * 
 * VERIFIED FOR: ZIP Robot Uno Firmware v2.7.0
 * - Baud Rate: 115200
 * - Boot Marker: "R\n" (sent on reset)
 * - Hello Command: {"N":0,"H":"hello"} → Response: {hello_ok}
 * - Diagnostics: {"N":120,"H":"diag"} → Response: {stats:...}
 */

#include <Arduino.h>
#include <string.h>

// Known good TX pin (verified)
#define TX_PIN 40
#define BAUD_RATE 115200
#define TEST_DURATION_MS 3000  // Test each pin for 3 seconds
#define COMMAND_INTERVAL_MS 500  // Send command every 500ms during test

// Comprehensive list of GPIO pins to test
int rx_candidates[] = {
  // Core GPIO pins
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
  11, 12, 13, 14, 15, 16, 17, 18,
  // Additional GPIO pins
  19, 20, 21,
  // Higher numbered GPIOs
  33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48
};

int num_candidates = sizeof(rx_candidates) / sizeof(rx_candidates[0]);

// Results tracking
struct PinResult {
  int pin;
  int bytes_received;
  bool saw_boot_marker;      // "R\n" boot marker
  bool saw_json_start;       // '{' character
  bool saw_json_end;         // '}' character
  bool saw_hello_ok;         // "hello_ok" response
  bool saw_stats;            // "stats:" diagnostic response
  bool saw_printable;        // Printable ASCII
  char sample[128];
  int confidence;  // 0-100 confidence score
};

PinResult results[50];
int num_results = 0;

void setup() {
  Serial.begin(115200);
  delay(2000);
  
  Serial.println("\n\n========================================");
  Serial.println("COMPREHENSIVE RX PIN DETECTION TEST");
  Serial.println("========================================");
  Serial.println("VERIFIED FOR: ZIP Robot Uno Firmware v2.7.0");
  Serial.printf("TX Pin: GPIO%d (VERIFIED)\n", TX_PIN);
  Serial.printf("Baud Rate: %d\n", BAUD_RATE);
  Serial.printf("Testing %d candidate RX pins\n", num_candidates);
  Serial.println("========================================");
  Serial.println("\nArduino Uno should:");
  Serial.println("- Send 'R\\n' boot marker on reset");
  Serial.println("- Respond to {\"N\":0,\"H\":\"hello\"} with {hello_ok}");
  Serial.println("- Respond to {\"N\":120,\"H\":\"diag\"} with {stats:...}");
  Serial.println("\nStarting comprehensive scan in 3 seconds...\n");
  delay(3000);
}

void loop() {
  num_results = 0;  // Reset results
  
  Serial.println("\n========================================");
  Serial.println("STARTING COMPREHENSIVE SCAN");
  Serial.println("========================================\n");
  
  // Test each candidate pin
  for (int i = 0; i < num_candidates; i++) {
    int rx_pin = rx_candidates[i];
    
    // Skip testing TX pin as RX
    if (rx_pin == TX_PIN) {
      Serial.printf("Skipping GPIO%d (this is the TX pin)\n", rx_pin);
      continue;
    }
    
    Serial.printf("\n[%d/%d] Testing GPIO%d as RX pin...\n", 
                  i + 1, num_candidates, rx_pin);
    
    // Stop previous Serial1 if active
    Serial1.end();
    delay(100);
    
    // Initialize Serial1 with this RX pin
    Serial1.begin(BAUD_RATE, SERIAL_8N1, rx_pin, TX_PIN);
    delay(200);  // Give UART time to initialize
    
    // Test data collection
    unsigned long test_start = millis();
    unsigned long last_command = 0;
    int command_count = 0;
    int bytes_received = 0;
    char buffer[256];
    int buffer_pos = 0;
    bool saw_boot_marker = false;
    bool saw_json_start = false;
    bool saw_json_end = false;
    bool saw_hello_ok = false;
    bool saw_stats = false;
    bool saw_printable = false;
    
    // Test for TEST_DURATION_MS
    while (millis() - test_start < TEST_DURATION_MS) {
      unsigned long now = millis();
      
      // Send commands periodically to trigger Arduino response
      if (now - last_command >= COMMAND_INTERVAL_MS) {
        last_command = now;
        command_count++;
        
        // Alternate between hello and diagnostics commands
        if (command_count % 2 == 1) {
          Serial1.print("{\"N\":0,\"H\":\"hello\"}\n");
          Serial.printf("  [TX] Sent: {\"N\":0,\"H\":\"hello\"}\n");
        } else {
          Serial1.print("{\"N\":120,\"H\":\"diag\"}\n");
          Serial.printf("  [TX] Sent: {\"N\":120,\"H\":\"diag\"}\n");
        }
      }
      
      // Check for incoming data
      if (Serial1.available()) {
        while (Serial1.available()) {
          int byte = Serial1.read();
          if (byte >= 0) {
            bytes_received++;
            
            // Store sample (first 127 bytes)
            if (buffer_pos < sizeof(buffer) - 1 && buffer_pos < 127) {
              buffer[buffer_pos++] = (char)byte;
              buffer[buffer_pos] = '\0';
            }
            
            // Pattern detection
            if (byte == 'R') {
              // Check if next byte is '\n' (boot marker)
              if (Serial1.available()) {
                int next_byte = Serial1.peek();
                if (next_byte == '\n') {
                  saw_boot_marker = true;
                }
              }
            }
            if (byte == '{') saw_json_start = true;
            if (byte == '}') saw_json_end = true;
            if (byte >= 32 && byte < 127) saw_printable = true;
            
            // Check for "hello_ok" pattern
            if (buffer_pos >= 8) {
              char* hello_check = strstr(buffer, "hello_ok");
              if (hello_check != nullptr) saw_hello_ok = true;
            }
            
            // Check for "stats:" pattern
            if (buffer_pos >= 6) {
              char* stats_check = strstr(buffer, "stats:");
              if (stats_check != nullptr) saw_stats = true;
            }
            
            // Print first few bytes for debugging
            if (bytes_received <= 10) {
              Serial.printf("  [RX] Byte #%d: 0x%02X", bytes_received, byte);
              if (byte >= 32 && byte < 127) {
                Serial.printf(" ('%c')", byte);
              }
              Serial.println();
            }
          }
        }
      }
      
      delay(10);
    }
    
    // Calculate confidence score
    int confidence = 0;
    if (bytes_received >= 20) confidence += 50;  // Multiple bytes = very good sign
    else if (bytes_received >= 10) confidence += 30;
    else if (bytes_received >= 5) confidence += 15;
    else if (bytes_received >= 3) confidence += 5;
    
    if (saw_boot_marker) confidence += 20;  // Boot marker is definitive
    if (saw_hello_ok) confidence += 20;    // Valid hello response
    if (saw_stats) confidence += 20;         // Valid diagnostics response
    if (saw_json_start && saw_json_end) confidence += 10;  // Complete JSON frame
    if (saw_printable && bytes_received >= 3) confidence += 5;  // Printable data
    
    // Store result if we received any data
    if (bytes_received > 0) {
      PinResult result;
      result.pin = rx_pin;
      result.bytes_received = bytes_received;
      result.saw_boot_marker = saw_boot_marker;
      result.saw_json_start = saw_json_start;
      result.saw_json_end = saw_json_end;
      result.saw_hello_ok = saw_hello_ok;
      result.saw_stats = saw_stats;
      result.saw_printable = saw_printable;
      result.confidence = confidence;
      
      // Copy sample
      strncpy(result.sample, buffer, sizeof(result.sample) - 1);
      result.sample[sizeof(result.sample) - 1] = '\0';
      
      results[num_results++] = result;
      
      // Print immediate result
      Serial.printf("  GPIO%d: %d bytes received", rx_pin, bytes_received);
      if (saw_boot_marker) Serial.print(" [BOOT MARKER]");
      if (saw_hello_ok) Serial.print(" [hello_ok]");
      if (saw_stats) Serial.print(" [stats]");
      if (saw_json_start) Serial.print(" [JSON]");
      Serial.printf(" [Confidence: %d%%]", confidence);
      
      if (confidence >= 70) {
        Serial.print(" *** VERY HIGH CONFIDENCE ***");
      } else if (confidence >= 50) {
        Serial.print(" *** HIGH CONFIDENCE ***");
      } else if (confidence >= 30) {
        Serial.print(" *** MEDIUM CONFIDENCE ***");
      }
      Serial.println();
      
      if (buffer_pos > 0 && buffer_pos < 128) {
        Serial.printf("  Sample: %s\n", buffer);
      }
    } else {
      Serial.printf("  GPIO%d: No data received\n", rx_pin);
    }
    
    Serial1.end();
    delay(100);
  }
  
  // Print comprehensive summary
  Serial.println("\n\n========================================");
  Serial.println("SCAN COMPLETE - RESULTS SUMMARY");
  Serial.println("========================================\n");
  
  if (num_results == 0) {
    Serial.println("*** NO DATA RECEIVED ON ANY PIN ***");
    Serial.println("\nPossible issues:");
    Serial.println("- Arduino Uno may not be powered/running");
    Serial.println("- Shield connection issue (check slide-switch)");
    Serial.println("- Baud rate mismatch (should be 115200)");
    Serial.println("- Arduino not responding to commands");
    Serial.println("- Try resetting Arduino Uno");
  } else {
    // Sort results by confidence (simple bubble sort)
    for (int i = 0; i < num_results - 1; i++) {
      for (int j = 0; j < num_results - i - 1; j++) {
        if (results[j].confidence < results[j + 1].confidence) {
          PinResult temp = results[j];
          results[j] = results[j + 1];
          results[j + 1] = temp;
        }
      }
    }
    
    Serial.println("Pins that received data (sorted by confidence):\n");
    for (int i = 0; i < num_results; i++) {
      PinResult r = results[i];
      Serial.printf("%d. GPIO%d: %d bytes, Confidence: %d%%", 
                    i + 1, r.pin, r.bytes_received, r.confidence);
      
      if (r.confidence >= 70) {
        Serial.print(" [*** VERY LIKELY RX PIN ***]");
      } else if (r.confidence >= 50) {
        Serial.print(" [*** LIKELY RX PIN ***]");
      } else if (r.confidence >= 30) {
        Serial.print(" [Possible RX pin]");
      }
      
      Serial.println();
      
      if (r.saw_boot_marker) Serial.println("   ✓ Boot marker 'R\\n' detected");
      if (r.saw_hello_ok) Serial.println("   ✓ hello_ok response detected");
      if (r.saw_stats) Serial.println("   ✓ stats diagnostic response detected");
      if (r.saw_json_start) Serial.println("   ✓ JSON start '{' detected");
      if (r.saw_json_end) Serial.println("   ✓ JSON end '}' detected");
      
      if (strlen(r.sample) > 0) {
        Serial.printf("   Sample: %s\n", r.sample);
      }
      Serial.println();
    }
    
    // Highlight the most likely candidate
    if (results[0].confidence >= 50) {
      Serial.println("========================================");
      Serial.printf("*** MOST LIKELY RX PIN: GPIO%d ***\n", results[0].pin);
      Serial.printf("   Received %d bytes with %d%% confidence\n", 
                    results[0].bytes_received, results[0].confidence);
      Serial.println("========================================\n");
    }
  }
  
  Serial.println("\n--- Restarting scan in 10 seconds ---\n");
  delay(10000);
}
