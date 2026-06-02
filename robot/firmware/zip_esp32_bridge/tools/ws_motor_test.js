#!/usr/bin/env node
/**
 * WebSocket Motor Test Script
 * 
 * Tests motor control via the ZIP ESP32 Bridge.
 * WARNING: This will move the robot! Ensure it's on a safe surface.
 * 
 * Usage: node ws_motor_test.js [ws_url]
 *   Default URL: ws://192.168.4.1:81/robot
 */

const WebSocket = require('ws');

const WS_URL = process.argv[2] || 'ws://192.168.4.1:81/robot';

let ws;

function log(msg) {
  console.log(`[${new Date().toISOString().slice(11, 23)}] ${msg}`);
}

function send(cmd) {
  const json = JSON.stringify(cmd);
  log(`TX: ${json}`);
  ws.send(json);
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function runMotorTest() {
  log(`Connecting to ${WS_URL}...`);
  
  ws = new WebSocket(WS_URL);
  
  ws.on('open', async () => {
    log('Connected!\n');
    log('========================================');
    log('  ZIP ESP32 Bridge Motor Test');
    log('  WARNING: Robot will move!');
    log('========================================\n');
    
    try {
      // Initial stop
      log('\n--- Ensuring motors stopped ---');
      send({ N: 201, H: 'init_stop' });
      await sleep(500);
      
      // Test 1: Brief forward pulse
      log('\n--- TEST 1: Forward pulse (0.5s) ---');
      send({ N: 999, H: 'fwd', D1: 100, D2: 100 });
      await sleep(500);
      send({ N: 201, H: 'stop1' });
      await sleep(500);
      
      // Test 2: Brief reverse pulse
      log('\n--- TEST 2: Reverse pulse (0.5s) ---');
      send({ N: 999, H: 'rev', D1: -100, D2: -100 });
      await sleep(500);
      send({ N: 201, H: 'stop2' });
      await sleep(500);
      
      // Test 3: Spin left
      log('\n--- TEST 3: Spin left (0.5s) ---');
      send({ N: 999, H: 'spinL', D1: -80, D2: 80 });
      await sleep(500);
      send({ N: 201, H: 'stop3' });
      await sleep(500);
      
      // Test 4: Spin right
      log('\n--- TEST 4: Spin right (0.5s) ---');
      send({ N: 999, H: 'spinR', D1: 80, D2: -80 });
      await sleep(500);
      send({ N: 201, H: 'stop4' });
      await sleep(500);
      
      // Test 5: Setpoint streaming (5 packets at 20Hz)
      log('\n--- TEST 5: Setpoint stream (5 packets) ---');
      for (let i = 0; i < 5; i++) {
        send({ N: 200, D1: 60, D2: 0, T: 200 });
        await sleep(50);
      }
      await sleep(300);
      send({ N: 201, H: 'stop5' });
      
      log('\n========================================');
      log('  Motor test complete!');
      log('========================================\n');
      
    } catch (err) {
      log(`ERROR: ${err.message}`);
    }
    
    // Final stop
    send({ N: 201, H: 'final' });
    await sleep(200);
    
    ws.close();
    process.exit(0);
  });
  
  ws.on('message', (data) => {
    log(`RX: ${data.toString()}`);
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

runMotorTest();

