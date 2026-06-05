#!/usr/bin/env node
/**
 * Direct Hardware Motor Test
 * 
 * Bypasses motion controller and directly tests motor driver hardware.
 * Uses N=999 command for direct motor control.
 * 
 * Usage:
 *   node direct_hardware_test.js COM5 115200
 */

const { SerialPort } = require('serialport');

const args = process.argv.slice(2);
if (args.length < 2) {
  console.log('Usage: node direct_hardware_test.js <port> <baudrate>');
  process.exit(1);
}

const portPath = args[0];
const baudRate = parseInt(args[1], 10);

console.log(`\n=== Direct Hardware Motor Test ===`);
console.log(`Port: ${portPath}`);
console.log(`Baud: ${baudRate}`);
console.log(`==================================\n`);

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
    console.log('\n[TEST] Direct motor test - Forward (200, 200) for 2 seconds...');
    // N=999: Direct motor control, D1=left, D2=right
    sendCommand({ N: 999, H: 'test', D1: 200, D2: 200 });
    
    setTimeout(() => {
      console.log('\n[TEST] Stopping motors...');
      sendCommand({ N: 999, H: 'test', D1: 0, D2: 0 });
      
      setTimeout(() => {
        console.log('\n[TEST] Complete!');
        console.log('If motors did not move, check:');
        console.log('1. Battery is connected and charged');
        console.log('2. Motor wires are connected to TB6612');
        console.log('3. STBY pin (3) is connected');
        console.log('4. PWM pins (5,6) and direction pins (7,8) are connected');
        port.close(() => process.exit(0));
      }, 500);
    }, 2000); // Run for 2 seconds
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
  sendCommand({ N: 999, H: 'test', D1: 0, D2: 0 });
  setTimeout(() => port.close(() => process.exit(0)), 200);
});

