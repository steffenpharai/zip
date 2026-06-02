#!/usr/bin/env node
/**
 * Comprehensive Motor Test
 * 
 * Tests motors with various PWM values and patterns to find what works.
 * 
 * Usage:
 *   node comprehensive_motor_test.js COM5 115200
 */

const { SerialPort } = require('serialport');

const args = process.argv.slice(2);
if (args.length < 2) {
  console.log('Usage: node comprehensive_motor_test.js <port> <baudrate>');
  process.exit(1);
}

const portPath = args[0];
const baudRate = parseInt(args[1], 10);

console.log(`\n=== Comprehensive Motor Test ===`);
console.log(`Port: ${portPath}`);
console.log(`Baud: ${baudRate}`);
console.log(`==================================\n`);

let rxBuffer = '';
let ready = false;
let testStep = 0;

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
    
    if (line.length > 0 && line !== 'R') {
      console.log(`[RX] ${line}`);
    }
    if (line === 'R' && !ready) {
      ready = true;
      setTimeout(runTests, 100);
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

function runTests() {
  console.log('\n[TEST] Starting comprehensive motor tests...\n');
  
  // Test 1: Very low PWM (50)
  console.log('[TEST 1] Low PWM (50, 50) for 2 seconds...');
  sendCommand({ N: 999, H: 'test1', D1: 50, D2: 50 });
  setTimeout(() => {
    sendCommand({ N: 999, H: 'stop1', D1: 0, D2: 0 });
    
    // Test 2: Medium PWM (150)
    setTimeout(() => {
      console.log('\n[TEST 2] Medium PWM (150, 150) for 2 seconds...');
      sendCommand({ N: 999, H: 'test2', D1: 150, D2: 150 });
      setTimeout(() => {
        sendCommand({ N: 999, H: 'stop2', D1: 0, D2: 0 });
        
        // Test 3: High PWM (200)
        setTimeout(() => {
          console.log('\n[TEST 3] High PWM (200, 200) for 2 seconds...');
          sendCommand({ N: 999, H: 'test3', D1: 200, D2: 200 });
          setTimeout(() => {
            sendCommand({ N: 999, H: 'stop3', D1: 0, D2: 0 });
            
            // Test 4: Max PWM (255)
            setTimeout(() => {
              console.log('\n[TEST 4] Maximum PWM (255, 255) for 2 seconds...');
              sendCommand({ N: 999, H: 'test4', D1: 255, D2: 255 });
              setTimeout(() => {
                sendCommand({ N: 999, H: 'stop4', D1: 0, D2: 0 });
                
                // Test 5: Left motor only
                setTimeout(() => {
                  console.log('\n[TEST 5] Left motor only (200, 0) for 2 seconds...');
                  sendCommand({ N: 999, H: 'test5', D1: 200, D2: 0 });
                  setTimeout(() => {
                    sendCommand({ N: 999, H: 'stop5', D1: 0, D2: 0 });
                    
                    // Test 6: Right motor only
                    setTimeout(() => {
                      console.log('\n[TEST 6] Right motor only (0, 200) for 2 seconds...');
                      sendCommand({ N: 999, H: 'test6', D1: 0, D2: 200 });
                      setTimeout(() => {
                        sendCommand({ N: 999, H: 'stop6', D1: 0, D2: 0 });
                        
                        // Test 7: Reverse
                        setTimeout(() => {
                          console.log('\n[TEST 7] Reverse (-200, -200) for 2 seconds...');
                          sendCommand({ N: 999, H: 'test7', D1: -200, D2: -200 });
                          setTimeout(() => {
                            sendCommand({ N: 999, H: 'stop7', D1: 0, D2: 0 });
                            
                            // Test 8: N=200 setpoint
                            setTimeout(() => {
                              console.log('\n[TEST 8] N=200 setpoint (v=200, w=0) for 2 seconds...');
                              sendCommand({ N: 200, H: 'sp', D1: 200, D2: 0, T: 2000 });
                              setTimeout(() => {
                                sendCommand({ N: 201, H: 'stop' });
                                
                                setTimeout(() => {
                                  console.log('\n[TEST] All tests complete!');
                                  console.log('\nIf no motion was observed:');
                                  console.log('1. Check battery is ON and charged');
                                  console.log('2. Verify motor wires connected to TB6612 terminals');
                                  console.log('3. Verify STBY pin (Arduino pin 3) connected to TB6612');
                                  console.log('4. Check PWM pins (5,6) and direction pins (7,8) connections');
                                  port.close(() => process.exit(0));
                                }, 500);
                              }, 2000);
                            }, 1000);
                          }, 2000);
                        }, 1000);
                      }, 2000);
                    }, 1000);
                  }, 2000);
                }, 1000);
              }, 2000);
            }, 1000);
          }, 2000);
        }, 1000);
      }, 2000);
    }, 1000);
  }, 2000);
}

port.open((err) => {
  if (err) {
    console.error(`[ERROR] Cannot open port: ${err.message}`);
    process.exit(1);
  }
  
  console.log('[INFO] Port opened, waiting for ready marker...');
  setTimeout(() => {
    if (!ready) {
      console.log('[WARN] Timeout, starting test anyway...');
      ready = true;
      runTests();
    }
  }, 2000);
});

process.on('SIGINT', () => {
  sendCommand({ N: 201, H: 'stop' });
  setTimeout(() => port.close(() => process.exit(0)), 200);
});

