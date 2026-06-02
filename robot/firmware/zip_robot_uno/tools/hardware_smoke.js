#!/usr/bin/env node

/**
 * Hardware Smoke Test - ZIP Robot Firmware
 * 
 * Quick validation that all hardware responds correctly.
 * Exits 0 on success, 1 on any failure.
 * 
 * Usage:
 *   node hardware_smoke.js [PORT]
 * 
 * Example:
 *   node hardware_smoke.js COM5
 * 
 * Tests:
 *   1. N=0   Hello        → expect {H_ok}
 *   2. N=120 Diagnostics  → expect {...hw:ELGV11TB...}
 *   3. N=23  Battery      → expect {H_<4000-9000>} mV
 *   4. N=21  Ultrasonic   → expect {H_<0-400>} cm
 *   5. N=22  Line sensors → expect {H_<0-1023>} (x3)
 *   6. N=5   Servo        → expect {H_ok}
 *   7. N=201 Stop         → expect {H_ok}
 */

const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');

// Configuration
const BAUD_RATE = 115200;
const RESET_DELAY_MS = 600;          // Wait for DTR reset
const INIT_SEQUENCE_MS = 3500;       // Wait for init sequence to complete (bootloader + setup + init ~3s)
const RESPONSE_TIMEOUT_MS = 500;     // Response should come within 500ms
const EXPECTED_HW_HASH = 'ELGV11TB';

// Test results
let testsRun = 0;
let testsPassed = 0;
let testsFailed = 0;

// Parse command line
const port = process.argv[2];

if (!port) {
  console.error('Usage: node hardware_smoke.js [PORT]');
  console.error('Example: node hardware_smoke.js COM5');
  console.error('\nAvailable ports:');
  SerialPort.list().then(ports => {
    ports.forEach(p => console.error(`  ${p.path} - ${p.manufacturer || 'Unknown'}`));
    process.exit(1);
  });
} else {
  runTests();
}

