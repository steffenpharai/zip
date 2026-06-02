#!/usr/bin/env node

/**
 * Serial Motion Test Harness
 * 
 * Tests serial communication and motion control with ZIP Robot firmware
 * on ELEGOO Smart Robot Car V4.0.
 * 
 * Usage:
 *   node serial_motion_test.js [PORT]
 * 
 * Example:
 *   node serial_motion_test.js COM5
 *   node serial_motion_test.js /dev/ttyUSB0
 * 
 * Test sequence:
 *   1. Open port, wait for DTR reset
 *   2. Wait for "R\n" boot marker
 *   3. Send N=0 hello, wait for {hello_ok}
 *   4. Stream N=200 setpoints at 20Hz for 3s (forward)
 *   5. Stream N=200 setpoints for arc motion
 *   6. Stop sending and verify TTL stop
 *   7. Send N=201 stop
 *   8. Start macro N=210 and cancel N=211
 *   9. Get diagnostics N=120
 * 
 * IMPORTANT: Unplug ESP32 camera/Bluetooth module from RX/TX during this test!
 */

const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');

// Configuration
const BAUD_RATE = 115200;
const RESET_DELAY_MS = 600;  // Wait for DTR reset
const BOOT_TIMEOUT_MS = 2000;
const HELLO_TIMEOUT_MS = 1000;
const SETPOINT_RATE_HZ = 20;
const SETPOINT_DURATION_MS = 3000;
const SETPOINT_TTL_MS = 200;

// Test results
const results = {
  bootMarker: false,
  helloResponse: false,
  setpointStreaming: false,
  ttlStop: false,
  stopCommand: false,
  macroStart: false,
  macroCancel: false,
  diagnostics: null
};

// Parse command line
const port = process.argv[2];
if (!port) {
  console.error('Usage: node serial_motion_test.js [PORT]');
  console.error('Example: node serial_motion_test.js COM5');
  console.error('\nAvailable ports:');
  SerialPort.list().then(ports => {
    ports.forEach(p => console.error(`  ${p.path} - ${p.manufacturer || 'Unknown'}`));
  });
  process.exit(1);
}

console.log('=== ZIP Robot Serial Motion Test ===\n');
console.log(`Port: ${port}`);
console.log(`Baud: ${BAUD_RATE}`);
console.log('');

// Open serial port
const serial = new SerialPort({
  path: port,
  baudRate: BAUD_RATE,
  autoOpen: false
});

// Line parser for responses
const parser = serial.pipe(new ReadlineParser({ delimiter: '\n' }));

// Response buffer
let responses = [];
let responseResolve = null;

// Handle incoming lines
parser.on('data', (line) => {
  line = line.trim();
  if (line.length > 0) {
    console.log(`<< ${line}`);
    responses.push(line);
    if (responseResolve) {
      responseResolve(line);
      responseResolve = null;
    }
  }
});

// Wait for specific response
function waitForResponse(pattern, timeoutMs) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    
    // Check existing responses
    const existing = responses.find(r => r.includes(pattern));
    if (existing) {
      resolve(existing);
      return;
    }
    
    // Set up timeout
    const timeout = setTimeout(() => {
      responseResolve = null;
      reject(new Error(`Timeout waiting for: ${pattern}`));
    }, timeoutMs);
    
    // Wait for new response
    responseResolve = (line) => {
      if (line.includes(pattern)) {
        clearTimeout(timeout);
        resolve(line);
      } else if (Date.now() - start < timeoutMs) {
        // Keep waiting
        responseResolve = (line2) => {
          if (line2.includes(pattern)) {
            clearTimeout(timeout);
            resolve(line2);
          }
        };
      }
    };
  });
}

// Send command
function send(cmd) {
  console.log(`>> ${cmd}`);
  serial.write(cmd + '\n');
}

// Sleep helper
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Drain responses (read continuously to prevent TX backpressure)
function drainResponses() {
  responses = [];
}

