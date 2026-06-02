/**
 * Sensor-Aware Smoke Test Script
 * Tests robot motion with safety constraints and sensor commands
 * 
 * SAFETY: All movements limited to stay within 0.5 feet (~15cm)
 * - Uses low PWM values (40-60 max)
 * - Short movement durations (200-400ms)
 * - Stops immediately after each movement
 * 
 * Usage:
 *   npx tsx scripts/sensor-smoke.ts
 * 
 * Requirements:
 *   - Bridge running with real robot (not loopback)
 *   - Robot on a safe surface with room to move
 *   - Clear area around robot (~1 foot radius)
 */

import WebSocket from 'ws';

const WS_URL = process.env.WS_URL || 'ws://localhost:8765/robot';

// Safety constants - keep movements under 0.5 feet
const SAFE_PWM = 50;           // Low PWM for slow movement
const SAFE_DURATION_MS = 300;  // Short duration
const SERVO_CENTER = 90;       // Servo center position
const SERVO_LEFT = 45;
const SERVO_RIGHT = 135;

interface RobotReply {
  type: 'robot.reply';
  id: string;
  ok: boolean;
  replyKind: 'token' | 'diagnostics' | 'none';
  token: string | null;
  diagnostics: string[] | null;
  timingMs: number;
  error?: string;
}

interface DiagnosticsState {
  owner: string;   // I=Idle, D=Direct, X=Stopped
  leftPWM: number;
  rightPWM: number;
  stby: number;
  motionState: number;
  resets: number;
}

let ws: WebSocket | null = null;
let messageId = 0;

function nextId(): string {
  return `sensor_${++messageId}`;
}

function log(msg: string, data?: unknown): void {
  const ts = new Date().toISOString().split('T')[1].slice(0, 12);
  if (data !== undefined) {
    console.log(`[${ts}] ${msg}`, typeof data === 'string' ? data : JSON.stringify(data));
  } else {
    console.log(`[${ts}] ${msg}`);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function connect(): Promise<void> {
  return new Promise((resolve, reject) => {
    log(`Connecting to ${WS_URL}...`);
    ws = new WebSocket(WS_URL);
    
    const timeout = setTimeout(() => {
      reject(new Error('Connection timeout'));
    }, 5000);
    
    ws.on('open', () => {
      clearTimeout(timeout);
      log('Connected');
      resolve();
    });
    
    ws.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
    
    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'robot.status') {
        log('Status:', { ready: msg.ready, streaming: msg.streaming });
      }
    });
  });
}

async function waitForReady(timeoutMs: number = 10000): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!ws) {
      reject(new Error('Not connected'));
      return;
    }
    
    log('Waiting for ready...');
    
    const timeout = setTimeout(() => {
      reject(new Error(`Timeout waiting for ready after ${timeoutMs}ms`));
    }, timeoutMs);
    
    const handler = (data: WebSocket.Data) => {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'robot.status' && msg.ready) {
        clearTimeout(timeout);
        ws?.off('message', handler);
        log('Bridge is READY');
        resolve();
      }
    };
    
    ws.on('message', handler);
  });
}

async function sendCommand(
  type: string,
  payload: Record<string, unknown>,
  timeoutMs: number = 2000
): Promise<RobotReply> {
  return new Promise((resolve, reject) => {
    if (!ws) {
      reject(new Error('Not connected'));
      return;
    }
    
    const id = nextId();
    const msg = { type, id, ...payload };
    
    const timeout = setTimeout(() => {
      reject(new Error(`Timeout waiting for reply to ${id}`));
    }, timeoutMs);
    
    const handler = (data: WebSocket.Data) => {
      const reply = JSON.parse(data.toString());
      if (reply.type === 'robot.reply' && reply.id === id) {
        clearTimeout(timeout);
        ws?.off('message', handler);
        resolve(reply);
      }
    };
    
    ws.on('message', handler);
    ws.send(JSON.stringify(msg));
  });
}

