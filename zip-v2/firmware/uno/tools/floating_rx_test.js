#!/usr/bin/env node
/**
 * Floating RX Pin Diagnostic Test
 * 
 * This script monitors the Arduino UNO serial output to detect
 * if noise on the floating RX pin is triggering motor commands.
 * 
 * Usage: node floating_rx_test.js COM5
 * 
 * Test procedure:
 * 1. Power on robot with USB connected
 * 2. Run this script
 * 3. Observe output for DBG: messages showing command counts
 * 4. If motors spin when USB disconnected, reconnect and check logs
 */

const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');
const fs = require('fs');

const PORT = process.argv[2] || 'COM5';
const BAUD = 115200;
const LOG_FILE = '../../../.cursor/debug.log';

// Counters for analysis
let totalLines = 0;
let debugLines = 0;
let motorCmds = 0;
let lastN = -999;
let bootMessages = [];
let startTime = Date.now();

function log(msg) {
  const ts = new Date().toISOString();
  console.log(`[${ts}] ${msg}`);
}

function writeDebugLog(entry) {
  const line = JSON.stringify({
    ...entry,
    timestamp: Date.now(),
    sessionId: 'floating-rx-test',
    hypothesisId: entry.hypothesisId || 'unknown'
  }) + '\n';
  
  try {
    fs.appendFileSync(LOG_FILE, line);
  } catch (e) {
    // Ignore file errors
  }
}

async function main() {
  log(`Opening ${PORT} at ${BAUD} baud...`);
  log('');
  log('='.repeat(60));
  log('  FLOATING RX PIN DIAGNOSTIC TEST');
  log('='.repeat(60));
  log('');
  log('Watching for DBG: messages from UNO firmware...');
  log('Motor commands from noise will show as increasing m= count');
  log('Press Ctrl+C to stop');
  log('');
  
  const port = new SerialPort({ path: PORT, baudRate: BAUD });
  const parser = port.pipe(new ReadlineParser({ delimiter: '\n' }));
  
  // Wait for port to open
  await new Promise((resolve, reject) => {
    port.on('open', resolve);
    port.on('error', reject);
  });
  
  log('Port opened. Waiting for Arduino reset...');
  
  // Log start
  writeDebugLog({
    location: 'floating_rx_test.js:start',
    message: 'Test started',
    data: { port: PORT, baud: BAUD },
    hypothesisId: 'A'
  });
  
  parser.on('data', (line) => {
    totalLines++;
    const trimmed = line.trim();
    
    // Capture boot messages
    if (Date.now() - startTime < 5000) {
      bootMessages.push(trimmed);
    }
    
    // Look for our debug output
    if (trimmed.startsWith('DBG:')) {
      debugLines++;
      
      // Parse debug line: DBG:n=X,m=Y,N=Z,ms=T
      const match = trimmed.match(/n=(\d+),m=(\d+),N=(-?\d+),ms=(\d+)/);
      if (match) {
        const cmdCount = parseInt(match[1]);
        const motorCount = parseInt(match[2]);
        const nValue = parseInt(match[3]);
        const msTime = parseInt(match[4]);
        
        motorCmds = motorCount;
        lastN = nValue;
        
        log(`[DEBUG] Commands: ${cmdCount}, Motor cmds: ${motorCount}, Last N=${nValue}, Time=${msTime}ms`);
        
        // Log to debug file
        writeDebugLog({
          location: 'floating_rx_test.js:debug',
          message: 'Debug output received',
          data: { cmdCount, motorCount, nValue, msTime },
          hypothesisId: 'A,B'
        });
        
        // Alert if motor commands are happening without user input
        if (motorCount > 0) {
          log(`  ⚠️  MOTOR COMMANDS DETECTED! Possible noise on RX pin.`);
          writeDebugLog({
            location: 'floating_rx_test.js:motor_alert',
            message: 'Motor commands from possible noise',
            data: { motorCount, nValue },
            hypothesisId: 'B'
          });
        }
      }
    } else if (trimmed.startsWith('HW:') || trimmed.startsWith('INIT:') || trimmed === 'R') {
      // Boot messages
      log(`[BOOT] ${trimmed}`);
    } else if (trimmed.startsWith('{')) {
      // Response from Arduino
      log(`[RESP] ${trimmed}`);
    } else if (trimmed.length > 0) {
      // Other output
      log(`[INFO] ${trimmed}`);
    }
  });
  
  // After 5 seconds, send a test command
  setTimeout(() => {
    log('');
    log('--- Sending test ping command ---');
    port.write('{"N":0,"H":"test"}\n');
  }, 5000);
  
  // After 10 seconds, send stop command
  setTimeout(() => {
    log('');
    log('--- Sending stop command ---');
    port.write('{"N":201,"H":"stop"}\n');
  }, 10000);
  
  // Summary every 15 seconds
  setInterval(() => {
    log('');
    log(`--- SUMMARY: ${totalLines} lines, ${debugLines} debug, ${motorCmds} motor cmds, last N=${lastN} ---`);
    
    writeDebugLog({
      location: 'floating_rx_test.js:summary',
      message: 'Periodic summary',
      data: { totalLines, debugLines, motorCmds, lastN },
      hypothesisId: 'A,B'
    });
  }, 15000);
  
  // Handle exit
  process.on('SIGINT', () => {
    log('');
    log('='.repeat(60));
    log('  TEST COMPLETE');
    log('='.repeat(60));
    log(`Total lines received: ${totalLines}`);
    log(`Debug lines: ${debugLines}`);
    log(`Motor commands detected: ${motorCmds}`);
    log('');
    
    if (motorCmds > 0) {
      log('⚠️  MOTOR COMMANDS WERE TRIGGERED!');
      log('This confirms noise on floating RX pin is causing motor activation.');
      log('');
      log('Recommended fix: Add pull-up resistor or stricter validation.');
    } else {
      log('✓ No unexpected motor commands detected while USB connected.');
      log('Try disconnecting USB and observing robot behavior.');
    }
    
    writeDebugLog({
      location: 'floating_rx_test.js:end',
      message: 'Test completed',
      data: { totalLines, debugLines, motorCmds },
      hypothesisId: 'A,B'
    });
    
    port.close();
    process.exit(0);
  });
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});

