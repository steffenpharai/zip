#!/usr/bin/env node
/**
 * Single Command Repeat Test
 * 
 * Sends single N=200 commands one at a time, waiting for each to complete.
 * This mimics what worked in test 8.
 * 
 * Usage:
 *   node single_command_repeat.js COM5 115200
 */

const { SerialPort } = require('serialport');

const args = process.argv.slice(2);
if (args.length < 2) {
  console.log('Usage: node single_command_repeat.js <port> <baudrate>');
  process.exit(1);
}

const portPath = args[0];
const baudRate = parseInt(args[1], 10);

console.log(`\n=== Single Command Repeat Test ===`);
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
    console.log('\n[TEST] Sending commands one at a time...');
    console.log('[INFO] Each command runs for 500ms, then we send the next one');
    console.log('[INFO] This should create continuous motion\n');
    
    let count = 0;
    const maxCommands = 6; // 6 commands * 500ms = 3 seconds
    
    function sendNext() {
      if (count >= maxCommands) {
        console.log(`\n[INFO] Sent ${count} commands`);
        console.log('[TEST] Sending final stop...');
        sendCommand({ N: 201, H: 'stop' });
        
        setTimeout(() => {
          console.log('\n[TEST] Complete!');
          port.close(() => process.exit(0));
        }, 500);
        return;
      }
      
      console.log(`[CMD ${count + 1}] Sending N=200 command (T=500ms)...`);
      sendCommand({ N: 200, H: 'sp', D1: 200, D2: 0, T: 500 });
      count++;
      
      // Wait 500ms (let this command run) then send next
      setTimeout(sendNext, 500);
    }
    
    sendNext();
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

