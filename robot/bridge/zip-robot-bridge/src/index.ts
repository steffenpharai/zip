/**
 * ZIP Robot Bridge - Main Entry Point
 * 
 * A reliable bridge between WebSocket clients and the ZIP Robot Firmware.
 * Uses ELEGOO-style JSON protocol over serial at 115200 baud.
 */

import 'dotenv/config';
import { SerialPort } from 'serialport';
import { logger } from './logging/logger.js';
import { 
  env, 
  SERIAL_PORT, 
  SERIAL_BAUD, 
  WS_PORT, 
  HTTP_PORT, 
  LOOPBACK_MODE,
} from './config/env.js';
import { SerialTransport, type TransportState } from './serial/SerialTransport.js';
import { LoopbackEmulator } from './serial/LoopbackEmulator.js';
import { ReplyMatcher } from './protocol/ReplyMatcher.js';
import { SetpointStreamer } from './streaming/SetpointStreamer.js';
import { RobotWsServer } from './ws/RobotWsServer.js';
import { HealthServer } from './http/HealthServer.js';
import { isBootMarker } from './protocol/FirmwareJson.js';

// ============================================================================
// Auto-detect serial port
// ============================================================================

async function getSerialPort(): Promise<string> {
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/24c95070-093b-462b-aff8-5147492483af',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'index.ts:32',message:'getSerialPort: entry',data:{SERIAL_PORT:SERIAL_PORT||'not set',platform:process.platform},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
  // #endregion
  
  // Check if SERIAL_PORT is explicitly set (not empty)
  if (SERIAL_PORT && SERIAL_PORT.trim() !== '') {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/24c95070-093b-462b-aff8-5147492483af',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'index.ts:35',message:'getSerialPort: using SERIAL_PORT env var',data:{port:SERIAL_PORT},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
    // #endregion
    return SERIAL_PORT;
  }
  
  try {
    const ports = await SerialPort.list();
    
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/24c95070-093b-462b-aff8-5147492483af',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'index.ts:40',message:'getSerialPort: SerialPort.list() result',data:{portCount:ports.length,ports:ports.map(p=>({path:p.path,manufacturer:p.manufacturer,vendorId:p.vendorId,productId:p.productId}))},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
    // #endregion
    
    // Prefer ports that look like Arduino/robot controllers
    const arduinoPorts = ports.filter(p => 
      p.manufacturer?.toLowerCase().includes('arduino') ||
      p.manufacturer?.toLowerCase().includes('ch340') ||
      p.manufacturer?.toLowerCase().includes('ftdi') ||
      p.path?.toUpperCase().startsWith('COM')
    );
    
    if (arduinoPorts.length > 0) {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/24c95070-093b-462b-aff8-5147492483af',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'index.ts:50',message:'getSerialPort: auto-detected arduino port',data:{port:arduinoPorts[0].path},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
      // #endregion
      logger.info(`Auto-detected port: ${arduinoPorts[0].path}`);
      return arduinoPorts[0].path;
    }
    
    // If no USB serial ports found, try hardware UARTs (common on Jetson)
    // Try common hardware UART paths in order of preference
    const hardwareUarts = ['/dev/ttyTHS1', '/dev/ttyTHS2', '/dev/ttyS0', '/dev/ttyS1', '/dev/ttyS2', '/dev/ttyS3'];
    for (const uartPath of hardwareUarts) {
      try {
        // Check if device exists and is accessible
        const fs = await import('fs/promises');
        await fs.access(uartPath);
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/24c95070-093b-462b-aff8-5147492483af',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'index.ts:58',message:'getSerialPort: found accessible hardware UART',data:{port:uartPath},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
        // #endregion
        logger.info(`Using hardware UART: ${uartPath}`);
        return uartPath;
      } catch {
        // Device doesn't exist or not accessible, try next
        continue;
      }
    }
    
    if (ports.length > 0) {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/24c95070-093b-462b-aff8-5147492483af',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'index.ts:68',message:'getSerialPort: using first available port',data:{port:ports[0].path},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
      // #endregion
      logger.info(`Using first available port: ${ports[0].path}`);
      return ports[0].path;
    }
  } catch (error) {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/24c95070-093b-462b-aff8-5147492483af',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'index.ts:75',message:'getSerialPort: SerialPort.list() error',data:{error:error instanceof Error ? error.message : String(error)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
    // #endregion
    logger.warn('Could not auto-detect port', { 
      error: error instanceof Error ? error.message : String(error) 
    });
  }
  
  // Platform-specific defaults - try hardware UARTs first on Linux
  if (process.platform !== 'win32') {
    const hardwareUarts = ['/dev/ttyTHS1', '/dev/ttyTHS2', '/dev/ttyS0', '/dev/ttyS1'];
    for (const uartPath of hardwareUarts) {
      try {
        const fs = await import('fs/promises');
        await fs.access(uartPath);
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/24c95070-093b-462b-aff8-5147492483af',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'index.ts:87',message:'getSerialPort: using hardware UART default',data:{port:uartPath},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
        // #endregion
        return uartPath;
      } catch {
        continue;
      }
    }
  }
  
  const defaultPort = process.platform === 'win32' ? 'COM3' : '/dev/ttyUSB0';
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/24c95070-093b-462b-aff8-5147492483af',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'index.ts:95',message:'getSerialPort: using platform default',data:{port:defaultPort,platform:process.platform},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
  // #endregion
  return defaultPort;
}

