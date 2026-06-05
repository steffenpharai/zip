#!/usr/bin/env node
/**
 * Serial Motion Test Harness
 * 
 * Tests ZIP robot firmware serial communication and motion control.
 * 
 * Usage:
 *   node serial_motion_test.js COM5 115200
 *   node serial_motion_test.js /dev/ttyUSB0 115200
 * 
 * Requirements:
 *   npm install serialport
 * 
 * Test Sequence:
 *   1. Open port, wait for DTR reset (~600ms)
 *   2. Wait for "R\n" ready marker
 *   3. Send N=0 hello, wait for {hello_ok}
 *   4. Stream N=200 setpoints at 20Hz for 3 seconds (forward)
 *   5. Stream N=200 setpoints (arc turn) for 2 seconds
 *   6. Stop sending to verify TTL auto-stop
 *   7. Send N=201 stop command
 *   8. Start macro N=210, then cancel with N=211
 *   9. Get stats with N=120
 *
 * CRITICAL: The script continuously reads serial data to prevent TX backpressure.
 */

const { SerialPort } = require('serialport');

// Parse command line arguments
const args = process.argv.slice(2);
if (args.length < 2) {
  console.log('Usage: node serial_motion_test.js <port> <baudrate>');
  console.log('Example: node serial_motion_test.js COM5 115200');
  process.exit(1);
}

const portPath = args[0];
const baudRate = parseInt(args[1], 10);

console.log(`\n=== ZIP Robot Serial Motion Test ===`);
console.log(`Port: ${portPath}`);
console.log(`Baud: ${baudRate}`);
console.log(`===================================\n`);

// Test state
let state = 'WAIT_READY';
let rxBuffer = '';
let cmdSequence = 0;
let testPhase = 0;
let streamInterval = null;
let streamCount = 0;
let testStartTime = Date.now();

// Open serial port
const port = new SerialPort({
  path: portPath,
  baudRate: baudRate,
  autoOpen: false
});

