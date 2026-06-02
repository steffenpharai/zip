#!/usr/bin/env node

/**
 * Serial Motor Bringup Tool - Extended Motion Tests
 * 
 * Comprehensive hardware verification for ZIP Robot firmware.
 * Tests motor control, servo, sensors, and macro functionality.
 * SLOW MOTION TESTS - designed to keep robot within 0.5 foot radius
 * 
 * Usage:
 *   node serial_motor_bringup.js [PORT] [--quick] [--motion-only]
 * 
 * Example:
 *   node serial_motor_bringup.js COM5
 *   node serial_motor_bringup.js COM5 --quick        # Basic motor only
 *   node serial_motor_bringup.js COM5 --motion-only  # Extended motion only
 */

const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');
const fs = require('fs');
const path = require('path');

// Configuration
const BAUD_RATE = 115200;
const RESET_DELAY_MS = 600;
const INIT_SEQUENCE_MS = 3500;  // Wait for init sequence to complete (bootloader + setup + init ~3s)

// SLOW MOTION SETTINGS - Keep robot within 0.5 foot radius
const SLOW_PWM = 80;        // Very slow speed (0-255)
const MEDIUM_PWM = 100;     // Medium slow speed
const CREEP_PWM = 60;       // Creeping speed
const MICRO_DURATION = 200; // 200ms micro movements
const SHORT_DURATION = 400; // 400ms short movements
const MEDIUM_DURATION = 600; // 600ms medium movements
const PAUSE_DURATION = 300;  // Pause between movements

// Log file path
const LOG_PATH = path.join(__dirname, '..', '..', '..', '..', '.cursor', 'debug.log');

// Ensure log directory exists
const logDir = path.dirname(LOG_PATH);
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// Clear previous log file
try {
  if (fs.existsSync(LOG_PATH)) {
    fs.unlinkSync(LOG_PATH);
  }
} catch (e) {
  console.error(`Warning: Could not clear log file: ${e.message}`);
}

// Write NDJSON log entry
function logEntry(entry) {
  const line = JSON.stringify({
    ...entry,
    timestamp: Date.now(),
    sessionId: 'motion-test'
  }) + '\n';
  fs.appendFileSync(LOG_PATH, line);
}

// Parse command line
const port = process.argv[2];
const quickMode = process.argv.includes('--quick');
const motionOnly = process.argv.includes('--motion-only');

if (!port) {
  console.error('Usage: node serial_motor_bringup.js [PORT] [--quick] [--motion-only]');
  console.error('Example: node serial_motor_bringup.js COM5');
  console.error('\nModes:');
  console.error('  (default)      Full test suite');
  console.error('  --quick        Basic motor control only');
  console.error('  --motion-only  Extended motion tests only');
  console.error('\nAvailable ports:');
  SerialPort.list().then(ports => {
    ports.forEach(p => console.error(`  ${p.path} - ${p.manufacturer || 'Unknown'}`));
  });
  process.exit(1);
}

console.log('=== ZIP Robot Extended Motion Test ===\n');
console.log(`Port: ${port}`);
console.log(`Baud: ${BAUD_RATE}`);
console.log(`Mode: ${quickMode ? 'Quick' : motionOnly ? 'Motion Only' : 'Full'}`);
console.log(`Speed: SLOW (PWM ${CREEP_PWM}-${MEDIUM_PWM}) - 0.5ft radius safe`);
console.log(`Log:  ${LOG_PATH}`);
console.log('');

logEntry({ location: 'test:start', message: 'Motion test starting', data: { port, quickMode, motionOnly } });

// Open serial port
const serial = new SerialPort({
  path: port,
  baudRate: BAUD_RATE,
  autoOpen: false
});

const parser = serial.pipe(new ReadlineParser({ delimiter: '\n' }));

// Response tracking
let allResponses = [];
let testResults = {
  motorDirect: { passed: 0, failed: 0 },
  motorStop: { passed: 0, failed: 0 },
  forwardBack: { passed: 0, failed: 0 },
  pivotTurns: { passed: 0, failed: 0 },
  arcTurns: { passed: 0, failed: 0 },
  wiggle: { passed: 0, failed: 0 },
  gradualSpeed: { passed: 0, failed: 0 },
  setpointStream: { passed: 0, failed: 0 },
  servo: { passed: 0, failed: 0 },
  sensors: { passed: 0, failed: 0 },
  macro: { passed: 0, failed: 0 }
};

