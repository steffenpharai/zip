/**
 * TX Pin Detection Test
 * 
 * Tests candidate GPIO pins to find which one is the ESP32 TX pin
 * (the pin that makes Arduino RX LED blink when toggled).
 * 
 * Watch Arduino RX LED - it should blink when we find the TX pin.
 */

#include <Arduino.h>

// Candidate pins to test for TX (ESP32 TX → Arduino RX)
// GPIO40 is already verified, but we'll test all to be thorough
int tx_candidates[] = {1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 21, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48};
int num_candidates = sizeof(tx_candidates) / sizeof(tx_candidates[0]);

void setup() {
  Serial.begin(115200);
  delay(2000);
  Serial.println("\n\n========================================");
  Serial.println("TX PIN DETECTION TEST");
  Serial.println("========================================");
  Serial.println("Testing candidate GPIO pins to find ESP32 TX pin");
  Serial.println("Watch Arduino RX LED - it should blink when correct pin is found");
  Serial.printf("Testing %d GPIO pins...\n", num_candidates);
  Serial.println("========================================\n");
}

void loop() {
  for (int i = 0; i < num_candidates; i++) {
    int pin = tx_candidates[i];
    
    Serial.printf("\n>>> Testing TX pin: GPIO%d - Watch Arduino RX LED <<<\n", pin);
    
    // Set pin as output
    pinMode(pin, OUTPUT);
    
    // Toggle 5 times rapidly
    for (int j = 0; j < 5; j++) {
      digitalWrite(pin, HIGH);
      delay(100);
      digitalWrite(pin, LOW);
      delay(100);
    }
    
    Serial.printf("GPIO%d test complete - did Arduino RX LED blink?\n", pin);
    
    // Reset pin to high impedance
    pinMode(pin, INPUT);
    delay(200);
  }
  
  Serial.println("\n--- Cycle complete, restarting in 3 seconds ---\n");
  delay(3000);
}
