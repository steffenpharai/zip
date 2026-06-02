#!/usr/bin/env node
/**
 * Simple Communication Test
 * 
 * Tests basic communication with robot using JSON protocol
 * Verifies robot responds to commands
 * 
 * Usage: node test_communication.js <COM_PORT> [baud_rate]
 * Example: node test_communication.js COM3 115200
 */

const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');

const COM_PORT = process.argv[2] || 'COM3';
const BAUD_RATE = parseInt(process.argv[3] || '115200', 10);

let port = null;
let parser = null;
let responses = [];
let allMessages = [];  // Track all messages for diagnostics
let testComplete = false;
let bootComplete = false;  // Track when boot is complete

// H field is limited to 12 chars in firmware (including null terminator)
// Use max 11 chars to avoid truncation
function sendCommand(N, H, D1 = 0, D2 = 0, T = 0) {
  // Validate H length
  if (H.length > 11) {
    console.warn(`⚠️  Warning: H field "${H}" is ${H.length} chars, will be truncated to 11`);
    H = H.substring(0, 11);
  }
  const cmd = JSON.stringify({ N, H, D1, D2, T });
  console.log(`[SEND] ${cmd}`);
  if (port && port.isOpen) {
    port.write(cmd + '\n');
  }
  return cmd;
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function checkResponse(contains) {
  return responses.some(r => r.includes(contains));
}

function checkResponseExact(H, suffix) {
  // Check for exact format: {H_suffix} or {H_truncated_suffix}
  const exactMatch = `{${H}_${suffix}}`;
  const truncatedMatch = H.length > 11 ? `{${H.substring(0, 11)}_${suffix}}` : null;
  
  return responses.some(r => {
    if (r === exactMatch) return true;
    if (truncatedMatch && r === truncatedMatch) return true;
    // Also check if it contains the pattern
    return r.includes(`${H}_${suffix}`) || (truncatedMatch && r.includes(truncatedMatch));
  });
}

function detectReset(message) {
  const resetIndicators = [
    '=== ZIP Robot Firmware ===',
    'Version:',
    'Ready',
    'ZIP Robot'
  ];
  return resetIndicators.some(indicator => message.includes(indicator));
}

async function testCommunication() {
  console.log('=== ZIP Robot Communication Test ===');
  console.log(`Port: ${COM_PORT}`);
  console.log(`Baud: ${BAUD_RATE}`);
  console.log('Connecting...\n');
  
  // Wait for robot to finish booting and clear boot messages
  await wait(4000);
  bootComplete = true;  // Mark boot as complete
  
  // Check for reset indicators in initial messages
  const bootMessages = allMessages.filter(m => detectReset(m));
  if (bootMessages.length > 0) {
    console.log('✓ Robot boot detected\n');
  }
  
  try {
    // Test 0: Hello/Echo command (N=0) - should get {H_ok}
    console.log('Test 0: Hello command (N=0) - Communication verification');
    responses = [];
    const startTime = Date.now();
    sendCommand(0, 'hello');
    await wait(1000);  // Increased wait time
    
    if (checkResponseExact('hello', 'ok') || checkResponse('hello')) {
      console.log('✓ Robot is responding! Communication verified.');
      console.log(`  Response time: ${Date.now() - startTime}ms\n`);
    } else {
      console.log('✗ No response to hello command');
      console.log('Responses received:', responses);
      console.log('⚠️  Check: COM port, baud rate, firmware uploaded?\n');
    }
    
    // Test 1: Send N=201 (Stop) - should get {H_ok}
    console.log('Test 1: Stop command (N=201)');
    const responsesBefore = responses.length;
    const startTime1 = Date.now();
    sendCommand(201, 'stop');  // Shortened to avoid truncation
    await wait(1500);  // Increased wait time for delayed responses
    
    // Check responses received after this command
    const newResponses = responses.slice(responsesBefore);
    
    if (checkResponseExact('stop', 'ok') || newResponses.some(r => r.includes('stop') && r.includes('ok'))) {
      console.log('✓ Robot responded to stop command');
      console.log(`  Response time: ${Date.now() - startTime1}ms`);
      if (newResponses.length > 0) {
        console.log(`  Response: ${newResponses[0]}\n`);
      } else {
        console.log('');
      }
    } else {
      console.log('✗ No response to stop command');
      if (newResponses.length > 0) {
        console.log('  New responses received:', newResponses);
        // Check for delayed responses from previous command
        if (newResponses.some(r => r.includes('hello'))) {
          console.log('⚠️  Delayed response from previous command detected\n');
        } else {
          console.log('');
        }
      } else {
        console.log('  No new responses received\n');
      }
    }
    
    // Test 2: Send N=200 (Setpoint) - should get {H_ok} on first
    console.log('Test 2: Setpoint command (N=200)');
    const responsesBefore2 = responses.length;
    const startTime2 = Date.now();
    sendCommand(200, 'setpoint', 100, 0, 200);  // Shortened to avoid truncation
    await wait(1500);
    
    const newResponses2 = responses.slice(responsesBefore2);
    
    if (checkResponseExact('setpoint', 'ok') || newResponses2.some(r => (r.includes('setpoint') || r.includes('setpoi')) && r.includes('ok'))) {
      console.log('✓ Robot responded to setpoint command');
      console.log(`  Response time: ${Date.now() - startTime2}ms`);
      if (newResponses2.length > 0) {
        console.log(`  Response: ${newResponses2[0]}`);
        // Check for truncation
        if (newResponses2[0].includes('setpoi') && !newResponses2[0].includes('setpoint')) {
          console.log('  ⚠️  H field was truncated (expected "setpoint", got "setpoi")');
        }
        console.log('');
      } else {
        console.log('');
      }
    } else {
      console.log('✗ No response to setpoint command');
      if (newResponses2.length > 0) {
        console.log('  New responses received:', newResponses2);
        // Check for delayed responses from previous command
        if (newResponses2.some(r => r.includes('stop'))) {
          console.log('⚠️  Delayed response from previous command detected\n');
        } else {
          console.log('');
        }
      } else {
        console.log('  No new responses received\n');
      }
    }
    
    // Test 3: Send N=210 (Macro) - should get {H_ok} or {H_false}
    console.log('Test 3: Macro command (N=210)');
    const responsesBefore3 = responses.length;
    const startTime3 = Date.now();
    sendCommand(210, 'macro', 4, 200, 5000);  // FORWARD_THEN_STOP, shortened H
    await wait(2000);  // Longer wait for macro processing
    
    const newResponses3 = responses.slice(responsesBefore3);
    
    if (checkResponseExact('macro', 'ok') || checkResponseExact('macro', 'false') || 
        newResponses3.some(r => r.includes('macro') && (r.includes('ok') || r.includes('false')))) {
      console.log('✓ Robot responded to macro command');
      console.log(`  Response time: ${Date.now() - startTime3}ms`);
      if (newResponses3.length > 0) {
        console.log(`  Response: ${newResponses3[0]}\n`);
      } else {
        console.log('');
      }
    } else {
      console.log('✗ No response to macro command');
      if (newResponses3.length > 0) {
        console.log('  New responses received:', newResponses3);
        // Check for delayed response from previous command
        if (newResponses3.some(r => r.includes('setpoint') || r.includes('setpoi') || r.includes('stop'))) {
          console.log('⚠️  Delayed response from previous command detected\n');
        } else {
          console.log('');
        }
      } else {
        console.log('  No new responses received\n');
      }
    }
    
    // Test 4: Send N=100 (Unknown command) - should get {ok} or {H_false}
    console.log('Test 4: Unknown command (N=100)');
    const responsesBefore4 = responses.length;
    const startTime4 = Date.now();
    sendCommand(100, 'unknown');
    await wait(1500);
    
    const newResponses4 = responses.slice(responsesBefore4);
    
    if (newResponses4.some(r => r.includes('ok') || r.includes('false'))) {
      console.log('✓ Robot responded to unknown command');
      console.log(`  Response time: ${Date.now() - startTime4}ms`);
      if (newResponses4.length > 0) {
        console.log(`  Response: ${newResponses4[0]}\n`);
      } else {
        console.log('');
      }
    } else {
      console.log('✗ No response to unknown command');
      if (newResponses4.length > 0) {
        console.log('  New responses received:', newResponses4);
        // Check for delayed response from previous command
        if (newResponses4.some(r => r.includes('macro') || r.includes('setpoint') || r.includes('setpoi'))) {
          console.log('⚠️  Delayed response from previous command detected\n');
        } else {
          console.log('');
        }
      } else {
        console.log('  No new responses received\n');
      }
    }
    
    // Final stop
    console.log('Sending final stop command...');
    sendCommand(201, 'final');
    await wait(1000);
    
    console.log('\n=== Test Complete ===');
    console.log(`Total responses received: ${responses.length}`);
    if (responses.length > 0) {
      console.log('Last responses:', responses.slice(-5));
    }
    
    // Check for reset indicators (excluding initial boot)
    const resetMessages = allMessages.filter((m, idx) => {
      // Only count resets after initial boot period (first 3 messages are boot)
      return idx >= 3 && detectReset(m);
    });
    if (resetMessages.length > 0) {
      console.log(`\n⚠️  Warning: ${resetMessages.length} reset(s) detected during test`);
      console.log('   This may indicate watchdog timeouts or crashes');
      console.log('   Reset messages:', resetMessages);
    }
    
  } catch (error) {
    console.error('Test error:', error);
  } finally {
    testComplete = true;
    if (port && port.isOpen) {
      setTimeout(() => {
        port.close();
        process.exit(0);
      }, 1000);
    }
  }
}

// Initialize serial port
port = new SerialPort({
  path: COM_PORT,
  baudRate: BAUD_RATE,
  autoOpen: false
});

parser = port.pipe(new ReadlineParser({ delimiter: '\n' }));

parser.on('data', (data) => {
  const response = data.toString().trim();
  console.log(`[RECV] ${response}`);
  responses.push(response);
  allMessages.push(response);
  
  // Detect resets in real-time (only after boot is complete)
  if (bootComplete && detectReset(response)) {
    console.log('⚠️  Reset detected! Robot may have crashed or watchdog timeout.');
  }
});

port.on('open', () => {
  console.log(`✓ Serial port ${COM_PORT} opened at ${BAUD_RATE} baud\n`);
  testCommunication();
});

port.on('error', (err) => {
  console.error('✗ Serial port error:', err.message);
  console.error('\nTroubleshooting:');
  console.error('1. Check if COM port is correct');
  console.error('2. Check if robot is connected');
  console.error('3. Check if another program is using the port');
  console.error('4. Try unplugging and replugging USB cable');
  process.exit(1);
});

// Handle Ctrl+C
process.on('SIGINT', () => {
  console.log('\n\nTest interrupted by user');
  if (port && port.isOpen) {
    port.close();
  }
  process.exit(0);
});

// Open port
console.log('Opening serial port...');
port.open();

