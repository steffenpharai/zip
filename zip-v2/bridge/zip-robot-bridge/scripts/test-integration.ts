/**
 * Integration Test Script
 * Tests the bridge in loopback mode via WebSocket
 * 
 * Usage:
 *   npx tsx scripts/test-integration.ts
 * 
 * Requirements:
 *   - Bridge must be running with LOOPBACK_MODE=true
 *   - Or run: npm run test:integration (starts bridge automatically)
 */

import WebSocket from 'ws';

const WS_URL = process.env.WS_URL || 'ws://localhost:8765/robot';
const HEALTH_URL = process.env.HEALTH_URL || 'http://localhost:8766/health';

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  timingMs: number;
}

const results: TestResult[] = [];
let ws: WebSocket | null = null;
let messageId = 0;

function nextId(): string {
  return `test_${++messageId}`;
}

function log(msg: string): void {
  console.log(`[Test] ${msg}`);
}

function logPass(name: string): void {
  console.log(`  ✓ ${name}`);
}

function logFail(name: string, error: string): void {
  console.log(`  ✗ ${name}: ${error}`);
}

async function sendAndWait(
  msg: object, 
  expectedType: string = 'robot.reply',
  timeoutMs: number = 2000
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Timeout waiting for ${expectedType}`));
    }, timeoutMs);
    
    const handler = (data: WebSocket.Data) => {
      try {
        const parsed = JSON.parse(data.toString());
        if (parsed.type === expectedType) {
          clearTimeout(timeout);
          ws?.off('message', handler);
          resolve(parsed);
        }
      } catch {
        // Ignore parse errors
      }
    };
    
    ws?.on('message', handler);
    ws?.send(JSON.stringify(msg));
  });
}

async function waitForReady(timeoutMs: number = 5000): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Timeout waiting for ready status'));
    }, timeoutMs);
    
    const handler = (data: WebSocket.Data) => {
      try {
        const parsed = JSON.parse(data.toString());
        if (parsed.type === 'robot.status' && parsed.ready) {
          clearTimeout(timeout);
          ws?.off('message', handler);
          resolve();
        }
      } catch {
        // Ignore parse errors
      }
    };
    
    ws?.on('message', handler);
  });
}

async function runTest(
  name: string, 
  fn: () => Promise<void>
): Promise<void> {
  const start = Date.now();
  try {
    await fn();
    const timing = Date.now() - start;
    results.push({ name, passed: true, timingMs: timing });
    logPass(name);
  } catch (error) {
    const timing = Date.now() - start;
    const errorMsg = error instanceof Error ? error.message : String(error);
    results.push({ name, passed: false, error: errorMsg, timingMs: timing });
    logFail(name, errorMsg);
  }
}

async function testHealthEndpoint(): Promise<void> {
  const response = await fetch(HEALTH_URL);
  if (!response.ok) {
    throw new Error(`Health check failed: ${response.status}`);
  }
  const data = await response.json();
  if (data.status !== 'ok' && data.status !== 'degraded') {
    throw new Error(`Unexpected health status: ${data.status}`);
  }
}

async function testWebSocketConnect(): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Connection timeout'));
    }, 5000);
    
    ws = new WebSocket(WS_URL);
    
    ws.on('open', () => {
      clearTimeout(timeout);
      resolve();
    });
    
    ws.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

async function testHelloCommand(): Promise<void> {
  const id = nextId();
  const reply = await sendAndWait({
    type: 'robot.command',
    id,
    payload: { N: 0, H: 'test_hello' },
    expectReply: true,
    timeoutMs: 500,
  });
  
  if (reply.id !== id) {
    throw new Error(`ID mismatch: expected ${id}, got ${reply.id}`);
  }
  if (!reply.ok) {
    throw new Error(`Command failed: ${JSON.stringify(reply)}`);
  }
  // Firmware responds with {<tag>_ok} format
  if (!String(reply.token).endsWith('_ok}')) {
    throw new Error(`Unexpected token: ${reply.token}`);
  }
}

async function testDirectMotorCommand(): Promise<void> {
  const id = nextId();
  const reply = await sendAndWait({
    type: 'robot.command',
    id,
    payload: { N: 999, H: 'test_motor', D1: 100, D2: 100 },
    expectReply: true,
    timeoutMs: 500,
  });
  
  if (!reply.ok) {
    throw new Error(`Command failed: ${JSON.stringify(reply)}`);
  }
  // Firmware responds with {<tag>_ok} format
  if (!String(reply.token).endsWith('_ok}')) {
    throw new Error(`Unexpected token: ${reply.token}`);
  }
}

async function testStopCommand(): Promise<void> {
  const id = nextId();
  const reply = await sendAndWait({
    type: 'robot.command',
    id,
    payload: { N: 201, H: 'test_stop' },
    expectReply: true,
    timeoutMs: 500,
  });
  
  if (!reply.ok) {
    throw new Error(`Command failed: ${JSON.stringify(reply)}`);
  }
  // Firmware responds with {<tag>_ok} format
  if (!String(reply.token).endsWith('_ok}')) {
    throw new Error(`Unexpected token: ${reply.token}`);
  }
}

async function testDiagnosticsCommand(): Promise<void> {
  const id = nextId();
  const reply = await sendAndWait({
    type: 'robot.command',
    id,
    payload: { N: 120, H: 'test_diag' },
    expectReply: true,
    timeoutMs: 1000,
  });
  
  if (!reply.ok) {
    throw new Error(`Command failed: ${JSON.stringify(reply)}`);
  }
  if (reply.replyKind !== 'diagnostics') {
    throw new Error(`Expected diagnostics, got ${reply.replyKind}`);
  }
  if (!Array.isArray(reply.diagnostics) || reply.diagnostics.length < 1) {
    throw new Error(`Expected diagnostics array, got ${JSON.stringify(reply.diagnostics)}`);
  }
}

async function testStreamStart(): Promise<void> {
  const id = nextId();
  const reply = await sendAndWait({
    type: 'robot.stream.start',
    id,
    rateHz: 10,
    ttlMs: 200,
    v: 80,
    w: 0,
  });
  
  if (!reply.ok) {
    throw new Error(`Stream start failed: ${JSON.stringify(reply)}`);
  }
  if (reply.replyKind !== 'none') {
    throw new Error(`Expected replyKind 'none', got ${reply.replyKind}`);
  }
}

async function testStreamUpdate(): Promise<void> {
  const id = nextId();
  const reply = await sendAndWait({
    type: 'robot.stream.update',
    id,
    v: 80,
    w: 30,
    ttlMs: 200,
  });
  
  if (!reply.ok) {
    throw new Error(`Stream update failed: ${JSON.stringify(reply)}`);
  }
}

async function testStreamStop(): Promise<void> {
  const id = nextId();
  const reply = await sendAndWait({
    type: 'robot.stream.stop',
    id,
    hardStop: true,
  });
  
  if (!reply.ok) {
    throw new Error(`Stream stop failed: ${JSON.stringify(reply)}`);
  }
}

async function testEmergencyStop(): Promise<void> {
  const response = await fetch('http://localhost:8766/api/robot/stop', {
    method: 'POST',
  });
  
  if (!response.ok) {
    throw new Error(`Emergency stop failed: ${response.status}`);
  }
  
  const data = await response.json();
  if (!data.ok) {
    throw new Error(`Emergency stop not ok: ${JSON.stringify(data)}`);
  }
}

async function main(): Promise<void> {
  console.log('═'.repeat(60));
  console.log('ZIP Robot Bridge Integration Tests');
  console.log('═'.repeat(60));
  console.log(`WebSocket: ${WS_URL}`);
  console.log(`Health: ${HEALTH_URL}`);
  console.log('─'.repeat(60));
  
  // Run tests
  await runTest('Health endpoint responds', testHealthEndpoint);
  await runTest('WebSocket connects', testWebSocketConnect);
  
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    console.log('\n❌ Cannot continue: WebSocket not connected');
    process.exit(1);
  }
  
  log('Waiting for ready status...');
  try {
    await waitForReady(5000);
    log('Bridge is ready');
  } catch (error) {
    log('Warning: Bridge not ready, tests may fail');
  }
  
  console.log('\nCommand Tests:');
  await runTest('N=0 Hello → {H_ok}', testHelloCommand);
  await runTest('N=999 Direct Motor → {H_ok}', testDirectMotorCommand);
  await runTest('N=201 Stop → {H_ok}', testStopCommand);
  await runTest('N=120 Diagnostics → array', testDiagnosticsCommand);
  
  console.log('\nStreaming Tests:');
  await runTest('Stream start → replyKind none', testStreamStart);
  
  // Wait a bit for some frames to be sent
  await new Promise(r => setTimeout(r, 200));
  
  await runTest('Stream update', testStreamUpdate);
  await runTest('Stream stop → {H_ok}', testStreamStop);
  
  console.log('\nEmergency Tests:');
  await runTest('POST /api/robot/stop', testEmergencyStop);
  
  // Close WebSocket
  if (ws) {
    ws.close();
  }
  
  // Summary
  console.log('\n' + '═'.repeat(60));
  console.log('TEST SUMMARY');
  console.log('═'.repeat(60));
  
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  const totalTime = results.reduce((sum, r) => sum + r.timingMs, 0);
  
  console.log(`Total: ${results.length} | Passed: ${passed} | Failed: ${failed}`);
  console.log(`Total time: ${totalTime}ms`);
  
  if (failed > 0) {
    console.log('\nFailed tests:');
    for (const r of results.filter(r => !r.passed)) {
      console.log(`  - ${r.name}: ${r.error}`);
    }
    console.log('\n❌ Some tests failed');
    process.exit(1);
  } else {
    console.log('\n✓ All tests passed!');
    process.exit(0);
  }
}

main().catch((error) => {
  console.error('Test runner error:', error);
  process.exit(1);
});