// Handle data reception (CRITICAL: always read to prevent backpressure)
port.on('data', (data) => {
  const str = data.toString();
  rxBuffer += str;
  
  // Process complete lines
  let newlineIdx;
  while ((newlineIdx = rxBuffer.indexOf('\n')) !== -1) {
    const line = rxBuffer.substring(0, newlineIdx).trim();
    rxBuffer = rxBuffer.substring(newlineIdx + 1);
    
    if (line.length > 0) {
      handleResponse(line);
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

// Handle received responses
function handleResponse(line) {
  const elapsed = Date.now() - testStartTime;
  console.log(`[RX ${elapsed}ms] ${line}`);
  
  switch (state) {
    case 'WAIT_READY':
      if (line === 'R') {
        console.log('[OK] Got ready marker');
        state = 'READY';
        setTimeout(sendHello, 100);
      }
      break;
      
    case 'WAIT_HELLO':
      if (line === '{hello_ok}') {
        console.log('[OK] Handshake complete');
        state = 'CONNECTED';
        setTimeout(startTest, 100);
      }
      break;
      
    case 'TESTING':
      // Just log responses during testing
      break;
      
    case 'WAIT_STOP':
      if (line.includes('_ok}')) {
        console.log('[OK] Stop acknowledged');
        setTimeout(startMacro, 500);
      }
      break;
      
    case 'WAIT_MACRO':
      if (line.includes('_ok}')) {
        console.log('[OK] Macro started');
        setTimeout(cancelMacro, 1500);  // Let it run 1.5s
      } else if (line.includes('_false}')) {
        console.log('[WARN] Macro failed to start');
        setTimeout(getStats, 500);
      }
      break;
      
    case 'WAIT_CANCEL':
      if (line.includes('_ok}')) {
        console.log('[OK] Macro cancelled');
        setTimeout(getStats, 500);
      }
      break;
      
    case 'WAIT_STATS':
      if (line.startsWith('{stats:')) {
        console.log('[OK] Got stats');
        parseStats(line);
        setTimeout(finishTest, 500);
      }
      break;
  }
}

// Parse and display stats
function parseStats(line) {
  // Format: {stats:rx=0,jd=0,pe=0,bc=0,tx=0,ms=123}
  const match = line.match(/\{stats:rx=(\d+),jd=(\d+),pe=(\d+),bc=(\d+),tx=(\d+),ms=(\d+)\}/);
  if (match) {
    console.log('\n=== Diagnostic Stats ===');
    console.log(`RX overflow:        ${match[1]}`);
    console.log(`JSON dropped long:  ${match[2]}`);
    console.log(`Parse errors:       ${match[3]}`);
    console.log(`Binary CRC fail:    ${match[4]}`);
    console.log(`TX dropped:         ${match[5]}`);
    console.log(`Last cmd ms ago:    ${match[6]}`);
    console.log('========================\n');
  }
}

// Send hello command
function sendHello() {
  console.log('[TX] Sending hello...');
  state = 'WAIT_HELLO';
  sendCommand({ N: 0, H: 'hello' });
}

// Start main test sequence
function startTest() {
  console.log('\n=== Starting Motion Test ===\n');
  state = 'TESTING';
  
  // Phase 1: Forward motion at 20Hz for 3 seconds
  console.log('[TEST] Phase 1: Forward motion (3s at 20Hz)');
  streamCount = 0;
  const forwardDuration = 3000;
  const startTime = Date.now();
  
  streamInterval = setInterval(() => {
    if (Date.now() - startTime >= forwardDuration) {
      clearInterval(streamInterval);
      streamInterval = null;
      console.log(`[INFO] Sent ${streamCount} forward setpoints`);
      setTimeout(startArcPhase, 100);
      return;
    }
    
    // N=200: v=150 (forward), w=0 (straight), TTL=200ms
    sendCommand({ N: 200, H: 'sp', D1: 150, D2: 0, T: 200 });
    streamCount++;
  }, 50);  // 20Hz = 50ms interval
}

// Phase 2: Arc turn
function startArcPhase() {
  console.log('[TEST] Phase 2: Arc turn (2s at 20Hz)');
  streamCount = 0;
  const arcDuration = 2000;
  const startTime = Date.now();
  
  streamInterval = setInterval(() => {
    if (Date.now() - startTime >= arcDuration) {
      clearInterval(streamInterval);
      streamInterval = null;
      console.log(`[INFO] Sent ${streamCount} arc setpoints`);
      setTimeout(testTTLStop, 100);
      return;
    }
    
    // N=200: v=120 (forward), w=80 (right turn), TTL=200ms
    sendCommand({ N: 200, H: 'sp', D1: 120, D2: 80, T: 200 });
    streamCount++;
  }, 50);
}

// Phase 3: TTL stop test (stop sending and verify motors stop)
function testTTLStop() {
  console.log('[TEST] Phase 3: TTL auto-stop (waiting 500ms)');
  // Stop sending commands - motors should stop within TTL (200ms)
  setTimeout(sendStopCommand, 500);
}

// Phase 4: Explicit stop
function sendStopCommand() {
  console.log('[TEST] Phase 4: Sending N=201 stop command');
  state = 'WAIT_STOP';
  sendCommand({ N: 201, H: 'stop' });
}

// Phase 5: Macro test
function startMacro() {
  console.log('[TEST] Phase 5: Starting WIGGLE macro (N=210)');
  state = 'WAIT_MACRO';
  // N=210: D1=3 (WIGGLE), D2=128 (half intensity), T=5000 (5s TTL)
  sendCommand({ N: 210, H: 'macro', D1: 3, D2: 128, T: 5000 });
}

// Cancel macro
function cancelMacro() {
  console.log('[TEST] Phase 6: Cancelling macro (N=211)');
  state = 'WAIT_CANCEL';
  sendCommand({ N: 211, H: 'cancel' });
}

// Get stats
function getStats() {
  console.log('[TEST] Phase 7: Getting diagnostics (N=120)');
  state = 'WAIT_STATS';
  sendCommand({ N: 120, H: 'stats' });
}

// Finish test
function finishTest() {
  console.log('\n=== Test Complete ===');
  console.log(`Total time: ${Date.now() - testStartTime}ms`);
  
  // Close port after a short delay
  setTimeout(() => {
    port.close((err) => {
      if (err) console.error('[WARN] Error closing port:', err.message);
      process.exit(0);
    });
  }, 500);
}

// Send JSON command
function sendCommand(cmd) {
  const json = JSON.stringify(cmd);
  port.write(json + '\n', (err) => {
    if (err) {
      console.error(`[ERROR] Write failed: ${err.message}`);
    }
  });
}

// Open port with delay for DTR reset
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
  
  console.log('[INFO] Port opened, waiting for DTR reset...');
  state = 'WAIT_READY';
  
  // Set timeout for ready marker
  setTimeout(() => {
    if (state === 'WAIT_READY') {
      console.log('[WARN] Timeout waiting for ready marker, continuing...');
      state = 'READY';
      sendHello();
    }
  }, 2000);
});

// Handle Ctrl+C gracefully
process.on('SIGINT', () => {
  console.log('\n[INFO] Interrupted, sending stop command...');
  if (streamInterval) {
    clearInterval(streamInterval);
  }
  sendCommand({ N: 201, H: 'stop' });
  setTimeout(() => {
    port.close(() => process.exit(0));
  }, 200);
});