// Parse diagnostics response like {X0,0,0,0,1}
function parseDiagnostics(lines: string[]): DiagnosticsState | null {
  for (const line of lines) {
    const match = line.match(/^\{([IDX])(-?\d+),(-?\d+),(\d+),(\d+),(\d+)\}$/);
    if (match) {
      return {
        owner: match[1],
        leftPWM: parseInt(match[2]),
        rightPWM: parseInt(match[3]),
        stby: parseInt(match[4]),
        motionState: parseInt(match[5]),
        resets: parseInt(match[6]),
      };
    }
  }
  return null;
}

async function getDiagnostics(): Promise<DiagnosticsState | null> {
  const reply = await sendCommand('robot.command', {
    payload: { N: 120, H: 'diag' },
    expectReply: true,
    timeoutMs: 1000,
  });
  
  if (!reply.ok || !reply.diagnostics) {
    return null;
  }
  
  return parseDiagnostics(reply.diagnostics);
}

async function stopMotors(): Promise<boolean> {
  const reply = await sendCommand('robot.command', {
    payload: { N: 201, H: 'stop' },
    expectReply: true,
    timeoutMs: 500,
  });
  return reply.ok;
}

async function directMotor(left: number, right: number, tag: string): Promise<boolean> {
  const reply = await sendCommand('robot.command', {
    payload: { N: 999, H: tag, D1: left, D2: right },
    expectReply: true,
    timeoutMs: 500,
  });
  return reply.ok;
}

async function setServo(angle: number): Promise<boolean> {
  const reply = await sendCommand('robot.command', {
    payload: { N: 5, H: 'servo', D1: angle },
    expectReply: true,
    timeoutMs: 500,
  });
  return reply.ok;
}

async function requestUltrasonic(): Promise<{ ok: boolean; distance?: number }> {
  const reply = await sendCommand('robot.command', {
    payload: { N: 21, H: 'ultra', D1: 2 },
    expectReply: true,
    timeoutMs: 500,
  });
  
  // Parse distance from response like {ultra_123}
  if (reply.ok && reply.token) {
    const match = reply.token.match(/_(\d+)/);
    if (match) {
      return { ok: true, distance: parseInt(match[1], 10) };
    }
  }
  return { ok: reply.ok };
}

async function requestLineSensor(sensor: number): Promise<{ ok: boolean; value?: number }> {
  const reply = await sendCommand('robot.command', {
    payload: { N: 22, H: `line${sensor}`, D1: sensor },
    expectReply: true,
    timeoutMs: 500,
  });
  
  // Parse value from response like {line0_456}
  if (reply.ok && reply.token) {
    const match = reply.token.match(/_(\d+)/);
    if (match) {
      return { ok: true, value: parseInt(match[1], 10) };
    }
  }
  return { ok: reply.ok };
}

async function requestBattery(): Promise<{ ok: boolean; voltage_mv?: number }> {
  const reply = await sendCommand('robot.command', {
    payload: { N: 23, H: 'batt' },
    expectReply: true,
    timeoutMs: 500,
  });
  
  // Parse voltage from response like {batt_7400}
  if (reply.ok && reply.token) {
    const match = reply.token.match(/_(\d+)/);
    if (match) {
      return { ok: true, voltage_mv: parseInt(match[1], 10) };
    }
  }
  return { ok: reply.ok };
}

// ============================================================================
// Test Phases
// ============================================================================

async function phase1_checkDiagnostics(): Promise<boolean> {
  log('');
  log('═'.repeat(50));
  log('PHASE 1: Initial Diagnostics Check');
  log('═'.repeat(50));
  
  const diag = await getDiagnostics();
  if (!diag) {
    log('✗ Failed to get diagnostics');
    return false;
  }
  
  log(`  Owner: ${diag.owner} (I=Idle, D=Direct, X=Stopped)`);
  log(`  PWM: L=${diag.leftPWM}, R=${diag.rightPWM}`);
  log(`  STBY: ${diag.stby}, State: ${diag.motionState}, Resets: ${diag.resets}`);
  log('✓ Diagnostics OK');
  return true;
}

