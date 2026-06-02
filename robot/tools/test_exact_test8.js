#!/usr/bin/env node
/**
 * Exact Test 8 Replication
 * 
 * Replicates exactly what Test 8 did: N=200 with T=2000ms
 * 
 * Usage:
 *   node test_exact_test8.js COM5 115200
 */

const { SerialPort } = require('serialport');

const args = process.argv.slice(2);
if (args.length < 2) {
  console.log('Usage: node test_exact_test8.js <port> <baudrate>');
  process.exit(1);
}

const portPath = args[0];
const baudRate = parseInt(args[1], 10);

console.log(`\n=== Exact Test 8 Replication ===`);
console.log(`Port: ${portPath}`);
console.log(`Baud: ${baudRate}`);
console.log(`=================================\n`);

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
    
    if (line === 'R' && !ready) {
      ready = true;
      setTimeout(runTest, 100);
    }
  }
});

function sendCommand(cmd) {
  const json = JSON.stringify(cmd);
  port.write(json + '\n');
  console.log(`[TX] ${json}`);
}

function runTest() {
  console.log('[TEST] Sending hello...');
  sendCommand({ N: 0, H: 'hello' });
  
  setTimeout(() => {
    console.log('\n[TEST] Sending EXACT Test 8 command:');
    console.log('      N=200, D1=200, D2=0, T=2000');
    console.log('      This should move forward for 2 seconds...\n');
    
    sendCommand({ N: 200, H: 'sp', D1: 200, D2: 0, T: 2000 });
    
    console.log('[INFO] Command sent. Robot should move forward now.');
    console.log('[INFO] Waiting 2.5 seconds...\n');
    
    setTimeout(() => {
      console.log('[TEST] Sending stop command...');
      sendCommand({ N: 201, H: 'stop' });
      
      setTimeout(() => {
        console.log('\n[TEST] Complete!');
        console.log('Did the robot move forward?');
        port.close(() => process.exit(0));
      }, 500);
    }, 2500);
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
      ready = true;
      runTest();
    }
  }, 2000);
});

process.on('SIGINT', () => {
  sendCommand({ N: 201, H: 'stop' });
  setTimeout(() => port.close(() => process.exit(0)), 200);
});

