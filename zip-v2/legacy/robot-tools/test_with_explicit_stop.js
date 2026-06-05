#!/usr/bin/env node
/**
 * Test With Explicit Stop
 * 
 * Tests if explicitly stopping between commands helps.
 * 
 * Usage:
 *   node test_with_explicit_stop.js COM5 115200
 */

const { SerialPort } = require('serialport');

const args = process.argv.slice(2);
if (args.length < 2) {
  console.log('Usage: node test_with_explicit_stop.js <port> <baudrate>');
  process.exit(1);
}

const portPath = args[0];
const baudRate = parseInt(args[1], 10);

console.log(`\n=== Test With Explicit Stop ===`);
console.log(`Port: ${portPath}`);
console.log(`Baud: ${baudRate}`);
console.log(`===============================\n`);

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
    console.log('\n[TEST 1] Single command (should work)...');
    sendCommand({ N: 200, H: 'sp', D1: 200, D2: 0, T: 1000 });
    
    setTimeout(() => {
      console.log('\n[TEST 2] Stop, then new command...');
      sendCommand({ N: 201, H: 'stop' });
      
      setTimeout(() => {
        console.log('[INFO] Sending new command after stop...');
        sendCommand({ N: 200, H: 'sp', D1: 200, D2: 0, T: 1000 });
        
        setTimeout(() => {
          console.log('\n[TEST 3] Stop, wait longer, then new command...');
          sendCommand({ N: 201, H: 'stop' });
          
          setTimeout(() => {
            console.log('[INFO] Waiting 500ms before next command...');
            setTimeout(() => {
              sendCommand({ N: 200, H: 'sp', D1: 200, D2: 0, T: 1000 });
              
              setTimeout(() => {
                console.log('\n[TEST] Complete!');
                sendCommand({ N: 201, H: 'stop' });
                setTimeout(() => {
                  port.close(() => process.exit(0));
                }, 500);
              }, 1500);
            }, 500);
          }, 500);
        }, 1500);
      }, 500);
    }, 1500);
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

