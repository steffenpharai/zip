#!/usr/bin/env node
/**
 * Individual Motor Test Script
 * 
 * Tests each motor independently so you can verify each one moves:
 * - Left wheel motors (Motor B)
 * - Right wheel motors (Motor A)
 * - Pan servo
 * 
 * Usage: node test_individual_motors.js COM5
 */

const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');

const port = process.argv[2] || 'COM5';
const PWM = 100;           // Motor speed (0-255)
const DURATION = 2000;     // Duration for each motor test (ms)
const INIT_WAIT = 3500;    // Wait for firmware init sequence

console.log(`\n${'═'.repeat(60)}`);
console.log('INDIVIDUAL MOTOR TEST');
console.log(`${'═'.repeat(60)}`);
console.log(`Port: ${port}`);
console.log(`Motor PWM: ${PWM}`);
console.log(`Duration per test: ${DURATION}ms`);
console.log(`${'═'.repeat(60)}\n`);

const serial = new SerialPort({
  path: port,
  baudRate: 115200
});

const parser = serial.pipe(new ReadlineParser({ delimiter: '\n' }));

let responses = [];

parser.on('data', (line) => {
  const trimmed = line.trim();
  if (trimmed) {
    console.log(`  ← ${trimmed}`);
    responses.push(trimmed);
  }
});

serial.on('error', (err) => {
  console.error('Serial error:', err.message);
  process.exit(1);
});

function send(cmd, tag) {
  return new Promise((resolve) => {
    const json = JSON.stringify({ ...cmd, H: tag });
    console.log(`  → ${json}`);
    serial.write(json + '\n');
    setTimeout(resolve, 200);
  });
}

function wait(ms, msg) {
  return new Promise((resolve) => {
    if (msg) console.log(`\n⏳ ${msg}`);
    setTimeout(resolve, ms);
  });
}

async function stopMotors() {
  await send({ N: 201 }, 'stop');
}

async function runTests() {
  console.log('Opening serial port...');
  
  await new Promise((resolve, reject) => {
    serial.on('open', resolve);
    serial.on('error', reject);
  });

  console.log('Port opened. Waiting for firmware init sequence...\n');
  await wait(INIT_WAIT);

  // Test 1: Hello/ping
  console.log(`\n${'─'.repeat(60)}`);
  console.log('TEST 0: Communication Check');
  console.log(`${'─'.repeat(60)}`);
  await send({ N: 0 }, 'hello');
  await wait(300);

  // Test 2: Left wheel motors only (forward)
  console.log(`\n${'─'.repeat(60)}`);
  console.log('TEST 1: LEFT WHEELS ONLY - FORWARD');
  console.log('Expected: Only LEFT side wheels should spin FORWARD');
  console.log(`${'─'.repeat(60)}`);
  await send({ N: 999, D1: PWM, D2: 0 }, 'left_fwd');
  await wait(DURATION, `Running LEFT wheels forward for ${DURATION}ms...`);
  await stopMotors();
  await wait(1000, 'Stopped. Pausing before next test...');

  // Test 3: Left wheel motors only (reverse)
  console.log(`\n${'─'.repeat(60)}`);
  console.log('TEST 2: LEFT WHEELS ONLY - REVERSE');
  console.log('Expected: Only LEFT side wheels should spin REVERSE');
  console.log(`${'─'.repeat(60)}`);
  await send({ N: 999, D1: -PWM, D2: 0 }, 'left_rev');
  await wait(DURATION, `Running LEFT wheels reverse for ${DURATION}ms...`);
  await stopMotors();
  await wait(1000, 'Stopped. Pausing before next test...');

  // Test 4: Right wheel motors only (forward)
  console.log(`\n${'─'.repeat(60)}`);
  console.log('TEST 3: RIGHT WHEELS ONLY - FORWARD');
  console.log('Expected: Only RIGHT side wheels should spin FORWARD');
  console.log(`${'─'.repeat(60)}`);
  await send({ N: 999, D1: 0, D2: PWM }, 'right_fwd');
  await wait(DURATION, `Running RIGHT wheels forward for ${DURATION}ms...`);
  await stopMotors();
  await wait(1000, 'Stopped. Pausing before next test...');

  // Test 5: Right wheel motors only (reverse)
  console.log(`\n${'─'.repeat(60)}`);
  console.log('TEST 4: RIGHT WHEELS ONLY - REVERSE');
  console.log('Expected: Only RIGHT side wheels should spin REVERSE');
  console.log(`${'─'.repeat(60)}`);
  await send({ N: 999, D1: 0, D2: -PWM }, 'right_rev');
  await wait(DURATION, `Running RIGHT wheels reverse for ${DURATION}ms...`);
  await stopMotors();
  await wait(1000, 'Stopped. Pausing before next test...');

  // Test 6: Servo - center
  console.log(`\n${'─'.repeat(60)}`);
  console.log('TEST 5: SERVO - CENTER (90°)');
  console.log('Expected: Servo should move to CENTER position');
  console.log(`${'─'.repeat(60)}`);
  await send({ N: 5, D1: 90 }, 'servo_90');
  await wait(1500, 'Servo moving to 90°...');

  // Test 7: Servo - left
  console.log(`\n${'─'.repeat(60)}`);
  console.log('TEST 6: SERVO - LEFT (0°)');
  console.log('Expected: Servo should move to FULL LEFT');
  console.log(`${'─'.repeat(60)}`);
  await send({ N: 5, D1: 0 }, 'servo_0');
  await wait(1500, 'Servo moving to 0°...');

  // Test 8: Servo - right
  console.log(`\n${'─'.repeat(60)}`);
  console.log('TEST 7: SERVO - RIGHT (180°)');
  console.log('Expected: Servo should move to FULL RIGHT');
  console.log(`${'─'.repeat(60)}`);
  await send({ N: 5, D1: 180 }, 'servo_180');
  await wait(1500, 'Servo moving to 180°...');

  // Return servo to center
  console.log(`\n${'─'.repeat(60)}`);
  console.log('CLEANUP: Returning servo to center');
  console.log(`${'─'.repeat(60)}`);
  await send({ N: 5, D1: 90 }, 'servo_center');
  await wait(1000);

  // Summary
  console.log(`\n${'═'.repeat(60)}`);
  console.log('TEST COMPLETE');
  console.log(`${'═'.repeat(60)}`);
  console.log('\nVerify each component moved as described:');
  console.log('  ✓ TEST 1: LEFT wheels forward');
  console.log('  ✓ TEST 2: LEFT wheels reverse');
  console.log('  ✓ TEST 3: RIGHT wheels forward');
  console.log('  ✓ TEST 4: RIGHT wheels reverse');
  console.log('  ✓ TEST 5: Servo CENTER (90°)');
  console.log('  ✓ TEST 6: Servo LEFT (0°)');
  console.log('  ✓ TEST 7: Servo RIGHT (180°)');
  console.log('\nIf any motor did NOT move as expected, check:');
  console.log('  - Motor wiring connections');
  console.log('  - Battery power level');
  console.log('  - Motor driver STBY pin (D3)');
  console.log('');

  serial.close();
  process.exit(0);
}

runTests().catch((err) => {
  console.error('Test error:', err);
  serial.close();
  process.exit(1);
});

