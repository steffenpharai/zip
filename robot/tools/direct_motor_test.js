#!/usr/bin/env node
/**
 * Direct Motor Test - Simple hardware test
 * 
 * Sends a single forward command with high PWM to test motors directly.
 * 
 * Usage:
 *   node direct_motor_test.js COM5 115200
 */

const { SerialPort } = require('serialport');

const args = process.argv.slice(2);
if (args.length < 2) {
  console.log('Usage: node direct_motor_test.js <port> <baudrate>');
  process.exit(1);
}

const portPath = args[0];
const baudRate = parseInt(args[1], 10);

console.log(`\n=== Direct Motor Test ===`);
console.log(`Port: ${portPath}`);
console.log(`Baud: ${baudRate}`);
console.log(`========================\n`);

let rxBuffer = '';
let ready = false;

const port = new SerialPort({
  path: portPath,
  baudRate: baudRate,
  autoOpen: false
});

port.on('data', (data) => {
  const str = data.toString();
  rxBuffer += str;
  
  let newlineIdx;
  while ((newlineIdx = rxBuffer.indexOf('\n')) !== -1) {
    const line = rxBuffer.substring(0, newlineIdx).trim();
    rxBuffer = rxBuffer.substring(newlineIdx + 1);
    
    if (line.length > 0) {
      console.log(`[RX] ${line}`);
      if (line === 'R' && !ready) {
        console.log('[OK] Ready');
        ready = true;
        setTimeout(runTest, 100);
      }
    }
  }
});

port.on('error', (err) => {
  console.error(`[ERROR] ${err.message}`);
  process.exit(1);
});

function sendCommand(cmd) {
  const json = JSON.stringify(cmd);
  port.write(json + '\n');
  console.log(`[TX] ${json}`);
}

function runTest() {
  console.log('\n[TEST] Sending hello...');
  sendCommand({ N: 0, H: 'hello' });
  
  setTimeout(() => {
    console.log('\n[TEST] Sending forward command (v=200, high PWM)...');
    // Use higher PWM (200) to overcome friction
    sendCommand({ N: 200, H: 'sp', D1: 200, D2: 0, T: 3000 });
    
    setTimeout(() => {
      console.log('\n[TEST] Sending stop command...');
      sendCommand({ N: 201, H: 'stop' });
      
      setTimeout(() => {
        console.log('\n[TEST] Complete!');
        console.log('If robot did not move, check:');
        console.log('1. Battery is connected and charged');
        console.log('2. Motors are connected to TB6612 driver');
        console.log('3. STBY pin (3) is connected');
        console.log('4. Motor wires are connected correctly');
        port.close(() => process.exit(0));
      }, 500);
    }, 3000); // Run for 3 seconds
  }, 500);
}

port.open((err) => {
  if (err) {
    console.error(`[ERROR] Cannot open port: ${err.message}`);
    process.exit(1);
  }
  
  console.log('[INFO] Port opened, waiting for ready...');
  setTimeout(() => {
    if (!ready) {
      console.log('[WARN] Timeout, starting test anyway...');
      ready = true;
      runTest();
    }
  }, 2000);
});

process.on('SIGINT', () => {
  sendCommand({ N: 201, H: 'stop' });
  setTimeout(() => port.close(() => process.exit(0)), 200);
});