// ============================================================================
// Main
// ============================================================================

async function main(): Promise<void> {
  logger.info('ZIP Robot Bridge starting...', { 
    loopback: LOOPBACK_MODE,
    wsPort: WS_PORT,
    httpPort: HTTP_PORT,
  });
  
  // Create components
  const replyMatcher = new ReplyMatcher();
  const streamer = new SetpointStreamer();
  const wsServer = new RobotWsServer(WS_PORT);
  const healthServer = new HealthServer(HTTP_PORT);
  
  // Wire up dependencies
  wsServer.setReplyMatcher(replyMatcher);
  wsServer.setStreamer(streamer);
  healthServer.setReplyMatcher(replyMatcher);
  healthServer.setStreamer(streamer);
  
  // Transport event handlers
  const transportEvents = {
    onLine: (line: string) => {
      // Check for boot marker (indicates reset)
      if (isBootMarker(line)) {
        logger.info('Boot marker received (firmware reset)');
        wsServer.broadcastStatus();
      }
      
      // Forward to reply matcher
      replyMatcher.processLine(line);
      
      // Broadcast to WS clients
      wsServer.broadcastRxLine(line);
    },
    onStateChange: (state: TransportState) => {
      logger.info(`Transport state: ${state}`);
      
      if (state === 'ready') {
        wsServer.markReady();
      }
      
      wsServer.broadcastStatus();
    },
    onError: (error: Error) => {
      logger.error('Transport error', { error: error.message });
    },
  };
  
  // Create transport (real or loopback)
  let transport: SerialTransport | LoopbackEmulator;
  
  if (LOOPBACK_MODE) {
    logger.info('Running in LOOPBACK mode (no hardware)');
    transport = new LoopbackEmulator(transportEvents);
  } else {
    const portPath = await getSerialPort();
    logger.info(`Using serial port: ${portPath} @ ${SERIAL_BAUD} baud`);
    transport = new SerialTransport(portPath, transportEvents, SERIAL_BAUD);
  }
  
  // Wire transport to other components
  wsServer.setTransport(transport as SerialTransport);
  healthServer.setTransport(transport as SerialTransport);
  
  // Set up streamer to send commands via transport
  streamer.setSendFunction((cmd) => {
    return transport.writeCommand(cmd);
  });
  
  // Open transport
  try {
    await transport.open();
  } catch (error) {
    logger.error('Failed to open transport', { 
      error: error instanceof Error ? error.message : String(error) 
    });
    if (!LOOPBACK_MODE) {
      logger.error('Make sure the robot is connected and the port is correct');
      logger.error('Set SERIAL_PORT environment variable to override');
    }
  }
  
  // Graceful shutdown
  const shutdown = async () => {
    logger.info('Shutting down...');
    
    // Stop streaming
    if (streamer.isStreaming()) {
      await streamer.stop(true);
    }
    
    // Cleanup
    replyMatcher.cleanup();
    streamer.cleanup();
    wsServer.close();
    healthServer.close();
    await transport.close();
    logger.close();
    
    process.exit(0);
  };
  
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  
  logger.info('Bridge started successfully', {
    wsEndpoint: `ws://localhost:${WS_PORT}/robot`,
    httpEndpoint: `http://localhost:${HTTP_PORT}`,
  });
}

main().catch((error) => {
  logger.error('Fatal error', { error: error instanceof Error ? error.message : String(error) });
  process.exit(1);
});
