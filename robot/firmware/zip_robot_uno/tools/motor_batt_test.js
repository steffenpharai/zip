#!/usr/bin/env node
/**
 * Motor Battery Load Test
 * Verifies motors are powered by battery by checking voltage drop under load
 */
const { SerialPort } = require('serialport');

const port = process.argv[2] || 'COM5';
const s = new SerialPort({ path: port, baudRate: 115200 });

let buf = '';
const readings = [];

s.on('data', d => {
  buf += d.toString();
  let lines = buf.split('\n');
  buf = lines.pop();
  lines.forEach(l => {
    l = l.trim();
    if (l) {
      console.log('<< ' + l);
      // Extract battery voltage
      const match = l.match(/batt_(\d+)|batt=(\d+)|batt_mv:(\d+)/);
      if (match) {
        const mv = parseInt(match[1] || match[2] || match[3]);
        readings.push(mv);
      }
    }
  });
});

console.log('═══════════════════════════════════════════════════');
console.log('  MOTOR BATTERY LOAD TEST');
console.log('═══════════════════════════════════════════════════');
console.log('Port: ' + port);
console.log('');
console.log('This test will:');
console.log('  1. Read battery voltage at rest');
console.log('  2. Run motors at full speed');
console.log('  3. Read battery voltage under load');
console.log('  4. Compare to verify battery powers motors');
console.log('');

let step = 0;

// Wait for boot
setTimeout(() => {
  console.log('───────────────────────────────────────────────────');
  console.log('STEP 1: Battery at REST');
  console.log('>> {"N":23,"H":"rest","D1":1}');
  s.write('{"N":23,"H":"rest","D1":1}\n');
  step = 1;
}, 3000);

// Start motors at high PWM
setTimeout(() => {
  console.log('');
  console.log('───────────────────────────────────────────────────');
  console.log('STEP 2: Starting motors at PWM 200 (high load)');
  console.log('>> {"N":999,"H":"fwd","D1":200,"D2":200}');
  s.write('{"N":999,"H":"fwd","D1":200,"D2":200}\n');
  step = 2;
}, 4500);

// Read voltage under load (multiple times)
setTimeout(() => {
  console.log('');
  console.log('───────────────────────────────────────────────────');
  console.log('STEP 3: Battery UNDER LOAD (motors running)');
  console.log('>> {"N":23,"H":"load1","D1":1}');
  s.write('{"N":23,"H":"load1","D1":1}\n');
}, 5500);

setTimeout(() => {
  console.log('>> {"N":23,"H":"load2","D1":1}');
  s.write('{"N":23,"H":"load2","D1":1}\n');
}, 6500);

// Stop motors
setTimeout(() => {
  console.log('');
  console.log('───────────────────────────────────────────────────');
  console.log('STEP 4: Stopping motors');
  console.log('>> {"N":201,"H":"stop"}');
  s.write('{"N":201,"H":"stop"}\n');
  step = 4;
}, 7500);

// Read voltage after stopping
setTimeout(() => {
  console.log('');
  console.log('───────────────────────────────────────────────────');
  console.log('STEP 5: Battery after motors stopped');
  console.log('>> {"N":23,"H":"after","D1":1}');
  s.write('{"N":23,"H":"after","D1":1}\n');
  step = 5;
}, 8500);

// Summary
setTimeout(() => {
  console.log('');
  console.log('═══════════════════════════════════════════════════');
  console.log('  RESULTS');
  console.log('═══════════════════════════════════════════════════');
  
  if (readings.length >= 3) {
    const rest = readings[0];
    const load = readings.length > 2 ? Math.min(readings[1], readings[2]) : readings[1];
    const after = readings[readings.length - 1];
    const drop = rest - load;
    
    console.log('  At Rest:      ' + rest + ' mV');
    console.log('  Under Load:   ' + load + ' mV');
    console.log('  After Stop:   ' + after + ' mV');
    console.log('  Voltage Drop: ' + drop + ' mV');
    console.log('');
    
    if (drop > 50) {
      console.log('  ✅ CONFIRMED: Motors ARE powered by battery!');
      console.log('     Voltage dropped ' + drop + 'mV under motor load.');
    } else if (drop > 10) {
      console.log('  ⚠️  POSSIBLE: Small voltage drop detected (' + drop + 'mV)');
      console.log('     Motors may be powered by battery with low draw.');
    } else {
      console.log('  ❌ WARNING: No significant voltage drop detected!');
      console.log('     Motors may NOT be powered by battery.');
      console.log('     Check: Is battery connected to motor driver?');
    }
  } else {
    console.log('  ERROR: Not enough readings collected');
    console.log('  Readings: ' + JSON.stringify(readings));
  }
  
  console.log('═══════════════════════════════════════════════════');
  s.close();
  process.exit(0);
}, 10000);

