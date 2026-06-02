#!/usr/bin/env node
/**
 * TTL Timing Test
 * 
 * Tests different TTL values to find what works.
 * 
 * Usage:
 *   node test_ttl_timing.js COM5 115200
 */

const { SerialPort } = require('serialport');

const args = process.argv.slice(2);
if (args.length < 2) {
  console.log('Usage: node test_ttl_timing.js <port> <baudrate>');
  process.exit(1);
}

const portPath = args[0];
const baudRate = parseInt(args[1], 10);

console.log(`\n=== TTL Timing Test ===`);
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
    console.log('\n[TEST 1] Single command with T=2000ms (like Test 8)...');
    sendCommand({ N: 200, H: 'sp', D1: 200, D2: 0, T: 2000 });
    
    setTimeout(() => {
      console.log('\n[TEST 2] Single command with T=300ms...');
      sendCommand({ N: 200, H: 'sp', D1: 200, D2: 0, T: 300 });
      
      setTimeout(() => {
        console.log('\n[TEST 3] Streaming commands at 20Hz with T=300ms...');
        const startTime = Date.now();
        const duration = 2000;
        let count = 0;
        
        const interval = setInterval(() => {
          if (Date.now() - startTime >= duration) {
            clearInterval(interval);
            console.log(`\n[INFO] Sent ${count} commands`);
            sendCommand({ N: 201, H: 'stop' });
            
            setTimeout(() => {
              console.log('\n[TEST] Complete!');
              port.close(() => process.exit(0));
            }, 500);
            return;
          }
          
          sendCommand({ N: 200, H: 'sp', D1: 200, D2: 0, T: 300 });
          count++;
        }, 50); // 20Hz
      }, 2500);
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

