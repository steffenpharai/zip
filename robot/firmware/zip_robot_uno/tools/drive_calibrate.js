#!/usr/bin/env node

/**
 * Drive Calibration Tool
 * 
 * Determines optimal deadband values for each motor by stepping through
 * PWM values and asking the user to observe when movement begins.
 * 
 * Usage:
 *   node drive_calibrate.js [PORT]
 * 
 * Example:
 *   node drive_calibrate.js COM5
 */

const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');
const readline = require('readline');
const fs = require('fs');
const path = require('path');

// Configuration
const BAUD_RATE = 115200;
const RESET_DELAY_MS = 600;
const PWM_MIN = 40;
const PWM_MAX = 120;
const PWM_STEP = 5;
const PULSE_DURATION_MS = 300;
const PAUSE_DURATION_MS = 200;

// Log file path
const LOG_PATH = path.join(__dirname, '..', '..', '..', '..', '.cursor', 'debug.log');

// Ensure log directory exists
const logDir = path.dirname(LOG_PATH);
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// Write NDJSON log entry
function logEntry(entry) {
  const line = JSON.stringify({
    ...entry,
    timestamp: Date.now(),
    sessionId: 'drive-calibrate'
  }) + '\n';
  fs.appendFileSync(LOG_PATH, line);
}

// Parse command line
const port = process.argv[2];

if (!port) {
  console.error('Drive Calibration Tool - Determine optimal deadband values');
  console.error('');
  console.error('Usage: node drive_calibrate.js [PORT]');
  console.error('Example: node drive_calibrate.js COM5');
  console.error('');
  console.error('Available ports:');
  SerialPort.list().then(ports => {
    ports.forEach(p => console.error(`  ${p.path} - ${p.manufacturer || 'Unknown'}`));
  });
  process.exit(1);
}

console.log('╔════════════════════════════════════════════════════════════════╗');
console.log('║           ZIP Robot Drive Calibration Tool                     ║');
console.log('╚════════════════════════════════════════════════════════════════╝');
console.log('');
console.log(`Port: ${port}`);
console.log(`Baud: ${BAUD_RATE}`);
console.log(`PWM Range: ${PWM_MIN} - ${PWM_MAX} (step ${PWM_STEP})`);
console.log(`Log: ${LOG_PATH}`);
console.log('');

logEntry({ location: 'calibrate:start', message: 'Calibration starting', data: { port } });

// Open serial port
const serial = new SerialPort({
  path: port,
  baudRate: BAUD_RATE,
  autoOpen: false
});

const parser = serial.pipe(new ReadlineParser({ delimiter: '\n' }));

// Response tracking
let allResponses = [];
let calibrationResults = {
  leftDeadband: 0,
  rightDeadband: 0,
  leftFirstMovePwm: 0,
  rightFirstMovePwm: 0
};

// Create readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Handle incoming lines
parser.on('data', (line) => {
  line = line.trim();
  if (line.length > 0) {
    allResponses.push({ time: Date.now(), line });
    // Only show relevant responses
    if (line.includes('_ok') || line.includes('INIT') || line.includes('HW:')) {
      console.log(`<< ${line}`);
    }
  }
});

// Send command
function send(cmd) {
  serial.write(cmd + '\n');
}

// Sleep helper
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Stop motors
async function stopMotors() {
  send('{"N":201,"H":"stop"}');
  await sleep(100);
}

// Prompt user for yes/no
function askYesNo(question) {
  return new Promise((resolve) => {
    rl.question(question + ' (y/n): ', (answer) => {
      resolve(answer.toLowerCase().startsWith('y'));
    });
  });
}

// Prompt user for number
function askNumber(question, defaultVal) {
  return new Promise((resolve) => {
    rl.question(`${question} [${defaultVal}]: `, (answer) => {
      const num = parseInt(answer, 10);
      resolve(isNaN(num) ? defaultVal : num);
    });
  });
}

// Calibrate a single wheel
async function calibrateWheel(wheelName, isLeft) {
  console.log('');
  console.log(`═══════════════════════════════════════════════════════════════`);
  console.log(`  Calibrating ${wheelName.toUpperCase()} wheel`);
  console.log(`═══════════════════════════════════════════════════════════════`);
  console.log('');
  console.log(`Watch the ${wheelName} wheel carefully.`);
  console.log('For each PWM value, indicate if the wheel MOVED (y) or NOT (n).');
  console.log('');
  
  let deadband = 0;
  
  for (let pwm = PWM_MIN; pwm <= PWM_MAX; pwm += PWM_STEP) {
    // Pulse the wheel
    const leftPwm = isLeft ? pwm : 0;
    const rightPwm = isLeft ? 0 : pwm;
    
    console.log(`\n[PWM ${pwm}] Pulsing ${wheelName} wheel...`);
    send(`{"N":999,"H":"cal","D1":${leftPwm},"D2":${rightPwm}}`);
    await sleep(PULSE_DURATION_MS);
    await stopMotors();
    await sleep(PAUSE_DURATION_MS);
    
    const moved = await askYesNo(`Did the ${wheelName} wheel move?`);
    
    logEntry({
      location: 'calibrate:pulse',
      message: `${wheelName} wheel PWM ${pwm}`,
      data: { wheelName, pwm, moved }
    });
    
    if (moved) {
      deadband = pwm;
      console.log(`\n✓ ${wheelName.toUpperCase()} wheel first moved at PWM ${pwm}`);
      break;
    }
  }
  
  if (deadband === 0) {
    console.log(`\n⚠ ${wheelName.toUpperCase()} wheel did not move within PWM range ${PWM_MIN}-${PWM_MAX}`);
    deadband = PWM_MAX;
  }
  
  return deadband;
}

