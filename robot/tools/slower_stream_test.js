#!/usr/bin/env node
/**
 * Slower Stream Test
 * 
 * Tests streaming at different rates to find what works.
 * 
 * Usage:
 *   node slower_stream_test.js COM5 115200
 */

const { SerialPort } = require('serialport');

const args = process.argv.slice(2);
if (args.length < 2) {
  console.log('Usage: node slower_stream_test.js <port> <baudrate>');
  process.exit(1);
}

const portPath = args[0];
const baudRate = parseInt(args[1], 10);

console.log(`\n=== Slower Stream Test ===`);
console.log(`Port: ${portPath}`);
console.log(`Baud: ${baudRate}`);
console.log(`===========================\n`);

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
      setTimeout(runTests, 100);
    }
  }
});

function sendCommand(cmd) {
  const json = JSON.stringify(cmd);
  port.write(json + '\n');
  console.log(`[TX] ${json}`);
}

function runTests() {
  console.log('[TEST] Sending hello...');
  sendCommand({ N: 0, H: 'hello' });
  
  setTimeout(() => {
    // Test 1: Single command with long TTL (like test 8)
    console.log('\n[TEST 1] Single command T=2000ms (like test 8)...');
    sendCommand({ N: 200, H: 'sp', D1: 200, D2: 0, T: 2000 });
    
    setTimeout(() => {
      sendCommand({ N: 201, H: 'stop' });
      
      setTimeout(() => {
        // Test 2: Stream at 10Hz (100ms interval) with T=500ms
        console.log('\n[TEST 2] Streaming at 10Hz (100ms) with T=500ms...');
        const startTime = Date.now();
        const duration = 2000;
        let count = 0;
        
        const interval = setInterval(() => {
          if (Date.now() - startTime >= duration) {
            clearInterval(interval);
            console.log(`\n[INFO] Sent ${count} commands`);
            sendCommand({ N: 201, H: 'stop' });
            
            setTimeout(() => {
              // Test 3: Stream at 5Hz (200ms interval) with T=1000ms
              console.log('\n[TEST 3] Streaming at 5Hz (200ms) with T=1000ms...');
              const startTime2 = Date.now();
              const duration2 = 2000;
              let count2 = 0;
              
              const interval2 = setInterval(() => {
                if (Date.now() - startTime2 >= duration2) {
                  clearInterval(interval2);
                  console.log(`\n[INFO] Sent ${count2} commands`);
                  sendCommand({ N: 201, H: 'stop' });
                  
                  setTimeout(() => {
                    // Test 4: Just send commands every 200ms without strict timing
                    console.log('\n[TEST 4] Sending commands every 200ms (T=1000ms)...');
                    let count3 = 0;
                    const maxCommands = 10;
                    
                    const interval3 = setInterval(() => {
                      if (count3 >= maxCommands) {
                        clearInterval(interval3);
                        console.log(`\n[INFO] Sent ${count3} commands`);
                        sendCommand({ N: 201, H: 'stop' });
                        
                        setTimeout(() => {
                          console.log('\n[TEST] All tests complete!');
                          port.close(() => process.exit(0));
                        }, 500);
                        return;
                      }
                      
                      sendCommand({ N: 200, H: 'sp', D1: 200, D2: 0, T: 1000 });
                      count3++;
                    }, 200);
                  }, 1000);
                } else {
                  sendCommand({ N: 200, H: 'sp', D1: 200, D2: 0, T: 1000 });
                  count2++;
                }
              }, 200);
            }, 1000);
          } else {
            sendCommand({ N: 200, H: 'sp', D1: 200, D2: 0, T: 500 });
            count++;
          }
        }, 100);
      }, 2500);
    }, 2500);
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
      runTests();
    }
  }, 2000);
});

process.on('SIGINT', () => {
  sendCommand({ N: 201, H: 'stop' });
  setTimeout(() => port.close(() => process.exit(0)), 200);
});