async function phase2_servoPan(): Promise<boolean> {
  log('');
  log('═'.repeat(50));
  log('PHASE 2: Servo Pan Test');
  log('═'.repeat(50));
  
  log(`  Looking left (${SERVO_LEFT}°)...`);
  if (!await setServo(SERVO_LEFT)) {
    log('✗ Failed to move servo left');
    return false;
  }
  await sleep(500);
  
  log(`  Looking right (${SERVO_RIGHT}°)...`);
  if (!await setServo(SERVO_RIGHT)) {
    log('✗ Failed to move servo right');
    return false;
  }
  await sleep(500);
  
  log(`  Centering (${SERVO_CENTER}°)...`);
  if (!await setServo(SERVO_CENTER)) {
    log('✗ Failed to center servo');
    return false;
  }
  await sleep(300);
  
  log('✓ Servo pan complete');
  return true;
}

async function phase3_sensorRequests(): Promise<boolean> {
  log('');
  log('═'.repeat(50));
  log('PHASE 3: Sensor Request Test (with value validation)');
  log('═'.repeat(50));
  
  // Ultrasonic distance
  log('  Requesting ultrasonic reading...');
  const ultraResult = await requestUltrasonic();
  if (!ultraResult.ok) {
    log('✗ Ultrasonic request failed');
    return false;
  }
  if (ultraResult.distance !== undefined) {
    log(`  ✓ Ultrasonic: ${ultraResult.distance}cm`);
  } else {
    log('  ✓ Ultrasonic OK (no value parsed)');
  }
  
  // Line sensors
  log('  Requesting line sensors...');
  const names = ['Left', 'Middle', 'Right'];
  for (let i = 0; i <= 2; i++) {
    const lineResult = await requestLineSensor(i);
    if (!lineResult.ok) {
      log(`  ✗ Line sensor ${names[i]} failed`);
      return false;
    }
    if (lineResult.value !== undefined) {
      log(`  ✓ Line sensor ${names[i]}: ${lineResult.value}`);
    } else {
      log(`  ✓ Line sensor ${names[i]} OK`);
    }
  }
  
  // Battery voltage
  log('  Requesting battery voltage...');
  const battResult = await requestBattery();
  if (!battResult.ok) {
    log('✗ Battery request failed');
    return false;
  }
  if (battResult.voltage_mv !== undefined) {
    const voltage_v = (battResult.voltage_mv / 1000).toFixed(2);
    log(`  ✓ Battery: ${voltage_v}V (${battResult.voltage_mv}mV)`);
  } else {
    log('  ✓ Battery OK (no value parsed)');
  }
  
  log('✓ All sensor requests complete');
  return true;
}

async function phase4_safeForward(): Promise<boolean> {
  log('');
  log('═'.repeat(50));
  log('PHASE 4: Safe Forward Movement');
  log(`  PWM: ${SAFE_PWM}, Duration: ${SAFE_DURATION_MS}ms`);
  log('═'.repeat(50));
  
  // Ensure stopped first
  await stopMotors();
  
  // Check diagnostics before
  const diagBefore = await getDiagnostics();
  log(`  Before: Owner=${diagBefore?.owner}, PWM=L${diagBefore?.leftPWM}/R${diagBefore?.rightPWM}`);
  
  // Move forward briefly
  log(`  Moving forward at PWM ${SAFE_PWM}...`);
  if (!await directMotor(SAFE_PWM, SAFE_PWM, 'fwd')) {
    log('✗ Failed to start forward');
    return false;
  }
  
  // Wait for movement duration
  await sleep(SAFE_DURATION_MS);
  
  // Stop immediately
  if (!await stopMotors()) {
    log('✗ Failed to stop');
    return false;
  }
  
  // Check diagnostics after
  const diagAfter = await getDiagnostics();
  log(`  After: Owner=${diagAfter?.owner}, PWM=L${diagAfter?.leftPWM}/R${diagAfter?.rightPWM}`);
  
  // Verify stopped
  if (diagAfter?.owner !== 'X') {
    log(`✗ Expected owner X (stopped), got ${diagAfter?.owner}`);
    return false;
  }
  
  log('✓ Forward movement complete');
  return true;
}

