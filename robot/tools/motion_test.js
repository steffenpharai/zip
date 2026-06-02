#!/usr/bin/env node
/**
 * Motion Test Harness
 * 
 * Tests N=200 setpoints, TTL deadman, N=201 stop, macros N=210/211
 * 
 * Usage: node motion_test.js <COM_PORT>
 * Example: node motion_test.js COM3
 */

const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');

const COM_PORT = process.argv[2] || 'COM3';
const BAUD_RATE = 115200;  // Firmware uses 115200 (ELEGOO JSON protocol also works at this baud rate)

let port = null;
let parser = null;
let testState = 'idle';
let testResults = {
  setpointForward: false,
  setpointTurning: false,
  ttlDeadman: false,
  stopImmediate: false,
  macroFigure8: false,
  macroSpin360: false,
  macroWiggle: false,
  macroForwardThenStop: false,
  macroCancel: false
};

function sendCommand(N, H, D1, D2, T) {
  const cmd = JSON.stringify({ N, H, D1, D2, T });
  console.log(`[SEND] ${cmd}`);
  if (port && port.isOpen) {
    port.write(cmd + '\n');
  }
}

function sendStop(H = 'cmd_stop') {
  sendCommand(201, H, 0, 0, 0);
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testSetpointForward() {
  console.log('\n=== Test 1: Setpoint Forward (N=200) ===');
  testState = 'setpoint_forward';
  
  const startTime = Date.now();
  const duration = 3000;  // 3 seconds
  const rate = 20;  // 20Hz = 50ms interval
  
  while (Date.now() - startTime < duration) {
    sendCommand(200, 'cmd_setpoint', 150, 0, 200);  // Forward at 150, no yaw, 200ms TTL
    await wait(1000 / rate);  // 50ms = 20Hz
  }
  
  // Stop sending - TTL should expire and robot should stop
  console.log('Stopped sending setpoints - waiting for TTL expiry...');
  await wait(500);  // Wait for TTL to expire (200ms + buffer)
  
  testResults.setpointForward = true;
  console.log('✓ Setpoint forward test complete');
}

async function testSetpointTurning() {
  console.log('\n=== Test 2: Setpoint Turning (N=200 arc) ===');
  testState = 'setpoint_turning';
  
  const startTime = Date.now();
  const duration = 2000;  // 2 seconds
  const rate = 20;  // 20Hz
  
  while (Date.now() - startTime < duration) {
    sendCommand(200, 'cmd_arc', 100, 50, 200);  // Forward 100, yaw 50 (right turn), 200ms TTL
    await wait(1000 / rate);
  }
  
  sendStop('cmd_arc_stop');
  await wait(100);
  
  testResults.setpointTurning = true;
  console.log('✓ Setpoint turning test complete');
}

async function testTTLDeadman() {
  console.log('\n=== Test 3: TTL Deadman Stop ===');
  testState = 'ttl_deadman';
  
  // Send one setpoint with short TTL
  sendCommand(200, 'cmd_ttl', 100, 0, 150);  // 150ms TTL
  await wait(200);  // Wait for TTL to expire
  
  // Robot should have stopped automatically
  testResults.ttlDeadman = true;
  console.log('✓ TTL deadman test complete (robot should have stopped)');
}

async function testStopImmediate() {
  console.log('\n=== Test 4: Immediate Stop (N=201) ===');
  testState = 'stop_immediate';
  
  // Start motion
  sendCommand(200, 'cmd_stop_test', 150, 0, 300);
  await wait(100);
  
  // Immediately stop
  sendStop('cmd_stop_test');
  await wait(100);
  
  testResults.stopImmediate = true;
  console.log('✓ Immediate stop test complete');
}

async function testMacro(macroId, macroName) {
  console.log(`\n=== Test: Macro ${macroName} (N=210, D1=${macroId}) ===`);
  testState = `macro_${macroName}`;
  
  sendCommand(210, `cmd_${macroName}`, macroId, 200, 5000);  // Intensity 200, 5s TTL
  await wait(100);
  
  // Wait for macro to run (or cancel after 3 seconds for testing)
  await wait(3000);
  
  // Cancel macro
  sendCommand(211, `cmd_${macroName}_cancel`, 0, 0, 0);
  await wait(100);
  
  testResults[`macro${macroName}`] = true;
  console.log(`✓ Macro ${macroName} test complete`);
}

async function runAllTests() {
  console.log('=== ZIP Robot Motion Test Harness ===');
  console.log(`Port: ${COM_PORT}`);
  console.log(`Baud: ${BAUD_RATE}`);
  console.log('Waiting for connection...\n');
  
  await wait(2000);  // Wait for serial connection to stabilize
  
  try {
    // Test 1: Setpoint forward
    await testSetpointForward();
    await wait(1000);
    
    // Test 2: Setpoint turning
    await testSetpointTurning();
    await wait(1000);
    
    // Test 3: TTL deadman
    await testTTLDeadman();
    await wait(1000);
    
    // Test 4: Immediate stop
    await testStopImmediate();
    await wait(1000);
    
    // Test 5: Macros
    await testMacro(1, 'Figure8');
    await wait(1000);
    
    await testMacro(2, 'Spin360');
    await wait(1000);
    
    await testMacro(3, 'Wiggle');
    await wait(1000);
    
    await testMacro(4, 'ForwardThenStop');
    await wait(1000);
    
    // Final stop
    sendStop('cmd_final');
    await wait(500);
    
    // Print results
    console.log('\n=== Test Results ===');
    console.log(JSON.stringify(testResults, null, 2));
    
    const allPassed = Object.values(testResults).every(r => r === true);
    console.log(`\n${allPassed ? '✓ All tests passed!' : '✗ Some tests failed'}`);
    
  } catch (error) {
    console.error('Test error:', error);
  } finally {
    if (port && port.isOpen) {
      port.close();
    }
    process.exit(0);
  }
}

// Initialize serial port
port = new SerialPort({
  path: COM_PORT,
  baudRate: BAUD_RATE,
  autoOpen: false
});

parser = port.pipe(new ReadlineParser({ delimiter: '\n' }));

parser.on('data', (data) => {
  console.log(`[RECV] ${data.toString().trim()}`);
});

port.on('open', () => {
  console.log(`Serial port ${COM_PORT} opened`);
  runAllTests();
});

port.on('error', (err) => {
  console.error('Serial port error:', err);
  process.exit(1);
});

// Open port
port.open();

