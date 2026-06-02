/**
 * Comprehensive Command Test Suite
 * 
 * Tests all Arduino Uno commands via UART (Serial1).
 * Uses GPIO3 (RX) and GPIO40 (TX) - VERIFIED pin assignments.
 * 
 * Tests each command, waits for response, and validates the result.
 */

#include <Arduino.h>
#include "drivers/uart/uart_bridge.h"
#include "board/board_esp32s3_elegoo_cam.h"
#include <string.h>

// Test result tracking
struct TestResult {
  const char* name;
  bool passed;
  const char* expected;
  char received[128];
  unsigned long response_time_ms;
};

TestResult test_results[20];
int num_tests = 0;
int passed_tests = 0;
int failed_tests = 0;

// Helper: Wait for response with timeout
bool wait_for_response(char* buffer, size_t buffer_size, unsigned long timeout_ms, const char* expected_pattern = nullptr) {
  unsigned long start = millis();
  size_t pos = 0;
  buffer[0] = '\0';
  
  while (millis() - start < timeout_ms) {
    uart_tick();  // Process incoming data
    
    while (uart_rx_available() > 0 && pos < buffer_size - 1) {
      int byte = uart_rx_read_byte();
      if (byte >= 0) {
        buffer[pos++] = (char)byte;
        buffer[pos] = '\0';
        
        // Check for complete JSON frame
        if (byte == '}') {
          // Frame complete
          if (expected_pattern) {
            return (strstr(buffer, expected_pattern) != nullptr);
          }
          return true;
        }
      }
    }
    delay(10);
  }
  
  return false;  // Timeout
}

// Helper: Send command and wait for response
bool test_command(const char* command, const char* test_name, const char* expected_pattern, unsigned long timeout_ms = 2000) {
  Serial.printf("\n[TEST] %s\n", test_name);
  Serial.printf("  Command: %s\n", command);
  
  // Clear RX buffer
  while (uart_rx_available() > 0) {
    uart_rx_read_byte();
  }
  
  // Send command
  unsigned long send_time = millis();
  size_t sent = uart_tx_string(command);
  uart_tx_string("\n");  // Add newline
  
  Serial.printf("  Sent: %zu bytes\n", sent);
  
  // Wait for response
  char response[128];
  bool got_response = wait_for_response(response, sizeof(response), timeout_ms, expected_pattern);
  unsigned long response_time = millis() - send_time;
  
  // Record result (copy strings to avoid stack pointer issues)
  if (num_tests < 20) {
    TestResult* result = &test_results[num_tests];
    result->name = test_name;  // String literal, safe
    result->passed = got_response;
    result->expected = expected_pattern;  // String literal, safe
    strncpy(result->received, response, sizeof(result->received) - 1);
    result->received[sizeof(result->received) - 1] = '\0';
    result->response_time_ms = response_time;
    num_tests++;
  }
  
  // Print result
  if (got_response) {
    Serial.printf("  ✓ PASS (%.0f ms): %s\n", (float)response_time, response);
    passed_tests++;
  } else {
    Serial.printf("  ✗ FAIL (%.0f ms): ", (float)response_time);
    if (strlen(response) > 0) {
      Serial.printf("Received: %s\n", response);
    } else {
      Serial.printf("No response (timeout)\n");
    }
    failed_tests++;
  }
  
  // Record result after printing (to avoid stack corruption)
  if (num_tests < 20) {
    TestResult* result = &test_results[num_tests];
    result->name = test_name;  // String literal, safe
    result->passed = got_response;
    result->expected = expected_pattern;  // String literal, safe
    strncpy(result->received, response, sizeof(result->received) - 1);
    result->received[sizeof(result->received) - 1] = '\0';
    result->response_time_ms = response_time;
    num_tests++;
  }
  
  delay(200);  // Small delay between tests
  return got_response;
}

void setup() {
  Serial.begin(115200);
  delay(2000);
  
  Serial.println("\n\n========================================");
  Serial.println("COMPREHENSIVE COMMAND TEST SUITE");
  Serial.println("========================================");
  Serial.println("Testing all Arduino Uno commands via UART");
  Serial.printf("UART: RX=GPIO%d TX=GPIO%d @ 115200 baud\n", UART_RX_GPIO, UART_TX_GPIO);
  Serial.println("========================================\n");
  
  // Initialize UART bridge
  if (!uart_init()) {
    Serial.println("ERROR: Failed to initialize UART bridge!");
    while (1) delay(1000);
  }
  
  Serial.println("Waiting for UART to stabilize...");
  delay(1000);
  
  Serial.println("\nStarting tests in 2 seconds...\n");
  delay(2000);
}

