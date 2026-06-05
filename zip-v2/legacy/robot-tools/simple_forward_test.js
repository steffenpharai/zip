#!/usr/bin/env node
/**
 * Simple Forward Motion Test
 * 
 * Moves robot forward for 2 seconds, then stops.
 * 
 * Usage:
 *   node simple_forward_test.js COM5 115200
 */

const { SerialPort } = require('serialport');

// Parse command line arguments
const args = process.argv.slice(2);
if (args.length < 2) {
  console.log('Usage: node simple_forward_test.js <port> <baudrate>');
  console.log('Example: node simple_forward_test.js COM5 115200');
  process.exit(1);
}

const portPath = args[0];
const baudRate = parseInt(args[1], 10);

console.log(`\n=== Simple Forward Test ===`);
console.log(`Port: ${portPath}`);
console.log(`Baud: ${baudRate}`);
console.log(`==========================\n`);

let rxBuffer = '';
let ready = false;

// Open serial port
const port = new SerialPort({
  path: portPath,
  baudRate: baudRate,
  autoOpen: false
});

// Handle data reception
port.on('data', (data) => {
  const str = data.toString();
  rxBuffer += str;
  
  // Process complete lines
  let newlineIdx;
  while ((newlineIdx = rxBuffer.indexOf('\n')) !== -1) {
    const line = rxBuffer.substring(0, newlineIdx).trim();
    rxBuffer = rxBuffer.substring(newlineIdx + 1);
    
    if (line.length > 0) {
      console.log(`[RX] ${line}`);
      
      // Wait for ready marker
      if (line === 'R' && !ready) {
        console.log('[OK] Got ready marker');
        ready = true;
        setTimeout(startTest, 100);
      }
    }
  }
});

port.on('error', (err) => {
  console.error(`[ERROR] ${err.message}`);
  process.exit(1);
});

port.on('close', () => {
  console.log('[INFO] Port closed');
  process.exit(0);
});

// Send JSON command
function sendCommand(cmd) {
  const json = JSON.stringify(cmd);
  port.write(json + '\n', (err) => {
    if (err) {
      console.error(`[ERROR] Write failed: ${err.message}`);
    } else {
      console.log(`[TX] ${json}`);
    }
  });
}

// Start test
function startTest() {
  console.log('\n[TEST] Starting forward motion for 2 seconds...\n');
  
  // Send hello first
  sendCommand({ N: 0, H: 'hello' });
  
  setTimeout(() => {
    // Start sending forward commands at 20Hz (50ms interval)
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
          port.close((err) => {
            if (err) console.error('[WARN] Error closing port:', err.message);
            process.exit(0);
          });
        }, 500);
        return;
      }
      
      // N=200: v=150 (forward), w=0 (straight), T=200ms
      sendCommand({ N: 200, H: 'sp', D1: 150, D2: 0, T: 200 });
      count++;
    }, 50); // 20Hz = 50ms interval
  }, 200);
}

// Open port
console.log('[INFO] Opening port...');
port.open((err) => {
  if (err) {
    console.error(`[ERROR] Cannot open port: ${err.message}`);
    console.log('\nTroubleshooting:');
    console.log('- Make sure the Arduino is connected');
    console.log('- Check that no other program is using the port');
    console.log('- Unplug camera/Bluetooth module from RX/TX during test');
    process.exit(1);
  }
  
  console.log('[INFO] Port opened, waiting for ready marker...');
  
  // Set timeout for ready marker
  setTimeout(() => {
    if (!ready) {
      console.log('[WARN] Timeout waiting for ready marker, starting test anyway...');
      ready = true;
      startTest();
    }
  }, 2000);
});

// Handle Ctrl+C gracefully
process.on('SIGINT', () => {
  console.log('\n[INFO] Interrupted, sending stop command...');
  sendCommand({ N: 201, H: 'stop' });
  setTimeout(() => {
    port.close(() => process.exit(0));
  }, 200);
});