// Handle incoming lines
parser.on('data', (line) => {
  line = line.trim();
  if (line.length > 0) {
    console.log(`<< ${line}`);
    allResponses.push({ time: Date.now(), line });
    logEntry({ location: 'serial:rx', message: 'RX', data: { line } });
  }
});

// Send command
function send(cmd) {
  console.log(`>> ${cmd}`);
  logEntry({ location: 'serial:tx', message: 'TX', data: { cmd } });
  serial.write(cmd + '\n');
}

// Sleep helper
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Send direct motor command and wait
async function directMotor(left, right, durationMs, label = '') {
  const tag = label || `L${left}R${right}`;
  send(`{"N":999,"H":"${tag}","D1":${left},"D2":${right}}`);
  await sleep(durationMs);
}

// Stop motors
async function stopMotors(label = 'stop') {
  send(`{"N":201,"H":"${label}"}`);
  await sleep(100);
}

// Check diagnostics
async function checkState() {
  send('{"N":120,"H":"chk"}');
  await sleep(80);
}

// ============================================================
// PHASE 1: Basic Motor Control (Quick Test)
// ============================================================
async function testBasicMotor() {
  console.log('\n' + '═'.repeat(60));
  console.log('PHASE 1: Basic Motor Control');
  console.log('═'.repeat(60));
  
  for (let i = 1; i <= 3; i++) {
    console.log(`\n[Basic ${i}/3] Forward pulse...`);
    await directMotor(SLOW_PWM, SLOW_PWM, SHORT_DURATION, `fwd${i}`);
    await checkState();
    await stopMotors(`stop${i}`);
    await sleep(PAUSE_DURATION);
    
    // Check results
    const hasRun = allResponses.some(r => r.line.includes(`fwd${i}_ok`));
    const hasStop = allResponses.some(r => r.line.includes(`stop${i}_ok`));
    
    if (hasRun) testResults.motorDirect.passed++;
    else testResults.motorDirect.failed++;
    
    if (hasStop) testResults.motorStop.passed++;
    else testResults.motorStop.failed++;
    
    console.log(`[Basic ${i}/3] run=${hasRun ? '✓' : '✗'}, stop=${hasStop ? '✓' : '✗'}`);
  }
}

// ============================================================
// PHASE 2: Forward/Backward Micro Movements
// ============================================================
async function testForwardBackward() {
  console.log('\n' + '═'.repeat(60));
  console.log('PHASE 2: Forward/Backward Micro Movements');
  console.log('═'.repeat(60));
  
  const moves = [
    { l: CREEP_PWM, r: CREEP_PWM, dur: MICRO_DURATION, name: 'creep_fwd' },
    { l: -CREEP_PWM, r: -CREEP_PWM, dur: MICRO_DURATION, name: 'creep_back' },
    { l: SLOW_PWM, r: SLOW_PWM, dur: SHORT_DURATION, name: 'slow_fwd' },
    { l: -SLOW_PWM, r: -SLOW_PWM, dur: SHORT_DURATION, name: 'slow_back' },
    { l: CREEP_PWM, r: CREEP_PWM, dur: MEDIUM_DURATION, name: 'med_fwd' },
    { l: -CREEP_PWM, r: -CREEP_PWM, dur: MEDIUM_DURATION, name: 'med_back' },
  ];
  
  for (const move of moves) {
    console.log(`\n[FwdBack] ${move.name}: L=${move.l}, R=${move.r}, ${move.dur}ms`);
    const startIdx = allResponses.length;
    
    await directMotor(move.l, move.r, move.dur, move.name);
    await stopMotors(`${move.name}_s`);
    await sleep(PAUSE_DURATION);
    
    const hasAck = allResponses.slice(startIdx).some(r => r.line.includes('_ok'));
    if (hasAck) testResults.forwardBack.passed++;
    else testResults.forwardBack.failed++;
    
    console.log(`[FwdBack] ${move.name}: ${hasAck ? '✓' : '✗'}`);
  }
}