void loop() {
  num_tests = 0;
  passed_tests = 0;
  failed_tests = 0;
  
  Serial.println("\n========================================");
  Serial.println("TEST SUITE START");
  Serial.println("========================================\n");
  
  // ========================================================================
  // Utility Commands
  // ========================================================================
  Serial.println("--- UTILITY COMMANDS ---");
  
  // N=0: Hello handshake
  test_command("{\"N\":0,\"H\":\"hello\"}", "N=0 Hello", "hello_ok");
  
  // N=100: Clear/Stop (Legacy)
  test_command("{\"N\":100}", "N=100 Clear/Stop", "ok");
  
  // N=110: Clear/Stop (Legacy)
  test_command("{\"N\":110}", "N=110 Clear/Stop", "ok");
  
  // N=120: Diagnostics
  test_command("{\"N\":120,\"H\":\"diag\"}", "N=120 Diagnostics", "stats:", 3000);
  
  // N=130: Re-run init sequence
  test_command("{\"N\":130,\"H\":\"init\"}", "N=130 Re-run Init", "_ok");
  
  // ========================================================================
  // Sensor Commands
  // ========================================================================
  Serial.println("\n--- SENSOR COMMANDS ---");
  
  // N=21: Ultrasonic - Obstacle detection
  test_command("{\"N\":21,\"H\":\"ultra\",\"D1\":1}", "N=21 Ultrasonic Obstacle", "_true");
  
  // N=21: Ultrasonic - Distance
  test_command("{\"N\":21,\"H\":\"ultra\",\"D1\":2}", "N=21 Ultrasonic Distance", "_");
  
  // N=22: Line sensor - Left
  test_command("{\"N\":22,\"H\":\"line\",\"D1\":0}", "N=22 Line Sensor Left", "_");
  
  // N=22: Line sensor - Middle
  test_command("{\"N\":22,\"H\":\"line\",\"D1\":1}", "N=22 Line Sensor Middle", "_");
  
  // N=22: Line sensor - Right
  test_command("{\"N\":22,\"H\":\"line\",\"D1\":2}", "N=22 Line Sensor Right", "_");
  
  // N=23: Battery voltage
  test_command("{\"N\":23,\"H\":\"batt\",\"D1\":0}", "N=23 Battery Voltage", "_");
  
  // N=23: Battery diagnostic
  test_command("{\"N\":23,\"H\":\"batt\",\"D1\":1}", "N=23 Battery Diagnostic", "adc:");
  
  // ========================================================================
  // Servo Commands
  // ========================================================================
  Serial.println("\n--- SERVO COMMANDS ---");
  
  // N=5: Servo control - Center (90 degrees)
  test_command("{\"N\":5,\"H\":\"servo\",\"D1\":90}", "N=5 Servo Center", "_ok");
  
  // N=5: Servo control - Left (0 degrees)
  test_command("{\"N\":5,\"H\":\"servo\",\"D1\":0}", "N=5 Servo Left", "_ok");
  
  // N=5: Servo control - Right (180 degrees)
  test_command("{\"N\":5,\"H\":\"servo\",\"D1\":180}", "N=5 Servo Right", "_ok");
  
  // ========================================================================
  // Motion Commands
  // ========================================================================
  Serial.println("\n--- MOTION COMMANDS ---");
  
  // N=201: Stop (should always respond)
  test_command("{\"N\":201,\"H\":\"stop\"}", "N=201 Stop", "stop_ok");
  
  // N=210: Macro - Spin 360
  test_command("{\"N\":210,\"H\":\"macro\",\"D1\":2,\"D2\":150,\"T\":5000}", "N=210 Macro Spin360", "macro_");
  
  // Wait a bit for macro to start
  delay(500);
  
  // N=211: Macro Cancel
  test_command("{\"N\":211,\"H\":\"cancel\"}", "N=211 Macro Cancel", "cancel_ok");
  
  // N=200: Drive setpoint (fire-and-forget, no response expected)
  Serial.println("\n[TEST] N=200 Drive Setpoint (fire-and-forget)");
  Serial.println("  Command: {\"N\":200,\"H\":\"sp\",\"D1\":100,\"D2\":0,\"T\":200}");
  uart_tx_string("{\"N\":200,\"H\":\"sp\",\"D1\":100,\"D2\":0,\"T\":200}\n");
  Serial.println("  Note: N=200 does not send response (by design)");
  delay(500);
  
  // N=201: Stop again
  test_command("{\"N\":201,\"H\":\"stop\"}", "N=201 Stop (after setpoint)", "stop_ok");
  
  // ========================================================================
  // Drive Config Commands
  // ========================================================================
  Serial.println("\n--- DRIVE CONFIG COMMANDS ---");
  
  // N=140: Set deadband
  test_command("{\"N\":140,\"H\":\"config\",\"D1\":1,\"D2\":256}", "N=140 Set Deadband", "_ok");
  
  // N=140: Set accel step
  test_command("{\"N\":140,\"H\":\"config\",\"D1\":2,\"D2\":10}", "N=140 Set Accel", "_ok");
  
  // ========================================================================
  // Test Summary
  // ========================================================================
  Serial.println("\n\n========================================");
  Serial.println("TEST SUITE SUMMARY");
  Serial.println("========================================\n");
  
  Serial.printf("Total Tests: %d\n", num_tests);
  Serial.printf("Passed: %d\n", passed_tests);
  Serial.printf("Failed: %d\n", failed_tests);
  Serial.printf("Success Rate: %.1f%%\n", (float)passed_tests / num_tests * 100.0f);
  
  Serial.println("\nDetailed Results:\n");
  for (int i = 0; i < num_tests; i++) {
    TestResult r = test_results[i];
    Serial.printf("%s %s (%.0f ms)\n", 
                  r.passed ? "✓" : "✗",
                  r.name,
                  (float)r.response_time_ms);
    if (!r.passed) {
      Serial.printf("  Expected: %s\n", r.expected ? r.expected : "any response");
      Serial.printf("  Received: %s\n", strlen(r.received) > 0 ? r.received : "(timeout)");
    }
  }
  
  Serial.println("\n========================================");
  Serial.println("Test suite complete. Restarting in 10 seconds...");
  Serial.println("========================================\n");
  delay(10000);
}

