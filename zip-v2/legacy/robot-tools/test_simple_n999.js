#!/usr/bin/env node
/**
 * Simple N=999 Test - Just send one command and keep it running
 */

const { SerialPort } = require('serialport');

const portPath = process.argv[2] || 'COM5';
const baudRate = parseInt(process.argv[3] || '115200', 10);

console.log(`\n=== Simple N=999 Test ===`);
console.log(`Port: ${portPath}`);
console.log(`Baud: ${baudRate}`);
console.log(`Sending N=999 with PWM=200, keeping it running\n`);

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
      setTimeout(startTest, 100);
    }
    
    if (line && line !== 'R') {
      console.log(`[RX] ${line}`);
    }
  }
});

port.on('error', (err) => {
  console.error(`[ERROR] ${err.message}`);
  process.exit(1);
});

function sendCommand(cmd) {
  const json = JSON.stringify(cmd);
  console.log(`[TX] ${json}`);
  port.write(json + '\n');
}

function startTest() {
  console.log('[TEST] Sending hello...');
  sendCommand({ N: 0, H: 'hello' });
  
  setTimeout(() => {
    console.log('\n[TEST] Sending N=999 command (PWM=200, 200)...');
    console.log('[INFO] This should make motors run continuously');
    console.log('[INFO] Press Ctrl+C to stop\n');
    sendCommand({ N: 999, H: 'test', D1: 200, D2: 200 });
    
    // Keep it running - don't send stop
    console.log('[INFO] Motors should be running now. Do you hear clicking?');
    console.log('[INFO] Press Ctrl+C to send stop command and exit');
  }, 500);
}

port.open((err) => {
  if (err) {
    console.error(`[ERROR] Cannot open port: ${err.message}`);
    process.exit(1);
  }
  
  console.log('[INFO] Port opened, waiting for ready marker...');
  setTimeout(() => {
    if (!ready) {
      console.log('[WARN] Timeout, starting test anyway...');
      ready = true;
      startTest();
    }
  }, 2000);
});

process.on('SIGINT', () => {
  console.log('\n[INFO] Sending stop command...');
  sendCommand({ N: 201, H: 'stop' });
  setTimeout(() => port.close(() => process.exit(0)), 500);
});