// ============================================================
// PHASE 3: Pivot Turns (Spin in Place)
// ============================================================
async function testPivotTurns() {
  console.log('\n' + '═'.repeat(60));
  console.log('PHASE 3: Pivot Turns (Spin in Place)');
  console.log('═'.repeat(60));
  
  const pivots = [
    { l: CREEP_PWM, r: -CREEP_PWM, dur: MICRO_DURATION, name: 'pivot_R_micro' },
    { l: -CREEP_PWM, r: CREEP_PWM, dur: MICRO_DURATION, name: 'pivot_L_micro' },
    { l: SLOW_PWM, r: -SLOW_PWM, dur: SHORT_DURATION, name: 'pivot_R_short' },
    { l: -SLOW_PWM, r: SLOW_PWM, dur: SHORT_DURATION, name: 'pivot_L_short' },
    { l: CREEP_PWM, r: -CREEP_PWM, dur: MEDIUM_DURATION, name: 'pivot_R_med' },
    { l: -CREEP_PWM, r: CREEP_PWM, dur: MEDIUM_DURATION, name: 'pivot_L_med' },
  ];
  
  for (const pivot of pivots) {
    console.log(`\n[Pivot] ${pivot.name}: L=${pivot.l}, R=${pivot.r}, ${pivot.dur}ms`);
    const startIdx = allResponses.length;
    
    await directMotor(pivot.l, pivot.r, pivot.dur, pivot.name);
    await stopMotors(`${pivot.name}_s`);
    await sleep(PAUSE_DURATION);
    
    const hasAck = allResponses.slice(startIdx).some(r => r.line.includes('_ok'));
    if (hasAck) testResults.pivotTurns.passed++;
    else testResults.pivotTurns.failed++;
    
    console.log(`[Pivot] ${pivot.name}: ${hasAck ? '✓' : '✗'}`);
  }
}

// ============================================================
// PHASE 4: Arc Turns (Gentle Curves)
// ============================================================
async function testArcTurns() {
  console.log('\n' + '═'.repeat(60));
  console.log('PHASE 4: Arc Turns (Gentle Curves)');
  console.log('═'.repeat(60));
  
  const arcs = [
    // Wide arcs (one wheel faster)
    { l: SLOW_PWM, r: CREEP_PWM, dur: SHORT_DURATION, name: 'arc_R_wide' },
    { l: CREEP_PWM, r: SLOW_PWM, dur: SHORT_DURATION, name: 'arc_L_wide' },
    // Tight arcs (one wheel stopped)
    { l: SLOW_PWM, r: 0, dur: MICRO_DURATION, name: 'arc_R_tight' },
    { l: 0, r: SLOW_PWM, dur: MICRO_DURATION, name: 'arc_L_tight' },
    // Reverse arcs
    { l: -SLOW_PWM, r: -CREEP_PWM, dur: SHORT_DURATION, name: 'arc_R_rev' },
    { l: -CREEP_PWM, r: -SLOW_PWM, dur: SHORT_DURATION, name: 'arc_L_rev' },
  ];
  
  for (const arc of arcs) {
    console.log(`\n[Arc] ${arc.name}: L=${arc.l}, R=${arc.r}, ${arc.dur}ms`);
    const startIdx = allResponses.length;
    
    await directMotor(arc.l, arc.r, arc.dur, arc.name);
    await stopMotors(`${arc.name}_s`);
    await sleep(PAUSE_DURATION);
    
    const hasAck = allResponses.slice(startIdx).some(r => r.line.includes('_ok'));
    if (hasAck) testResults.arcTurns.passed++;
    else testResults.arcTurns.failed++;
    
    console.log(`[Arc] ${arc.name}: ${hasAck ? '✓' : '✗'}`);
  }
}

