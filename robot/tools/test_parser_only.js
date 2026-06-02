#!/usr/bin/env node
/**
 * Parser-Only Test
 * 
 * Tests if the JSON parser can handle multiple commands
 * Sends only N=0 (hello) commands to isolate parser issues
 * 
 * Usage: node test_parser_only.js <COM_PORT> [baud_rate]
 */

const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');

const COM_PORT = process.argv[2] || 'COM5';
const BAUD_RATE = parseInt(process.argv[3] || '115200', 10);

let port = null;
let parser = null;
let responses = [];

function sendCommand(N, H) {
  const cmd = JSON.stringify({ N, H, D1: 0, D2: 0, T: 0 });
  console.log(`[SEND] ${cmd}`);
  if (port && port.isOpen) {
    port.write(cmd + '\n');
  }
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testParser() {
  console.log('=== Parser-Only Test (N=0 only) ===');
  console.log(`Port: ${COM_PORT}, Baud: ${BAUD_RATE}\n`);
  
  await wait(3000); // Wait for boot
  
  try {
    // Send 5 hello commands in a row
    for (let i = 1; i <= 5; i++) {
      console.log(`\nTest ${i}: Sending hello command...`);
      responses = [];
      const startTime = Date.now();
      sendCommand(0, `hello${i}`);
      await wait(1500);
      
      const elapsed = Date.now() - startTime;
      if (responses.length > 0) {
        console.log(`✓ Response received in ${elapsed}ms:`, responses);
      } else {
        console.log(`✗ No response after ${elapsed}ms`);
        console.log('⚠️  Parser may have stopped working after previous command');
        break;
      }
    }
    
    console.log('\n=== Test Complete ===');
    console.log(`Total responses: ${responses.length}`);
    
  } catch (error) {
    console.error('Test error:', error);
  } finally {
    if (port && port.isOpen) {
      setTimeout(() => {
        port.close();
        process.exit(0);
      }, 1000);
    }
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
  responses.push(response);
});

port.on('open', () => {
  console.log(`✓ Serial port ${COM_PORT} opened\n`);
  testParser();
});

port.on('error', (err) => {
  console.error('✗ Serial port error:', err.message);
  process.exit(1);
});

process.on('SIGINT', () => {
  if (port && port.isOpen) {
    port.close();
  }
  process.exit(0);
});

console.log('Opening serial port...');
port.open();

