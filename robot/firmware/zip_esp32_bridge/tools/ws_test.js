#!/usr/bin/env node
/**
 * WebSocket Bridge Test Script
 * 
 * Tests communication with the ZIP ESP32 Bridge over WebSocket.
 * Sends commands to the Arduino UNO via the bridge and displays responses.
 * 
 * Usage: node ws_test.js [ws_url]
 *   Default URL: ws://192.168.4.1:81/robot
 */

const WebSocket = require('ws');

const WS_URL = process.argv[2] || 'ws://192.168.4.1:81/robot';
const TIMEOUT_MS = 5000;

let ws;
let responseBuffer = [];
let currentTest = null;
let testTimeout = null;

// Test cases
const tests = [
  {
    name: 'Ping (N=0)',
    command: { N: 0, H: 'ping' },
    expect: (r) => r.includes('ping_ok') || r.includes('H_ok'),
  },
  {
    name: 'Get Diagnostics (N=120)',
    command: { N: 120, H: 'diag' },
    expect: (r) => r.includes('{') && (r.includes('batt') || r.includes('mode')),
  },
  {
    name: 'Ultrasonic Read (N=21)',
    command: { N: 21, H: 'ultra', D1: 2 },
    expect: (r) => r.includes('ultra') || r.includes('_'),
  },
  {
    name: 'Stop Motors (N=201)',
    command: { N: 201, H: 'stop' },
    expect: (r) => r.includes('stop_ok') || r.includes('H_ok'),
  },
];

function log(msg) {
  console.log(`[${new Date().toISOString().slice(11, 23)}] ${msg}`);
}

function sendCommand(cmd) {
  const json = JSON.stringify(cmd);
  log(`TX: ${json}`);
  ws.send(json);
}

function runTest(test) {
  return new Promise((resolve, reject) => {
    currentTest = test;
    responseBuffer = [];
    
    log(`\n--- TEST: ${test.name} ---`);
    sendCommand(test.command);
    
    testTimeout = setTimeout(() => {
      const allResponses = responseBuffer.join(' ');
      if (test.expect(allResponses)) {
        log(`✓ PASS (timeout but response matched)`);
        resolve(true);
      } else {
        log(`✗ FAIL: No matching response within ${TIMEOUT_MS}ms`);
        log(`  Received: ${allResponses || '(nothing)'}`);
        resolve(false);
      }
    }, TIMEOUT_MS);
  });
}

function checkResponse(data) {
  responseBuffer.push(data);
  log(`RX: ${data}`);
  
  if (currentTest && currentTest.expect(responseBuffer.join(' '))) {
    clearTimeout(testTimeout);
    log(`✓ PASS`);
    currentTest = null;
  }
}

async function runAllTests() {
  log(`Connecting to ${WS_URL}...`);
  
  ws = new WebSocket(WS_URL);
  
  ws.on('open', async () => {
    log('Connected!\n');
    log('========================================');
    log('  ZIP ESP32 Bridge WebSocket Test');
    log('========================================\n');
    
    let passed = 0;
    let failed = 0;
    
    for (const test of tests) {
      const result = await runTest(test);
      if (result) passed++;
      else failed++;
      
      // Small delay between tests
      await new Promise(r => setTimeout(r, 500));
    }
    
    log('\n========================================');
    log(`  Results: ${passed} passed, ${failed} failed`);
    log('========================================\n');
    
    ws.close();
    process.exit(failed > 0 ? 1 : 0);
  });
  
  ws.on('message', (data) => {
    checkResponse(data.toString());
  });
  
  ws.on('error', (err) => {
    log(`ERROR: ${err.message}`);
    process.exit(1);
  });
  
  ws.on('close', () => {
    log('Connection closed');
  });
}

// Check for ws module
try {
  require.resolve('ws');
} catch (e) {
  console.log('Installing ws module...');
  require('child_process').execSync('npm install ws', { 
    cwd: __dirname,
    stdio: 'inherit' 
  });
}

runAllTests();

