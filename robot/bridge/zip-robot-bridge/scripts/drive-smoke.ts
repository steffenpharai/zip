/**
 * Drive Smoke Test Script
 * Verifies motor motion works through the bridge
 * 
 * Usage:
 *   npx tsx scripts/drive-smoke.ts
 * 
 * Requirements:
 *   - Bridge must be running (npm run dev:local for loopback, or npm run dev for real)
 *   - Robot must be connected (unless in loopback mode)
 * 
 * What it does:
 *   1. Connect to WebSocket
 *   2. Wait for ready status
 *   3. Send N=999 forward for 500ms, then stop
 *   4. Start stream at 10Hz v=80 w=0 for 2s, then stop
 *   5. Request diagnostics N=120 and print results
 */

import WebSocket from 'ws';

const WS_URL = process.env.WS_URL || 'ws://localhost:8765/robot';

interface RobotStatus {
  type: 'robot.status';
  ready: boolean;
  streaming: boolean;
  port: string | null;
  rxBytes: number;
  txBytes: number;
}

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

let ws: WebSocket | null = null;
let messageId = 0;

function nextId(): string {
  return `smoke_${++messageId}`;
}

function log(msg: string, data?: unknown): void {
  const ts = new Date().toISOString().split('T')[1].slice(0, 12);
  if (data !== undefined) {
    console.log(`[${ts}] ${msg}`, JSON.stringify(data));
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
        log('Status update:', {
          ready: msg.ready,
          streaming: msg.streaming,
          txBytes: msg.txBytes,
          rxBytes: msg.rxBytes,
        });
      } else if (msg.type === 'robot.serial.rx') {
        log(`RX: ${msg.line}`);
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
    
    log('Waiting for ready status...');
    
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
    
    log(`TX: ${type}`, payload);
    
    const timeout = setTimeout(() => {
      reject(new Error(`Timeout waiting for reply to ${id}`));
    }, timeoutMs);
    
    const handler = (data: WebSocket.Data) => {
      const reply = JSON.parse(data.toString());
      if (reply.type === 'robot.reply' && reply.id === id) {
        clearTimeout(timeout);
        ws?.off('message', handler);
        log(`Reply:`, { ok: reply.ok, replyKind: reply.replyKind, timingMs: reply.timingMs });
        resolve(reply);
      }
    };
    
    ws.on('message', handler);
    ws.send(JSON.stringify(msg));
  });
}

async function testDirectMotor(): Promise<void> {
  log('='.repeat(50));
  log('TEST: N=999 Direct Motor (forward for 500ms)');
  log('='.repeat(50));
  
  // Send forward command: D1=left, D2=right, both 100 (forward)
  const startReply = await sendCommand('robot.command', {
    payload: { N: 999, H: 'fwd', D1: 100, D2: 100 },
    expectReply: true,
    timeoutMs: 500,
  });
  
  if (!startReply.ok) {
    throw new Error(`Motor start failed: ${startReply.error || 'unknown'}`);
  }
  log(`Motor running (token: ${startReply.token})`);
  
  // Wait 500ms
  await sleep(500);
  
  // Stop
  const stopReply = await sendCommand('robot.command', {
    payload: { N: 201, H: 'stop' },
    expectReply: true,
    timeoutMs: 500,
  });
  
  if (!stopReply.ok) {
    throw new Error(`Stop failed: ${stopReply.error || 'unknown'}`);
  }
  log(`Motor stopped (token: ${stopReply.token})`);
  log('Direct motor test PASSED');
}

async function testStreaming(): Promise<void> {
  log('='.repeat(50));
  log('TEST: N=200 Streaming (10Hz, v=80, w=0 for 2s)');
  log('='.repeat(50));
  
  // Start streaming
  const startReply = await sendCommand('robot.stream.start', {
    rateHz: 10,
    ttlMs: 200,
    v: 80,
    w: 0,
  });
  
  if (!startReply.ok) {
    throw new Error(`Stream start failed: ${startReply.error || 'unknown'}`);
  }
  log('Streaming started');
  
  // Wait 2 seconds
  log('Streaming for 2 seconds...');
  await sleep(2000);
  
  // Stop streaming
  const stopReply = await sendCommand('robot.stream.stop', {
    hardStop: true,
  });
  
  if (!stopReply.ok) {
    throw new Error(`Stream stop failed: ${stopReply.error || 'unknown'}`);
  }
  log('Streaming stopped');
  log('Streaming test PASSED');
}

async function testDiagnostics(): Promise<void> {
  log('='.repeat(50));
  log('TEST: N=120 Diagnostics');
  log('='.repeat(50));
  
  const reply = await sendCommand('robot.command', {
    payload: { N: 120, H: 'diag' },
    expectReply: true,
    timeoutMs: 1000,
  });
  
  if (!reply.ok) {
    throw new Error(`Diagnostics failed: ${reply.error || 'unknown'}`);
  }
  
  if (reply.replyKind !== 'diagnostics') {
    throw new Error(`Expected diagnostics, got ${reply.replyKind}`);
  }
  
  log('Diagnostics response:');
  if (reply.diagnostics) {
    for (const line of reply.diagnostics) {
      log(`  ${line}`);
    }
  }
  
  log('Diagnostics test PASSED');
}

async function main(): Promise<void> {
  console.log('═'.repeat(60));
  console.log('ZIP Robot Bridge - Drive Smoke Test');
  console.log('═'.repeat(60));
  console.log(`Target: ${WS_URL}`);
  console.log('─'.repeat(60));
  
  try {
    await connect();
    await waitForReady();
    
    await testDirectMotor();
    await sleep(500);
    
    await testStreaming();
    await sleep(500);
    
    await testDiagnostics();
    
    console.log('\n' + '═'.repeat(60));
    console.log('✓ ALL SMOKE TESTS PASSED');
    console.log('═'.repeat(60));
    
  } catch (error) {
    console.log('\n' + '═'.repeat(60));
    console.log('✗ SMOKE TEST FAILED');
    console.log('═'.repeat(60));
    console.error('Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  } finally {
    if (ws) {
      ws.close();
    }
  }
}

main();