// Main calibration routine
async function runCalibration() {
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
    
    // Wait for init sequence to complete (bootloader + setup + init ~3s)
    console.log('Waiting 3500ms for init sequence to complete...');
    await sleep(3500);
    
    // Hello handshake
    console.log('\n--- Hello Handshake ---');
    send('{"N":0,"H":"cal_hello"}');
    await sleep(200);
    
    // Safety stop
    await stopMotors();
    
    console.log('\n╔════════════════════════════════════════════════════════════════╗');
    console.log('║  SAFETY: Place robot on a stand or hold it off the ground!    ║');
    console.log('║  The wheels will spin during calibration.                     ║');
    console.log('╚════════════════════════════════════════════════════════════════╝');
    console.log('');
    
    const ready = await askYesNo('Robot is secured and ready to calibrate?');
    if (!ready) {
      console.log('Calibration cancelled.');
      return;
    }
    
    // Calibrate left wheel
    calibrationResults.leftFirstMovePwm = await calibrateWheel('left', true);
    calibrationResults.leftDeadband = calibrationResults.leftFirstMovePwm;
    
    // Calibrate right wheel
    calibrationResults.rightFirstMovePwm = await calibrateWheel('right', false);
    calibrationResults.rightDeadband = calibrationResults.rightFirstMovePwm;
    
    // Final stop
    await stopMotors();
    
    // Show results
    console.log('\n');
    console.log('╔════════════════════════════════════════════════════════════════╗');
    console.log('║                    CALIBRATION RESULTS                         ║');
    console.log('╚════════════════════════════════════════════════════════════════╝');
    console.log('');
    console.log(`  Left wheel deadband:  ${calibrationResults.leftDeadband}`);
    console.log(`  Right wheel deadband: ${calibrationResults.rightDeadband}`);
    console.log('');
    
    logEntry({
      location: 'calibrate:results',
      message: 'Calibration complete',
      data: calibrationResults
    });
    
    // Ask to fine-tune
    console.log('You can manually adjust these values if needed.');
    const adjustLeft = await askNumber('Left deadband', calibrationResults.leftDeadband);
    const adjustRight = await askNumber('Right deadband', calibrationResults.rightDeadband);
    
    calibrationResults.leftDeadband = adjustLeft;
    calibrationResults.rightDeadband = adjustRight;
    
    // Ask to apply to robot
    console.log('');
    const apply = await askYesNo('Apply these deadband values to the robot via N=140?');
    
    if (apply) {
      // Pack deadband values: D2 = (leftDeadband << 8) | rightDeadband
      const packedValue = (calibrationResults.leftDeadband << 8) | calibrationResults.rightDeadband;
      
      console.log(`\nSending N=140 with D1=1, D2=${packedValue} (L=${calibrationResults.leftDeadband}, R=${calibrationResults.rightDeadband})`);
      send(`{"N":140,"H":"db","D1":1,"D2":${packedValue}}`);
      await sleep(200);
      
      console.log('Deadband values applied!');
      
      logEntry({
        location: 'calibrate:applied',
        message: 'Deadband values applied',
        data: { leftDeadband: calibrationResults.leftDeadband, rightDeadband: calibrationResults.rightDeadband, packedValue }
      });
    }
    
    // Verify with diagnostics
    console.log('\n--- Reading Diagnostics (N=120) ---');
    send('{"N":120,"H":"diag"}');
    await sleep(300);
    
    // Show recent responses
    const recentResponses = allResponses.slice(-5);
    console.log('\nRecent responses:');
    recentResponses.forEach(r => console.log(`  ${r.line}`));
    
    // Final summary
    console.log('\n');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('  CALIBRATION COMPLETE');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('');
    console.log('Final deadband values:');
    console.log(`  Left:  ${calibrationResults.leftDeadband}`);
    console.log(`  Right: ${calibrationResults.rightDeadband}`);
    console.log('');
    console.log('To apply these at compile time, add to config.h:');
    console.log(`  #define PWM_DEADBAND_L_DEFAULT ${calibrationResults.leftDeadband}`);
    console.log(`  #define PWM_DEADBAND_R_DEFAULT ${calibrationResults.rightDeadband}`);
    console.log('');
    console.log(`Log saved to: ${LOG_PATH}`);
    
  } catch (error) {
    console.error('\n❌ Calibration error:', error.message);
    logEntry({ location: 'calibrate:error', message: 'Error', data: { error: error.message } });
  } finally {
    // Ensure motors are stopped
    try {
      await stopMotors();
    } catch (e) { /* ignore */ }
    
    console.log('\n--- Closing port ---');
    serial.close();
    rl.close();
    
    logEntry({
      location: 'calibrate:complete',
      message: 'Calibration session ended',
      data: calibrationResults
    });
    
    process.exit(0);
  }
}

serial.on('error', (err) => {
  console.error('Serial error:', err.message);
});

runCalibration().catch(console.error);

