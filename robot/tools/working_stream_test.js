#!/usr/bin/env node
/**
 * Working Stream Test - Uses N=200 (CONFIRMED WORKING)
 * 
 * Since single N=200 commands work, this streams them with proper timing.
 * Each command has T=1000ms TTL, sent every 800ms to ensure overlap.
 * 
 * Usage:
 *   node working_stream_test.js COM5 115200
 */

const { SerialPort } = require('serialport');

const args = process.argv.slice(2);
if (args.length < 2) {
  console.log('Usage: node working_stream_test.js <port> <baudrate>');
  process.exit(1);
}

const portPath = args[0];
const baudRate = parseInt(args[1], 10);

console.log(`\n=== Working Stream Test (N=200) ===`);
console.log(`Port: ${portPath}`);
console.log(`Baud: ${baudRate}`);
console.log(`===================================\n`);

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
  }
});

port.on('error', (err) => {
  console.error(`[ERROR] ${err.message}`);
  process.exit(1);
});

function sendCommand(cmd) {
  const json = JSON.stringify(cmd);
  port.write(json + '\n');
}

function startTest() {
  console.log('[TEST] Sending hello...');
  sendCommand({ N: 0, H: 'hello' });
  
  setTimeout(() => {
    console.log('\n[TEST] Starting continuous forward motion...');
    console.log('[INFO] Using N=200 commands (CONFIRMED WORKING)');
    console.log('[INFO] Each command: v=200, w=0, T=1000ms');
    console.log('[INFO] Sending new command every 800ms (ensures overlap)');
    console.log('[INFO] This should create smooth continuous motion\n');
    
    const startTime = Date.now();
    const duration = 5000; // 5 seconds
    let count = 0;
    
    const interval = setInterval(() => {
      if (Date.now() - startTime >= duration) {
        clearInterval(interval);
        console.log(`\n[INFO] Sent ${count} commands over 5 seconds`);
        console.log('[TEST] Sending stop command...');
        sendCommand({ N: 201, H: 'stop' });
        
        setTimeout(() => {
          console.log('\n[TEST] Complete!');
          console.log('[SUCCESS] Robot should have moved forward continuously');
          port.close(() => process.exit(0));
        }, 500);
        return;
      }
      
      // N=200: v=200 (forward), w=0 (straight), T=1000ms
      // T=1000ms ensures each command lasts 1 second
      // Sending every 800ms ensures new command arrives before TTL expires
      sendCommand({ N: 200, H: 'sp', D1: 200, D2: 0, T: 1000 });
      count++;
      
      if (count % 5 === 0) {
        process.stdout.write('.');
      }
    }, 800); // Send every 800ms (slower than 20Hz, but ensures overlap)
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
  sendCommand({ N: 201, H: 'stop' });
  setTimeout(() => port.close(() => process.exit(0)), 200);
});

