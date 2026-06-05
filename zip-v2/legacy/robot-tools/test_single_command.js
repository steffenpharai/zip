#!/usr/bin/env node
/**
 * Single Command Test - Verify basic motion works
 */

const { SerialPort } = require('serialport');

const args = process.argv.slice(2);
const portPath = args[0] || 'COM5';
const baudRate = parseInt(args[1] || '115200', 10);

console.log(`\n=== Single Command Test ===`);
console.log(`Port: ${portPath}`);
console.log(`Baud: ${baudRate}\n`);

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
    
    // Print any responses
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
    console.log('\n[TEST] Sending single N=200 command...');
    console.log('[INFO] v=200, w=0, T=2000ms (2 seconds)');
    sendCommand({ N: 200, H: 'sp', D1: 200, D2: 0, T: 2000 });
    
    setTimeout(() => {
      console.log('\n[TEST] Waiting 3 seconds for motion...');
      console.log('[INFO] Robot should move forward for 2 seconds');
      
      setTimeout(() => {
        console.log('\n[TEST] Sending stop...');
        sendCommand({ N: 201, H: 'stop' });
        
        setTimeout(() => {
          console.log('\n[TEST] Complete!');
          port.close(() => process.exit(0));
        }, 500);
      }, 3000);
    }, 100);
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