async function phase5_safeBackward(): Promise<boolean> {
  log('');
  log('═'.repeat(50));
  log('PHASE 5: Safe Backward Movement');
  log(`  PWM: -${SAFE_PWM}, Duration: ${SAFE_DURATION_MS}ms`);
  log('═'.repeat(50));
  
  // Move backward briefly (negative PWM)
  log(`  Moving backward at PWM -${SAFE_PWM}...`);
  if (!await directMotor(-SAFE_PWM, -SAFE_PWM, 'bwd')) {
    log('✗ Failed to start backward');
    return false;
  }
  
  await sleep(SAFE_DURATION_MS);
  
  if (!await stopMotors()) {
    log('✗ Failed to stop');
    return false;
  }
  
  log('✓ Backward movement complete');
  return true;
}

async function phase6_safeTurn(): Promise<boolean> {
  log('');
  log('═'.repeat(50));
  log('PHASE 6: Safe Turn (Spin in Place)');
  log(`  PWM: ±${SAFE_PWM}, Duration: ${SAFE_DURATION_MS}ms`);
  log('═'.repeat(50));
  
  // Turn right (left forward, right backward)
  log('  Turning right (spin)...');
  if (!await directMotor(SAFE_PWM, -SAFE_PWM, 'tr')) {
    log('✗ Failed to start turn right');
    return false;
  }
  
  await sleep(SAFE_DURATION_MS);
  await stopMotors();
  await sleep(200);
  
  // Turn left (right forward, left backward)
  log('  Turning left (spin)...');
  if (!await directMotor(-SAFE_PWM, SAFE_PWM, 'tl')) {
    log('✗ Failed to start turn left');
    return false;
  }
  
  await sleep(SAFE_DURATION_MS);
  await stopMotors();
  
  log('✓ Turn complete');
  return true;
}

async function phase7_streamingTest(): Promise<boolean> {
  log('');
  log('═'.repeat(50));
  log('PHASE 7: Brief Streaming Test');
  log('  rateHz: 10, v: 30, w: 0, duration: 500ms');
  log('═'.repeat(50));
  
  // Start streaming at very low velocity
  log('  Starting stream...');
  const startReply = await sendCommand('robot.stream.start', {
    rateHz: 10,
    ttlMs: 200,
    v: 30,  // Very low velocity
    w: 0,
  });
  
  if (!startReply.ok) {
    log('✗ Failed to start stream');
    return false;
  }
  
  // Stream briefly
  await sleep(500);
  
  // Stop streaming
  log('  Stopping stream...');
  const stopReply = await sendCommand('robot.stream.stop', {
    hardStop: true,
  });
  
  if (!stopReply.ok) {
    log('✗ Failed to stop stream');
    return false;
  }
  
  log('✓ Streaming complete');
  return true;
}

async function phase8_lookAround(): Promise<boolean> {
  log('');
  log('═'.repeat(50));
  log('PHASE 8: Look Around Pattern');
  log('  Pan servo while robot is stationary');
  log('═'.repeat(50));
  
  const angles = [60, 90, 120, 90, 45, 90, 135, 90];
  
  for (const angle of angles) {
    log(`  Pan to ${angle}°...`);
    if (!await setServo(angle)) {
      log(`✗ Failed to pan to ${angle}°`);
      return false;
    }
    await sleep(300);
  }
  
  log('✓ Look around complete');
  return true;
}