// ============================================================
// PHASE 5: Wiggle Pattern (Side to Side)
// ============================================================
async function testWiggle() {
  console.log('\n' + '═'.repeat(60));
  console.log('PHASE 5: Wiggle Pattern (Side to Side)');
  console.log('═'.repeat(60));
  
  console.log('\n[Wiggle] Starting wiggle sequence...');
  const startIdx = allResponses.length;
  
  // Rapid left-right-left-right
  for (let i = 0; i < 4; i++) {
    const dir = i % 2 === 0 ? 1 : -1;
    await directMotor(dir * CREEP_PWM, -dir * CREEP_PWM, MICRO_DURATION, `wig${i}`);
  }
  await stopMotors('wig_stop');
  await sleep(PAUSE_DURATION);
  
  const acks = allResponses.slice(startIdx).filter(r => r.line.includes('_ok')).length;
  if (acks >= 4) testResults.wiggle.passed++;
  else testResults.wiggle.failed++;
  
  console.log(`[Wiggle] Received ${acks}/5 ACKs: ${acks >= 4 ? '✓' : '✗'}`);
}

// ============================================================
// PHASE 6: Gradual Speed Changes (Ramp Up/Down)
// ============================================================
async function testGradualSpeed() {
  console.log('\n' + '═'.repeat(60));
  console.log('PHASE 6: Gradual Speed Changes');
  console.log('═'.repeat(60));
  
  console.log('\n[Ramp] Accelerating forward...');
  const startIdx = allResponses.length;
  
  // Ramp up
  const speeds = [40, 60, 80, 100, 80, 60, 40, 0];
  for (const spd of speeds) {
    await directMotor(spd, spd, 150, `ramp${spd}`);
  }
  await stopMotors('ramp_s');
  await sleep(PAUSE_DURATION);
  
  const acks = allResponses.slice(startIdx).filter(r => r.line.includes('_ok')).length;
  if (acks >= speeds.length) testResults.gradualSpeed.passed++;
  else testResults.gradualSpeed.failed++;
  
  console.log(`[Ramp] Received ${acks}/${speeds.length + 1} ACKs: ${acks >= speeds.length ? '✓' : '✗'}`);
  
  // Ramp with direction change
  console.log('\n[Ramp] Forward-reverse-forward sequence...');
  const seq = [
    { l: CREEP_PWM, r: CREEP_PWM, name: 'seq_fwd' },
    { l: 0, r: 0, name: 'seq_pause' },
    { l: -CREEP_PWM, r: -CREEP_PWM, name: 'seq_rev' },
    { l: 0, r: 0, name: 'seq_pause2' },
    { l: CREEP_PWM, r: CREEP_PWM, name: 'seq_fwd2' },
  ];
  
  for (const step of seq) {
    await directMotor(step.l, step.r, MICRO_DURATION, step.name);
  }
  await stopMotors('seq_s');
  await sleep(PAUSE_DURATION);
}

// ============================================================
// PHASE 7: Setpoint Streaming (N=200)
// ============================================================
async function testSetpointStreaming() {
  console.log('\n' + '═'.repeat(60));
  console.log('PHASE 7: Setpoint Streaming (N=200)');
  console.log('═'.repeat(60));
  
  console.log('\n[Stream] Slow forward stream (10 packets)...');
  const startIdx = allResponses.length;
  
  // Stream setpoint commands (v=forward, w=yaw)
  for (let i = 0; i < 10; i++) {
    send(`{"N":200,"D1":50,"D2":0,"T":200}`);  // Slow forward
    await sleep(100);
  }
  await stopMotors('stream_s1');
  await checkState();
  await sleep(PAUSE_DURATION);
  
  // Stream with yaw (gentle turn)
  console.log('[Stream] Slow turn stream (10 packets)...');
  for (let i = 0; i < 10; i++) {
    send(`{"N":200,"D1":40,"D2":30,"T":200}`);  // Slow arc
    await sleep(100);
  }
  await stopMotors('stream_s2');
  await checkState();
  await sleep(PAUSE_DURATION);
  
  // Stream reverse
  console.log('[Stream] Slow reverse stream (5 packets)...');
  for (let i = 0; i < 5; i++) {
    send(`{"N":200,"D1":-40,"D2":0,"T":200}`);  // Slow reverse
    await sleep(100);
  }
  await stopMotors('stream_s3');
  await checkState();
  await sleep(PAUSE_DURATION);
  
  const stops = allResponses.slice(startIdx).filter(r => r.line.includes('_ok')).length;
  if (stops >= 3) testResults.setpointStream.passed++;
  else testResults.setpointStream.failed++;
  
  console.log(`[Stream] Stop confirmations: ${stops}/3: ${stops >= 3 ? '✓' : '✗'}`);
}