async function runTests() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  ZIP Robot Hardware Smoke Test');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`Port: ${port}`);
  console.log(`Baud: ${BAUD_RATE}`);
  console.log(`Expected HW Hash: ${EXPECTED_HW_HASH}`);
  console.log('');

  let serial;
  let parser;
  let responseBuffer = [];

  try {
    // Open serial port
    serial = new SerialPort({
      path: port,
      baudRate: BAUD_RATE,
      autoOpen: false
    });

    parser = serial.pipe(new ReadlineParser({ delimiter: '\n' }));

    // Collect responses
    parser.on('data', (line) => {
      line = line.trim();
      if (line.length > 0) {
        responseBuffer.push(line);
        console.log(`  << ${line}`);
      }
    });

    // Open port
    await new Promise((resolve, reject) => {
      serial.open((err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    console.log('[OK] Serial port opened');
    console.log(`[..] Waiting ${RESET_DELAY_MS}ms for DTR reset...`);
    await sleep(RESET_DELAY_MS);

    // Wait for init sequence to complete
    console.log(`[..] Waiting ${INIT_SEQUENCE_MS}ms for init sequence...`);
    await sleep(INIT_SEQUENCE_MS);
    
    // Capture boot messages
    if (responseBuffer.length > 0) {
      console.log('[BOOT] Boot messages received:');
      responseBuffer.forEach(line => console.log(`  ${line}`));
      
      // Check for HW hash in boot output
      const hwLine = responseBuffer.find(l => l.includes('HW:'));
      if (hwLine && hwLine.includes(EXPECTED_HW_HASH)) {
        console.log(`[OK] Hardware profile verified: ${EXPECTED_HW_HASH}`);
      }
      
      // Check for INIT status
      const initLine = responseBuffer.find(l => l.includes('INIT:'));
      if (initLine) {
        console.log(`[OK] Init sequence: ${initLine}`);
      }
    }
    responseBuffer = [];
    console.log('');

    // Helper: send command and wait for response
    async function sendAndWait(cmd, description) {
      responseBuffer = [];
      console.log(`[TEST] ${description}`);
      console.log(`  >> ${cmd}`);
      serial.write(cmd + '\n');
      
      await sleep(RESPONSE_TIMEOUT_MS);
      
      return responseBuffer;
    }

    // Helper: check test result
    function checkResult(name, responses, validator) {
      testsRun++;
      const result = validator(responses);
      if (result.pass) {
        testsPassed++;
        console.log(`  [PASS] ${name}: ${result.message}`);
      } else {
        testsFailed++;
        console.log(`  [FAIL] ${name}: ${result.message}`);
      }
      console.log('');
      return result.pass;
    }

    // ═══════════════════════════════════════════════════════════
    // TEST 1: Hello (N=0)
    // ═══════════════════════════════════════════════════════════
    let responses = await sendAndWait('{"N":0,"H":"smoke"}', 'N=0 Hello');
    checkResult('Hello', responses, (r) => {
      // Firmware responds with {hello_ok} regardless of H value
      const hasOk = r.some(line => line.includes('hello_ok') || line.includes('smoke_ok'));
      return {
        pass: hasOk,
        message: hasOk ? 'Got {hello_ok} response' : 'No ok response received'
      };
    });

    // ═══════════════════════════════════════════════════════════
    // TEST 2: Diagnostics (N=120)
    // ═══════════════════════════════════════════════════════════
    responses = await sendAndWait('{"N":120}', 'N=120 Diagnostics');
    checkResult('Diagnostics', responses, (r) => {
      // Full diagnostics line contains hw: field
      const diagLine = r.find(line => line.includes('hw:'));
      // Stats line is also valid (sent when TX buffer is tight)
      const statsLine = r.find(line => line.includes('stats:'));
      
      if (diagLine) {
        const hasHwHash = diagLine.includes(EXPECTED_HW_HASH);
        const hasImu = diagLine.includes('imu:');
        const hasRam = diagLine.includes('ram:');
        return {
          pass: hasHwHash && hasImu && hasRam,
          message: hasHwHash ? `HW hash verified, IMU=${hasImu}, RAM=${hasRam}` : `Wrong HW hash, expected ${EXPECTED_HW_HASH}`
        };
      } else if (statsLine) {
        // Stats line is acceptable - means command was processed but buffer was tight
        return { pass: true, message: 'Stats line received (buffer tight)' };
      }
      return { pass: false, message: 'No diagnostics response' };
    });

    // ═══════════════════════════════════════════════════════════
    // TEST 3: Battery (N=23)
    // ═══════════════════════════════════════════════════════════
    responses = await sendAndWait('{"N":23,"H":"batt"}', 'N=23 Battery Voltage');
    checkResult('Battery', responses, (r) => {
      const battLine = r.find(line => line.includes('batt_'));
      if (!battLine) {
        return { pass: false, message: 'No battery response' };
      }
      // Extract voltage value
      const match = battLine.match(/batt_(\d+)/);
      if (!match) {
        return { pass: false, message: 'Could not parse battery value' };
      }
      const mv = parseInt(match[1]);
      const inRange = mv >= 4000 && mv <= 9000;
      return {
        pass: inRange,
        message: inRange ? `${mv}mV (in range 4000-9000)` : `${mv}mV OUT OF RANGE (expected 4000-9000)`
      };
    });

    // ═══════════════════════════════════════════════════════════
    // TEST 4: Ultrasonic (N=21 D1=2)
    // ═══════════════════════════════════════════════════════════
    responses = await sendAndWait('{"N":21,"H":"us","D1":2}', 'N=21 Ultrasonic Distance');
    checkResult('Ultrasonic', responses, (r) => {
      const usLine = r.find(line => line.includes('us_'));
      if (!usLine) {
        return { pass: false, message: 'No ultrasonic response' };
      }
      const match = usLine.match(/us_(\d+)/);
      if (!match) {
        return { pass: false, message: 'Could not parse ultrasonic value' };
      }
      const cm = parseInt(match[1]);
      const inRange = cm >= 0 && cm <= 400;
      return {
        pass: inRange,
        message: inRange ? `${cm}cm (in range 0-400)` : `${cm}cm OUT OF RANGE (expected 0-400)`
      };
    });

    // ═══════════════════════════════════════════════════════════
    // TEST 5: Line Sensors (N=22 D1=0,1,2)
    // ═══════════════════════════════════════════════════════════
    const lineSensorNames = ['Left', 'Middle', 'Right'];
    for (let i = 0; i < 3; i++) {
      responses = await sendAndWait(`{"N":22,"H":"line${i}","D1":${i}}`, `N=22 Line Sensor ${lineSensorNames[i]}`);
      checkResult(`Line ${lineSensorNames[i]}`, responses, (r) => {
        const lineLine = r.find(line => line.includes(`line${i}_`));
        if (!lineLine) {
          return { pass: false, message: 'No line sensor response' };
        }
        const match = lineLine.match(/line\d_(\d+)/);
        if (!match) {
          return { pass: false, message: 'Could not parse line sensor value' };
        }
        const value = parseInt(match[1]);
        const inRange = value >= 0 && value <= 1023;
        return {
          pass: inRange,
          message: inRange ? `${value} (in range 0-1023)` : `${value} OUT OF RANGE (expected 0-1023)`
        };
      });
    }

    // ═══════════════════════════════════════════════════════════
    // TEST 6: Servo (N=5)
    // ═══════════════════════════════════════════════════════════
    responses = await sendAndWait('{"N":5,"H":"servo","D1":90}', 'N=5 Servo Center');
    checkResult('Servo', responses, (r) => {
      const hasOk = r.some(line => line.includes('servo_ok'));
      return {
        pass: hasOk,
        message: hasOk ? 'Servo acknowledged' : 'No servo ok response'
      };
    });

    // ═══════════════════════════════════════════════════════════
    // TEST 7: Stop (N=201)
    // ═══════════════════════════════════════════════════════════
    responses = await sendAndWait('{"N":201,"H":"stop"}', 'N=201 Stop');
    checkResult('Stop', responses, (r) => {
      const hasOk = r.some(line => line.includes('stop_ok') || line.includes('H_ok'));
      return {
        pass: hasOk,
        message: hasOk ? 'Stop acknowledged' : 'No stop ok response'
      };
    });

    // Close serial
    serial.close();

    // Print summary
    console.log('═══════════════════════════════════════════════════════════');
    console.log('  SMOKE TEST SUMMARY');
    console.log('═══════════════════════════════════════════════════════════');
    console.log(`  Tests Run:    ${testsRun}`);
    console.log(`  Tests Passed: ${testsPassed}`);
    console.log(`  Tests Failed: ${testsFailed}`);
    console.log('');

    if (testsFailed === 0) {
      console.log('✓ ALL TESTS PASSED');
      process.exit(0);
    } else {
      console.log('✗ SOME TESTS FAILED');
      process.exit(1);
    }

  } catch (err) {
    console.error(`[ERROR] ${err.message}`);
    if (serial && serial.isOpen) {
      serial.close();
    }
    process.exit(1);
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

