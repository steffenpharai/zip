#!/usr/bin/env node
/**
 * Response Test - Verifies commands are being processed
 * 
 * Tests N=999 and N=201 commands and waits for responses.
 * 
 * Usage:
 *   node response_test.js COM5 115200
 */

const { SerialPort } = require('serialport');

const args = process.argv.slice(2);
if (args.length < 2) {
  console.log('Usage: node response_test.js <port> <baudrate>');
  process.exit(1);
}

const portPath = args[0];
const baudRate = parseInt(args[1], 10);

console.log(`\n=== Response Test ===`);
console.log(`Port: ${portPath}`);
console.log(`Baud: ${baudRate}`);
console.log(`====================\n`);

let rxBuffer = '';
let ready = false;
let responseReceived = false;

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
    
    if (line.length > 0) {
      console.log(`[RX] ${line}`);
      if (line === 'R' && !ready) {
        console.log('[OK] Ready marker received');
        ready = true;
        setTimeout(runTest, 100);
      } else if (line.includes('ok') || line.includes('H_ok')) {
        responseReceived = true;
        console.log('[OK] Response received!');
      }
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
  console.log(`[TX] ${json}`);
}

function runTest() {
  console.log('\n[TEST] Step 1: Testing N=999 with response wait...');
  responseReceived = false;
  sendCommand({ N: 999, H: 'test', D1: 200, D2: 200 });
  
  setTimeout(() => {
    if (responseReceived) {
      console.log('[OK] N=999 command processed!');
    } else {
      console.log('[WARN] No response from N=999 - command may not be recognized');
    }
    
    console.log('\n[TEST] Step 2: Testing N=201 stop command...');
    responseReceived = false;
    sendCommand({ N: 201, H: 'stop' });
    
    setTimeout(() => {
      if (responseReceived) {
        console.log('[OK] N=201 command processed!');
      } else {
        console.log('[WARN] No response from N=201');
      }
      
      console.log('\n[TEST] Step 3: Testing N=200 setpoint (no response expected)...');
      sendCommand({ N: 200, H: 'sp', D1: 200, D2: 0, T: 200 });
      
      setTimeout(() => {
        console.log('\n[TEST] Step 4: Stopping with N=201...');
        responseReceived = false;
        sendCommand({ N: 201, H: 'stop' });
        
        setTimeout(() => {
          console.log('\n[TEST] Complete!');
          console.log('\nSummary:');
          console.log('- If N=999 got response: Direct motor control works');
          console.log('- If N=201 got response: Stop command works');
          console.log('- If N=200 sent: Setpoint command sent (no response expected)');
          port.close(() => process.exit(0));
        }, 500);
      }, 1000);
    }, 500);
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
      console.log('[WARN] Timeout waiting for ready marker, starting test anyway...');
      ready = true;
      runTest();
    }
  }, 2000);
});

process.on('SIGINT', () => {
  sendCommand({ N: 201, H: 'stop' });
  setTimeout(() => port.close(() => process.exit(0)), 200);
});