// ============================================================
// PHASE 8: Complex Motion Sequence (Mini Figure-8)
// ============================================================
async function testComplexSequence() {
  console.log('\n' + '═'.repeat(60));
  console.log('PHASE 8: Complex Motion Sequence');
  console.log('═'.repeat(60));
  
  console.log('\n[Complex] Mini figure-8 pattern...');
  
  // Mini figure-8 (very small movements)
  const figure8 = [
    // Right arc forward
    { l: SLOW_PWM, r: CREEP_PWM, dur: SHORT_DURATION, name: 'f8_r1' },
    // Continue right arc
    { l: SLOW_PWM, r: CREEP_PWM, dur: SHORT_DURATION, name: 'f8_r2' },
    // Cross over - left arc forward
    { l: CREEP_PWM, r: SLOW_PWM, dur: SHORT_DURATION, name: 'f8_l1' },
    // Continue left arc
    { l: CREEP_PWM, r: SLOW_PWM, dur: SHORT_DURATION, name: 'f8_l2' },
  ];
  
  for (const step of figure8) {
    await directMotor(step.l, step.r, step.dur, step.name);
  }
  await stopMotors('f8_s');
  await sleep(PAUSE_DURATION);
  
  console.log('\n[Complex] Box pattern (micro)...');
  
  // Micro box pattern
  const box = [
    { l: CREEP_PWM, r: CREEP_PWM, dur: MICRO_DURATION, name: 'box_fwd' },
    { l: CREEP_PWM, r: -CREEP_PWM, dur: MICRO_DURATION, name: 'box_turn1' },
    { l: CREEP_PWM, r: CREEP_PWM, dur: MICRO_DURATION, name: 'box_fwd2' },
    { l: CREEP_PWM, r: -CREEP_PWM, dur: MICRO_DURATION, name: 'box_turn2' },
    { l: CREEP_PWM, r: CREEP_PWM, dur: MICRO_DURATION, name: 'box_fwd3' },
    { l: CREEP_PWM, r: -CREEP_PWM, dur: MICRO_DURATION, name: 'box_turn3' },
    { l: CREEP_PWM, r: CREEP_PWM, dur: MICRO_DURATION, name: 'box_fwd4' },
    { l: CREEP_PWM, r: -CREEP_PWM, dur: MICRO_DURATION, name: 'box_turn4' },
  ];
  
  for (const step of box) {
    await directMotor(step.l, step.r, step.dur, step.name);
  }
  await stopMotors('box_s');
  await sleep(PAUSE_DURATION);
  
  console.log('[Complex] Patterns complete');
}

// ============================================================
// PHASE 9: Servo Control
// ============================================================
async function testServo() {
  console.log('\n' + '═'.repeat(60));
  console.log('PHASE 9: Servo Control');
  console.log('═'.repeat(60));
  
  const angles = [90, 45, 135, 90, 60, 120, 90];
  
  for (const angle of angles) {
    const startIdx = allResponses.length;
    console.log(`\n[Servo] Pan to ${angle}°`);
    send(`{"N":5,"H":"srv${angle}","D1":${angle}}`);
    await sleep(350);
    
    const hasAck = allResponses.slice(startIdx).some(r => r.line.includes('_ok'));
    if (hasAck) testResults.servo.passed++;
    else testResults.servo.failed++;
    
    console.log(`[Servo] ${angle}°: ${hasAck ? '✓' : '✗'}`);
  }
}

