#!/usr/bin/env node
const { SerialPort } = require('serialport');

const port = process.argv[2] || 'COM5';
const s = new SerialPort({ path: port, baudRate: 115200 });

let buf = '';
s.on('data', d => {
  buf += d.toString();
  let lines = buf.split('\n');
  buf = lines.pop();
  lines.forEach(l => {
    l = l.trim();
    if (l) console.log('<< ' + l);
  });
});

console.log('=== Battery Diagnostic ===');
console.log('Port: ' + port);
console.log('Waiting for boot...\n');

setTimeout(() => {
  console.log('\n>> Diagnostic: {"N":23,"H":"diag","D1":1}');
  s.write('{"N":23,"H":"diag","D1":1}\n');
}, 3000);

setTimeout(() => {
  console.log('\n>> Normal: {"N":23,"H":"bat"}');
  s.write('{"N":23,"H":"bat"}\n');
}, 4000);

setTimeout(() => {
  console.log('\n=== Done ===');
  s.close();
  process.exit(0);
}, 6000);

