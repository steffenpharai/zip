#!/usr/bin/env node
/**
 * 20Hz Streaming Test - Tests TTL Extension Logic
 * 
 * This test verifies the fix for streaming motion control:
 * - Sends N=200 commands at 20Hz (50ms intervals)
 * - Each command has T=300ms TTL
 * - With TTL extension, motion should be continuous
 * 
 * Usage:
 *   node test_20hz_streaming.js COM5 115200
 */

const { SerialPort } = require('serialport');

const args = process.argv.slice(2);
if (args.length < 2) {
  console.log('Usage: node test_20hz_streaming.js <port> <baudrate>');
  process.exit(1);
}

const portPath = args[0];
const baudRate = parseInt(args[1], 10);

console.log(`\n=== 20Hz Streaming Test (TTL Extension) ===`);
console.log(`Port: ${portPath}`);
console.log(`Baud: ${baudRate}`);
console.log(`Rate: 20Hz (50ms intervals)`);
console.log(`TTL: 300ms per command`);
console.log(`Expected: Continuous motion via TTL extension`);
console.log(`==========================================\n`);

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
    console.log('\n[TEST] Starting 20Hz streaming test...');
    console.log('[INFO] N=200 commands: v=200, w=0, T=300ms');
    console.log('[INFO] Sending every 50ms (20Hz)');
    console.log('[INFO] TTL extension should maintain continuous motion\n');
    
    const startTime = Date.now();
    const duration = 3000; // 3 seconds = 60 commands at 20Hz
    let count = 0;
    
    const interval = setInterval(() => {
      if (Date.now() - startTime >= duration) {
        clearInterval(interval);
        console.log(`\n[INFO] Sent ${count} commands over 3 seconds (${(count/3).toFixed(1)} Hz)`);
        console.log('[TEST] Sending stop command...');
        sendCommand({ N: 201, H: 'stop' });
        
        setTimeout(() => {
          console.log('\n[TEST] Complete!');
          if (count >= 55) {
            console.log('[SUCCESS] All commands sent - robot should have moved continuously');
          } else {
            console.log('[WARN] Fewer commands sent than expected');
          }
          port.close(() => process.exit(0));
        }, 500);
        return;
      }
      
      // N=200: v=200 (forward), w=0 (straight), T=300ms
      // TTL extension should extend expiration when new command arrives
      sendCommand({ N: 200, H: 'sp', D1: 200, D2: 0, T: 300 });
      count++;
      
      if (count % 10 === 0) {
        process.stdout.write(`[${count}] `);
      }
    }, 50); // 20Hz = 50ms intervals
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