// ============================================================
// PHASE 10: Sensor Reads (with value validation)
// ============================================================
async function testSensors() {
  console.log('\n' + '═'.repeat(60));
  console.log('PHASE 10: Sensor Reads');
  console.log('═'.repeat(60));
  
  // Helper: Parse sensor value from response like {H_123}
  const parseSensorValue = (responses, tag) => {
    for (const r of responses) {
      // Match pattern like {tag_123} or {tag_true} or {tag_false}
      const match = r.line.match(new RegExp(`\\{${tag}_([^}]+)\\}`));
      if (match) {
        return match[1];
      }
    }
    return null;
  };
  
  // Ultrasonic distance mode (D1=2)
  console.log('\n[Sensors] Ultrasonic distance (D1=2)...');
  let startIdx = allResponses.length;
  send('{"N":21,"H":"ultra","D1":2}');
  await sleep(200);
  let value = parseSensorValue(allResponses.slice(startIdx), 'ultra');
  if (value !== null) {
    const distance = parseInt(value, 10);
    if (!isNaN(distance) && distance >= 0) {
      testResults.sensors.passed++;
      console.log(`[Sensors] Ultrasonic distance: ${distance}cm ✓`);
    } else {
      testResults.sensors.failed++;
      console.log(`[Sensors] Ultrasonic distance: invalid value "${value}" ✗`);
    }
  } else {
    testResults.sensors.failed++;
    console.log('[Sensors] Ultrasonic distance: no response ✗');
  }
  
  // Ultrasonic obstacle mode (D1=1)
  console.log('[Sensors] Ultrasonic obstacle (D1=1)...');
  startIdx = allResponses.length;
  send('{"N":21,"H":"obs","D1":1}');
  await sleep(200);
  value = parseSensorValue(allResponses.slice(startIdx), 'obs');
  if (value === 'true' || value === 'false') {
    testResults.sensors.passed++;
    console.log(`[Sensors] Ultrasonic obstacle: ${value} ✓`);
  } else {
    testResults.sensors.failed++;
    console.log(`[Sensors] Ultrasonic obstacle: invalid response ✗`);
  }
  
  // Line sensors (L/M/R)
  for (let i = 0; i <= 2; i++) {
    const name = ['Left', 'Middle', 'Right'][i];
    const tag = `line${i}`;
    console.log(`[Sensors] Line sensor ${name}...`);
    startIdx = allResponses.length;
    send(`{"N":22,"H":"${tag}","D1":${i}}`);
    await sleep(150);
    
    value = parseSensorValue(allResponses.slice(startIdx), tag);
    if (value !== null) {
      const sensorVal = parseInt(value, 10);
      if (!isNaN(sensorVal) && sensorVal >= 0 && sensorVal <= 1023) {
        testResults.sensors.passed++;
        console.log(`[Sensors] ${name}: ${sensorVal} ✓`);
      } else {
        testResults.sensors.failed++;
        console.log(`[Sensors] ${name}: invalid value "${value}" ✗`);
      }
    } else {
      testResults.sensors.failed++;
      console.log(`[Sensors] ${name}: no response ✗`);
    }
  }
  
  // Battery voltage (N=23)
  console.log('[Sensors] Battery voltage...');
  startIdx = allResponses.length;
  send('{"N":23,"H":"batt"}');
  await sleep(150);
  value = parseSensorValue(allResponses.slice(startIdx), 'batt');
  if (value !== null) {
    const voltage_mv = parseInt(value, 10);
    if (!isNaN(voltage_mv) && voltage_mv >= 0) {
      const voltage_v = (voltage_mv / 1000).toFixed(2);
      testResults.sensors.passed++;
      console.log(`[Sensors] Battery: ${voltage_v}V (${voltage_mv}mV) ✓`);
    } else {
      testResults.sensors.failed++;
      console.log(`[Sensors] Battery: invalid value "${value}" ✗`);
    }
  } else {
    testResults.sensors.failed++;
    console.log('[Sensors] Battery: no response ✗');
  }
}

// ============================================================
// PHASE 11: Macro Execution
// ============================================================
async function testMacro() {
  console.log('\n' + '═'.repeat(60));
  console.log('PHASE 11: Macro Execution');
  console.log('═'.repeat(60));
  
  // Start macro
  console.log('\n[Macro] Starting FORWARD_THEN_STOP...');
  let startIdx = allResponses.length;
  send('{"N":210,"H":"mac","D1":4}');
  await sleep(300);
  
  if (allResponses.slice(startIdx).some(r => r.line.includes('_ok'))) {
    testResults.macro.passed++;
    console.log('[Macro] Start: ✓');
  } else {
    testResults.macro.failed++;
    console.log('[Macro] Start: ✗');
  }
  
  // Let it run briefly
  await sleep(400);
  
  // Cancel
  console.log('[Macro] Cancelling...');
  startIdx = allResponses.length;
  send('{"N":211,"H":"can"}');
  await sleep(200);
  
  if (allResponses.slice(startIdx).some(r => r.line.includes('_ok'))) {
    testResults.macro.passed++;
    console.log('[Macro] Cancel: ✓');
  } else {
    testResults.macro.failed++;
    console.log('[Macro] Cancel: ✗');
  }
  
  await stopMotors('mac_final');
}

