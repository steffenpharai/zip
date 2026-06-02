#!/usr/bin/env node
/**
 * Simple Communication Test - Minimal
 * 
 * Just sends a hello command and checks for response
 * 
 * Usage: node simple_test.js <COM_PORT>
 */

const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');

const COM_PORT = process.argv[2] || 'COM3';
const BAUD_RATE = 115200;

let port = null;
let parser = null;
let gotResponse = false;

function sendCommand(N, H, D1 = 0, D2 = 0, T = 0) {
  const cmd = JSON.stringify({ N, H, D1, D2, T });
  console.log(`[SEND] ${cmd}`);
  if (port && port.isOpen) {
    port.write(cmd + '\n');
  }
}

port = new SerialPort({
  path: COM_PORT,
  baudRate: BAUD_RATE,
  autoOpen: false
});

parser = port.pipe(new ReadlineParser({ delimiter: '\n' }));

parser.on('data', (data) => {
  const response = data.toString().trim();
  console.log(`[RECV] ${response}`);
  gotResponse = true;
  
  if (response.includes('ok') || response.includes('ZIP Robot')) {
    console.log('\n✓✓✓ COMMUNICATION VERIFIED ✓✓✓');
    console.log('Robot is responding correctly!\n');
    setTimeout(() => {
      if (port && port.isOpen) {
        port.close();
      }
      process.exit(0);
    }, 1000);
  }
});

port.on('open', () => {
  console.log(`Serial port ${COM_PORT} opened at ${BAUD_RATE} baud\n`);
  console.log('Waiting for robot to finish booting...\n');
  
  // Wait longer for robot to finish boot sequence
  setTimeout(() => {
    console.log('Sending hello command...\n');
    sendCommand(0, 'hello');
    
    setTimeout(() => {
      if (!gotResponse) {
        console.log('\n✗✗✗ NO RESPONSE ✗✗✗');
        console.log('\nTroubleshooting:');
        console.log('1. Check COM port is correct');
        console.log('2. Check firmware is uploaded (new motion firmware)');
        console.log('3. Check baud rate matches (115200)');
        console.log('4. Try unplugging/replugging USB');
        console.log('5. Check if ESP32/Bluetooth module is blocking RX/TX');
        console.log('6. Try resetting robot (press reset button)');
        console.log('\nNote: If robot sends boot messages but no JSON responses,');
        console.log('      the new motion firmware may not be uploaded yet.');
      }
      if (port && port.isOpen) {
        port.close();
      }
      process.exit(gotResponse ? 0 : 1);
    }, 3000);  // Increased timeout
  }, 3000);  // Wait 3 seconds for boot to complete
});

port.on('error', (err) => {
  console.error('Serial port error:', err.message);
  console.error('\nTroubleshooting:');
  console.error('1. Check if COM port exists');
  console.error('2. Check if another program is using the port');
  console.error('3. Try a different COM port');
  process.exit(1);
});

process.on('SIGINT', () => {
  console.log('\n\nTest interrupted');
  if (port && port.isOpen) {
    port.close();
  }
  process.exit(0);
});

console.log('=== Simple Communication Test ===');
console.log(`Port: ${COM_PORT}`);
console.log(`Baud: ${BAUD_RATE}\n`);
port.open();

