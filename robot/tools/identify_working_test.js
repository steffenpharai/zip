#!/usr/bin/env node
/**
 * Identify Working Test
 * 
 * Runs each test individually with clear labels to identify which one works.
 * 
 * Usage:
 *   node identify_working_test.js COM5 115200
 */

const { SerialPort } = require('serialport');

const args = process.argv.slice(2);
if (args.length < 2) {
  console.log('Usage: node identify_working_test.js <port> <baudrate>');
  process.exit(1);
}

const portPath = args[0];
const baudRate = parseInt(args[1], 10);

console.log(`\n=== Identify Working Test ===`);
console.log(`Port: ${portPath}`);
console.log(`Baud: ${baudRate}`);
console.log(`==============================\n`);

let rxBuffer = '';
let ready = false;
let currentTest = 0;

const tests = [
  { name: 'TEST 1: N=999 Low PWM (50, 50)', cmd: { N: 999, H: 'test1', D1: 50, D2: 50 } },
  { name: 'TEST 2: N=999 Medium PWM (150, 150)', cmd: { N: 999, H: 'test2', D1: 150, D2: 150 } },
  { name: 'TEST 3: N=999 High PWM (200, 200)', cmd: { N: 999, H: 'test3', D1: 200, D2: 200 } },
  { name: 'TEST 4: N=999 Max PWM (255, 255)', cmd: { N: 999, H: 'test4', D1: 255, D2: 255 } },
  { name: 'TEST 5: N=999 Left only (200, 0)', cmd: { N: 999, H: 'test5', D1: 200, D2: 0 } },
  { name: 'TEST 6: N=999 Right only (0, 200)', cmd: { N: 999, H: 'test6', D1: 0, D2: 200 } },
  { name: 'TEST 7: N=999 Reverse (-200, -200)', cmd: { N: 999, H: 'test7', D1: -200, D2: -200 } },
  { name: 'TEST 8: N=200 Setpoint (v=200, w=0, T=2000)', cmd: { N: 200, H: 'sp', D1: 200, D2: 0, T: 2000 } },
  { name: 'TEST 9: N=200 Setpoint (v=200, w=0, T=300)', cmd: { N: 200, H: 'sp', D1: 200, D2: 0, T: 300 } },
  { name: 'TEST 10: N=200 Setpoint (v=255, w=0, T=2000)', cmd: { N: 200, H: 'sp', D1: 255, D2: 0, T: 2000 } },
];

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
      setTimeout(runNextTest, 500);
    }
  }
});

function sendCommand(cmd) {
  const json = JSON.stringify(cmd);
  port.write(json + '\n');
}

function runNextTest() {
  if (currentTest >= tests.length) {
    console.log('\n========================================');
    console.log('[TEST] All tests complete!');
    console.log('========================================');
    console.log('\nWhich test number made the robot move?');
    console.log('Please note the test number and report it.');
    port.close(() => process.exit(0));
    return;
  }
  
  const test = tests[currentTest];
  console.log('\n' + '='.repeat(50));
  console.log(`[${currentTest + 1}/${tests.length}] ${test.name}`);
  console.log('='.repeat(50));
  console.log('[INFO] Sending command in 1 second...');
  console.log('[INFO] Watch the robot carefully!');
  console.log(`[TX] ${JSON.stringify(test.cmd)}`);
  
  setTimeout(() => {
    sendCommand(test.cmd);
    
    setTimeout(() => {
      // Stop after 2 seconds - use N=201 to properly stop all motion
      console.log('[INFO] Sending stop command...');
      sendCommand({ N: 201, H: 'stop' });
      
      console.log('[INFO] Command sent. Did the robot move?');
      console.log('[INFO] Waiting 3 seconds before next test...\n');
      
      currentTest++;
      setTimeout(runNextTest, 3000);
    }, 2000);
  }, 1000);
}

port.open((err) => {
  if (err) {
    console.error(`[ERROR] Cannot open port: ${err.message}`);
    process.exit(1);
  }
  
  console.log('[INFO] Port opened, sending hello...');
  sendCommand({ N: 0, H: 'hello' });
  
  setTimeout(() => {
    if (!ready) {
      console.log('[WARN] Timeout waiting for ready, starting tests anyway...');
      ready = true;
      runNextTest();
    }
  }, 2000);
});

process.on('SIGINT', () => {
  sendCommand({ N: 201, H: 'stop' });
  setTimeout(() => port.close(() => process.exit(0)), 200);
});