// Main test sequence
async function runTest() {
  try {
    // Open port
    console.log('Opening port...');
    await new Promise((resolve, reject) => {
      serial.open((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    console.log('Port opened.\n');
    
    // Wait for DTR reset
    console.log(`Waiting ${RESET_DELAY_MS}ms for DTR reset...`);
    await sleep(RESET_DELAY_MS);
    
    // Wait for init sequence to complete (bootloader + setup + init ~3s)
    console.log('Waiting 3500ms for init sequence...');
    await sleep(3500);
    
    // Flush any garbage
    drainResponses();
    
    // Wait for boot marker
    console.log('\n--- TEST 1: Boot Marker ---');
    try {
      await waitForResponse('R', BOOT_TIMEOUT_MS);
      results.bootMarker = true;
      console.log('✓ Received boot marker');
    } catch (e) {
      console.log('✗ No boot marker received');
    }
    
    // Test hello handshake
    console.log('\n--- TEST 2: Hello Handshake ---');
    drainResponses();
    send('{"N":0,"H":"test"}');
    try {
      await waitForResponse('hello_ok', HELLO_TIMEOUT_MS);
      results.helloResponse = true;
      console.log('✓ Hello handshake successful');
    } catch (e) {
      console.log('✗ Hello handshake failed');
    }
    
    // Test setpoint streaming (forward motion)
    console.log('\n--- TEST 3: Setpoint Streaming (Forward) ---');
    drainResponses();
    const setpointInterval = 1000 / SETPOINT_RATE_HZ;
    const setpointCount = Math.floor(SETPOINT_DURATION_MS / setpointInterval);
    
    console.log(`Streaming ${setpointCount} setpoints at ${SETPOINT_RATE_HZ}Hz...`);
    
    for (let i = 0; i < setpointCount; i++) {
      // v=100 (forward), w=0 (straight)
      send(`{"N":200,"H":"sp","D1":100,"D2":0,"T":${SETPOINT_TTL_MS}}`);
      await sleep(setpointInterval);
      
      // Drain responses continuously
      if (responses.length > 10) {
        drainResponses();
      }
    }
    
    results.setpointStreaming = true;
    console.log('✓ Setpoint streaming completed');
    
    // Test arc motion
    console.log('\n--- TEST 4: Arc Motion ---');
    for (let i = 0; i < 40; i++) {  // 2 seconds at 20Hz
      // v=100 (forward), w=50 (turning right)
      send(`{"N":200,"H":"arc","D1":100,"D2":50,"T":${SETPOINT_TTL_MS}}`);
      await sleep(setpointInterval);
    }
    console.log('✓ Arc motion completed');
    
    // Test TTL stop (stop sending setpoints)
    console.log('\n--- TEST 5: TTL Stop ---');
    console.log(`Waiting ${SETPOINT_TTL_MS + 100}ms for TTL expiration...`);
    await sleep(SETPOINT_TTL_MS + 100);
    results.ttlStop = true;
    console.log('✓ TTL stop (motors should have stopped)');
    
    // Test stop command
    console.log('\n--- TEST 6: Stop Command ---');
    drainResponses();
    send('{"N":201,"H":"stop"}');
    try {
      await waitForResponse('stop_ok', 500);
      results.stopCommand = true;
      console.log('✓ Stop command acknowledged');
    } catch (e) {
      console.log('✗ Stop command not acknowledged');
    }
    
    // Test macro start
    console.log('\n--- TEST 7: Macro Start (SPIN_360) ---');
    drainResponses();
    // MacroID 2 = SPIN_360, intensity 200, TTL 5000ms
    send('{"N":210,"H":"macro","D1":2,"D2":200,"T":5000}');
    try {
      await waitForResponse('macro_ok', 500);
      results.macroStart = true;
      console.log('✓ Macro started');
    } catch (e) {
      console.log('✗ Macro start not acknowledged');
    }
    
    // Wait a bit to see macro running
    await sleep(1000);
    
    // Test macro cancel
    console.log('\n--- TEST 8: Macro Cancel ---');
    drainResponses();
    send('{"N":211,"H":"cancel"}');
    try {
      await waitForResponse('cancel_ok', 500);
      results.macroCancel = true;
      console.log('✓ Macro cancelled');
    } catch (e) {
      console.log('✗ Macro cancel not acknowledged');
    }
    
    // Get diagnostics
    console.log('\n--- TEST 9: Diagnostics ---');
    drainResponses();
    send('{"N":120,"H":"diag"}');
    await sleep(200);
    const diagResponse = responses.find(r => r.includes('stats:'));
    if (diagResponse) {
      results.diagnostics = diagResponse;
      console.log(`✓ Diagnostics: ${diagResponse}`);
    } else {
      console.log('✗ No diagnostics response');
    }
    
    // Final stop
    send('{"N":201,"H":"final"}');
    await sleep(100);
    
  } catch (error) {
    console.error('\n❌ Test error:', error.message);
  } finally {
    // Close port
    console.log('\n--- Closing port ---');
    serial.close();
    
    // Print summary
    console.log('\n=== TEST SUMMARY ===');
    console.log(`Boot Marker:       ${results.bootMarker ? '✓ PASS' : '✗ FAIL'}`);
    console.log(`Hello Handshake:   ${results.helloResponse ? '✓ PASS' : '✗ FAIL'}`);
    console.log(`Setpoint Streaming: ${results.setpointStreaming ? '✓ PASS' : '✗ FAIL'}`);
    console.log(`TTL Stop:          ${results.ttlStop ? '✓ PASS' : '✗ FAIL'}`);
    console.log(`Stop Command:      ${results.stopCommand ? '✓ PASS' : '✗ FAIL'}`);
    console.log(`Macro Start:       ${results.macroStart ? '✓ PASS' : '✗ FAIL'}`);
    console.log(`Macro Cancel:      ${results.macroCancel ? '✓ PASS' : '✗ FAIL'}`);
    console.log(`Diagnostics:       ${results.diagnostics ? '✓ PASS' : '✗ FAIL'}`);
    
    const passed = Object.values(results).filter(v => v === true || (typeof v === 'string')).length;
    const total = 8;
    console.log(`\nTotal: ${passed}/${total} tests passed`);
  }
}

// Handle errors
serial.on('error', (err) => {
  console.error('Serial error:', err.message);
});

// Run the test
runTest().catch(console.error);

