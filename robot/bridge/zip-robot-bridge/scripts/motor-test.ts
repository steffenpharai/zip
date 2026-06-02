/**
 * Motor Test Script - Tests all directions with the updated firmware
 */
import WebSocket from 'ws';

const ws = new WebSocket('ws://localhost:8765/robot');
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

ws.on('message', (data) => {
  const msg = JSON.parse(data.toString());
  if (msg.type === 'robot.serial.rx') {
    console.log('  RX:', msg.line);
  }
});

ws.on('error', (err) => {
  console.error('WebSocket error:', err.message);
  process.exit(1);
});

ws.on('open', async () => {
  console.log('=== ZIP Robot Motor Test ===\n');
  console.log('Testing with official ELEGOO parameters...\n');

  // Test 1: Forward
  console.log('1. FORWARD (v=200, w=0) - Both motors forward');
  ws.send(JSON.stringify({
    type: 'robot.command',
    payload: { N: 200, H: 'm', D1: 200, D2: 0, T: 500 }
  }));
  await delay(1500);

  // Test 2: Spin Right (positive w)
  console.log('2. SPIN RIGHT (v=0, w=200) - Left forward, Right backward');
  ws.send(JSON.stringify({
    type: 'robot.command',
    payload: { N: 200, H: 'm', D1: 0, D2: 200, T: 500 }
  }));
  await delay(1500);

  // Test 3: Spin Left (negative w)
  console.log('3. SPIN LEFT (v=0, w=-200) - Left backward, Right forward');
  ws.send(JSON.stringify({
    type: 'robot.command',
    payload: { N: 200, H: 'm', D1: 0, D2: -200, T: 500 }
  }));
  await delay(1500);

  // Test 4: Backward
  console.log('4. BACKWARD (v=-200, w=0) - Both motors backward');
  ws.send(JSON.stringify({
    type: 'robot.command',
    payload: { N: 200, H: 'm', D1: -200, D2: 0, T: 500 }
  }));
  await delay(1500);

  // Test 5: Arc Right
  console.log('5. ARC RIGHT (v=150, w=100) - Forward turning right');
  ws.send(JSON.stringify({
    type: 'robot.command',
    payload: { N: 200, H: 'm', D1: 150, D2: 100, T: 500 }
  }));
  await delay(1500);

  // Test 6: Arc Left
  console.log('6. ARC LEFT (v=150, w=-100) - Forward turning left');
  ws.send(JSON.stringify({
    type: 'robot.command',
    payload: { N: 200, H: 'm', D1: 150, D2: -100, T: 500 }
  }));
  await delay(1500);

  // Stop
  console.log('7. STOP');
  ws.send(JSON.stringify({
    type: 'robot.command',
    payload: { N: 201, H: 'stp' },
    expectReply: true
  }));
  await delay(500);

  console.log('\n=== Test Complete ===');
  console.log('\nExpected behavior:');
  console.log('  - FORWARD: Robot moves straight forward');
  console.log('  - SPIN RIGHT: Robot rotates clockwise in place');
  console.log('  - SPIN LEFT: Robot rotates counter-clockwise in place');
  console.log('  - BACKWARD: Robot moves straight backward');
  console.log('  - ARC RIGHT: Robot curves to the right while moving forward');
  console.log('  - ARC LEFT: Robot curves to the left while moving forward');

  ws.close();
});

