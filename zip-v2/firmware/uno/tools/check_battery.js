#!/usr/bin/env node
/**
 * Battery Voltage Check - ZIP Robot
 * Reads and displays the current battery voltage
 */

const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');

const port = process.argv[2] || 'COM5';

console.log('=== ZIP Robot Battery Check ===');
console.log('Port:', port);
console.log('');

const serial = new SerialPort({ path: port, baudRate: 115200 });
const parser = serial.pipe(new ReadlineParser({ delimiter: '\n' }));

let gotReading = false;

parser.on('data', (line) => {
  line = line.trim();
  if (line.length > 0) {
    console.log('<< ' + line);
  }
  
  if (line.includes('batt_')) {
    const match = line.match(/batt_(\d+)/);
    if (match) {
      gotReading = true;
      const mv = parseInt(match[1]);
      console.log('');
      console.log('════════════════════════════════');
      console.log('  BATTERY READING');
      console.log('════════════════════════════════');
      console.log('  Raw value:  ' + mv + ' mV');
      console.log('  Voltage:    ' + (mv/1000).toFixed(2) + ' V');
      console.log('');
      
      // 2S Li-ion pack: 6.0V (empty) to 8.4V (full)
      if (mv < 1000) {
        console.log('  Status: NO BATTERY or disconnected');
      } else if (mv < 6000) {
        console.log('  Status: ⚠️  LOW VOLTAGE');
        console.log('  Expected: 6.0V - 8.4V for 2S Li-ion');
        console.log('  Note: ADC may be reading USB 5V through divider');
      } else if (mv < 7000) {
        console.log('  Status: ⚠️  LOW - Charge soon');
      } else if (mv <= 8400) {
        console.log('  Status: ✅ GOOD');
      } else {
        console.log('  Status: ⚠️  HIGH - Check circuit');
      }
      console.log('════════════════════════════════');
      
      setTimeout(() => { 
        serial.close(); 
        process.exit(0); 
      }, 300);
    }
  }
});

// Wait for boot messages then send command
setTimeout(() => {
  console.log('>> {"N":23,"H":"batt"}');
  serial.write('{"N":23,"H":"batt"}\n');
}, 800);

// Timeout
setTimeout(() => {
  if (!gotReading) {
    console.log('');
    console.log('ERROR: No battery response received');
    serial.close();
    process.exit(1);
  }
}, 4000);

