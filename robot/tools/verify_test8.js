#!/usr/bin/env node
/**
 * Verify Test 8 - Exact Replication
 * 
 * Replicates test 8 exactly to verify it still works.
 * 
 * Usage:
 *   node verify_test8.js COM5 115200
 */

const { SerialPort } = require('serialport');

const args = process.argv.slice(2);
if (args.length < 2) {
  console.log('Usage: node verify_test8.js <port> <baudrate>');
  process.exit(1);
}

const portPath = args[0];
const baudRate = parseInt(args[1], 10);

console.log(`\n=== Verify Test 8 ===`);
console.log(`Port: ${portPath}`);
console.log(`Baud: ${baudRate}`);
console.log(`====================\n`);

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
    console.log('\n[TEST] Sending EXACT test 8 command:');
    console.log('      N=200, H="sp", D1=200, D2=0, T=2000');
    console.log('\n[INFO] Robot should move forward for 2 seconds...');
    console.log('[INFO] Watch carefully!\n');
    
    sendCommand({ N: 200, H: 'sp', D1: 200, D2: 0, T: 2000 });
    
    setTimeout(() => {
      console.log('\n[TEST] Waiting 2.5 seconds...');
      console.log('[INFO] Did the robot move?');
      
      setTimeout(() => {
        console.log('\n[TEST] Sending stop...');
        sendCommand({ N: 201, H: 'stop' });
        
        setTimeout(() => {
          console.log('\n[TEST] Complete!');
          port.close(() => process.exit(0));
        }, 500);
      }, 2500);
    }, 100);
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