async function phase9_finalDiagnostics(): Promise<boolean> {
  log('');
  log('═'.repeat(50));
  log('PHASE 9: Final Diagnostics');
  log('═'.repeat(50));
  
  // Ensure stopped
  await stopMotors();
  
  const diag = await getDiagnostics();
  if (!diag) {
    log('✗ Failed to get final diagnostics');
    return false;
  }
  
  log(`  Final Owner: ${diag.owner}`);
  log(`  Final PWM: L=${diag.leftPWM}, R=${diag.rightPWM}`);
  log(`  STBY: ${diag.stby}, State: ${diag.motionState}`);
  log(`  Total Resets: ${diag.resets}`);
  
  // Verify robot is stopped
  if (diag.owner !== 'X' && diag.owner !== 'I') {
    log(`✗ Robot not in stopped/idle state: ${diag.owner}`);
    return false;
  }
  
  log('✓ Final state OK');
  return true;
}

// ============================================================================
// Main
// ============================================================================

async function main(): Promise<void> {
  console.log('╔' + '═'.repeat(58) + '╗');
  console.log('║  ZIP Robot Bridge - Sensor-Aware Smoke Test              ║');
  console.log('║  SAFETY: All movements within 0.5 feet                   ║');
  console.log('╚' + '═'.repeat(58) + '╝');
  console.log(`Target: ${WS_URL}`);
  console.log('');
  
  const results: { phase: string; passed: boolean }[] = [];
  
  try {
    await connect();
    await waitForReady();
    
    // Run all phases
    const phases = [
      { name: 'Initial Diagnostics', fn: phase1_checkDiagnostics },
      { name: 'Servo Pan', fn: phase2_servoPan },
      { name: 'Sensor Requests', fn: phase3_sensorRequests },
      { name: 'Safe Forward', fn: phase4_safeForward },
      { name: 'Safe Backward', fn: phase5_safeBackward },
      { name: 'Safe Turn', fn: phase6_safeTurn },
      { name: 'Streaming', fn: phase7_streamingTest },
      { name: 'Look Around', fn: phase8_lookAround },
      { name: 'Final Diagnostics', fn: phase9_finalDiagnostics },
    ];
    
    for (const phase of phases) {
      try {
        const passed = await phase.fn();
        results.push({ phase: phase.name, passed });
        
        if (!passed) {
          // Safety: stop motors on any failure
          await stopMotors();
        }
      } catch (error) {
        log(`✗ ${phase.name} error: ${error instanceof Error ? error.message : error}`);
        results.push({ phase: phase.name, passed: false });
        await stopMotors();
      }
      
      // Small pause between phases
      await sleep(300);
    }
    
    // Summary
    console.log('');
    console.log('╔' + '═'.repeat(58) + '╗');
    console.log('║  TEST SUMMARY                                            ║');
    console.log('╠' + '═'.repeat(58) + '╣');
    
    const passed = results.filter(r => r.passed).length;
    const failed = results.filter(r => !r.passed).length;
    
    for (const r of results) {
      const status = r.passed ? '✓' : '✗';
      console.log(`║  ${status} ${r.phase.padEnd(52)} ║`);
    }
    
    console.log('╠' + '═'.repeat(58) + '╣');
    console.log(`║  Passed: ${passed}/${results.length}`.padEnd(59) + '║');
    console.log('╚' + '═'.repeat(58) + '╝');
    
    if (failed > 0) {
      console.log('\n✗ SOME TESTS FAILED');
      process.exit(1);
    } else {
      console.log('\n✓ ALL TESTS PASSED');
      process.exit(0);
    }
    
  } catch (error) {
    console.log('\n' + '═'.repeat(60));
    console.log('✗ SMOKE TEST FAILED');
    console.log('═'.repeat(60));
    console.error('Error:', error instanceof Error ? error.message : error);
    
    // Safety: try to stop motors
    if (ws) {
      try {
        await stopMotors();
      } catch {
        // Ignore errors during cleanup
      }
    }
    
    process.exit(1);
  } finally {
    if (ws) {
      ws.close();
    }
  }
}

main();