// ============================================================
// MAIN TEST SEQUENCE
// ============================================================
async function runTest() {
  try {
    console.log('Opening port...');
    await new Promise((resolve, reject) => {
      serial.open((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    console.log('Port opened.\n');
    
    console.log(`Waiting ${RESET_DELAY_MS}ms for DTR reset...`);
    await sleep(RESET_DELAY_MS);
    
    // Wait for init sequence to complete
    console.log(`Waiting ${INIT_SEQUENCE_MS}ms for init sequence...`);
    await sleep(INIT_SEQUENCE_MS);
    
    // Hello handshake
    console.log('\n--- Hello Handshake ---');
    send('{"N":0,"H":"start"}');
    await sleep(200);
    
    // Run appropriate tests based on mode
    if (quickMode) {
      await testBasicMotor();
    } else if (motionOnly) {
      await testBasicMotor();
      await testForwardBackward();
      await testPivotTurns();
      await testArcTurns();
      await testWiggle();
      await testGradualSpeed();
      await testSetpointStreaming();
      await testComplexSequence();
    } else {
      // Full test
      await testBasicMotor();
      await testForwardBackward();
      await testPivotTurns();
      await testArcTurns();
      await testWiggle();
      await testGradualSpeed();
      await testSetpointStreaming();
      await testComplexSequence();
      await testServo();
      await testSensors();
      await testMacro();
    }
    
    // Final safety stop
    await stopMotors('FINAL');
    await sleep(100);
    
  } catch (error) {
    console.error('\n❌ Test error:', error.message);
    logEntry({ location: 'test:error', message: 'Error', data: { error: error.message } });
  } finally {
    console.log('\n--- Closing port ---');
    serial.close();
    
    // Print summary
    console.log('\n' + '═'.repeat(60));
    console.log('TEST SUMMARY');
    console.log('═'.repeat(60));
    console.log(`Total responses: ${allResponses.length}`);
    console.log('');
    
    console.log('Test Phase            Passed  Failed  Status');
    console.log('─'.repeat(60));
    
    let allPassed = true;
    
    const printResult = (name, result, minPass = 1) => {
      if (result.passed === 0 && result.failed === 0) return;
      const ok = result.passed >= minPass && result.failed === 0;
      if (!ok) allPassed = false;
      const status = ok ? '✓ PASS' : '✗ FAIL';
      console.log(`${name.padEnd(22)} ${String(result.passed).padStart(6)}  ${String(result.failed).padStart(6)}  ${status}`);
    };
    
    printResult('Motor Direct', testResults.motorDirect, 3);
    printResult('Motor Stop', testResults.motorStop, 3);
    printResult('Forward/Backward', testResults.forwardBack, 6);
    printResult('Pivot Turns', testResults.pivotTurns, 6);
    printResult('Arc Turns', testResults.arcTurns, 6);
    printResult('Wiggle', testResults.wiggle, 1);
    printResult('Gradual Speed', testResults.gradualSpeed, 1);
    printResult('Setpoint Stream', testResults.setpointStream, 1);
    printResult('Servo', testResults.servo, 7);
    printResult('Sensors', testResults.sensors, 4);
    printResult('Macro', testResults.macro, 2);
    
    console.log('─'.repeat(60));
    
    logEntry({
      location: 'test:summary',
      message: 'Complete',
      data: { responses: allResponses.length, results: testResults, allPassed }
    });
    
    console.log(`\nLog: ${LOG_PATH}`);
    
    if (!allPassed) {
      console.log('\n⚠️  SOME TESTS FAILED');
      process.exit(1);
    } else {
      console.log('\n✓ All tests passed!');
      process.exit(0);
    }
  }
}

serial.on('error', (err) => {
  console.error('Serial error:', err.message);
});

runTest().catch(console.error);
