#!/usr/bin/env node
/**
 * Simple Forward Test - Using N=200 (WORKING METHOD)
 * 
 * This uses N=200 setpoint commands which work correctly.
 * 
 * Usage:
 *   node simple_forward_working.js COM5 115200
 */

const { SerialPort } = require('serialport');

const args = process.argv.slice(2);
if (args.length < 2) {
  console.log('Usage: node simple_forward_working.js <port> <baudrate>');
  process.exit(1);
}

const portPath = args[0];
const baudRate = parseInt(args[1], 10);

console.log(`\n=== Simple Forward Test (N=200) ===`);
console.log(`Port: ${portPath}`);
console.log(`Baud: ${baudRate}`);
console.log(`====================================\n`);

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
    
    if (line.length > 0 && line !== 'R') {
      // Only log non-R messages
      if (!line.includes('R')) {
        console.log(`[RX] ${line}`);
      }
    }
    if (line === 'R' && !ready) {
      ready = true;
      setTimeout(startTest, 100);
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
  // Don't log every command to reduce noise
}

function startTest() {
  console.log('[TEST] Sending hello...');
  sendCommand({ N: 0, H: 'hello' });
  
  setTimeout(() => {
    console.log('\n[TEST] Moving forward for 2 seconds...');
    console.log('[INFO] Sending N=200 commands at 20Hz (50ms interval)');
    console.log('[INFO] Each command: v=150 (forward), w=0 (straight), T=200ms\n');
    
    const startTime = Date.now();
    const duration = 2000; // 2 seconds
    let count = 0;
    
    const interval = setInterval(() => {
      if (Date.now() - startTime >= duration) {
        clearInterval(interval);
        console.log(`\n[INFO] Sent ${count} forward commands`);
        console.log('[TEST] Sending stop command...');
        sendCommand({ N: 201, H: 'stop' });
        
        setTimeout(() => {
          console.log('\n[TEST] Complete!');
          port.close(() => process.exit(0));
        }, 500);
        return;
      }
      
      // N=200: v=150 (forward), w=0 (straight), T=200ms
      sendCommand({ N: 200, H: 'sp', D1: 150, D2: 0, T: 200 });
      count++;
      
      if (count % 10 === 0) {
        process.stdout.write('.');
      }
    }, 50); // 20Hz = 50ms interval
  }, 200);
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
  sendCommand({ N: 201, H: 'stop' });
  setTimeout(() => port.close(() => process.exit(0)), 200);
});

