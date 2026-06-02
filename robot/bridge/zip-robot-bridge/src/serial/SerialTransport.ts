/**
 * Serial Transport
 * Line-oriented serial I/O with boot marker detection and handshake
 * 
 * Implements the ready handshake state machine:
 * 1. Open port (optionally disable DTR/RTS)
 * 2. Wait for "R\n" boot marker or valid token within timeout
 * 3. Send N=0 hello up to 3 times until {H_ok}
 * 4. Mark bridge status "ready"
 */

import { SerialPort } from 'serialport';
import { ReadlineParser } from '@serialport/parser-readline';
import { logger } from '../logging/logger.js';
import { 
  SERIAL_BAUD, 
  HANDSHAKE_TIMEOUT_MS, 
  DTR_SETTLE_MS,
  COMMAND_TIMEOUT_MS,
  MAX_COMMANDS_PER_SEC,
} from '../config/env.js';
import { 
  isBootMarker, 
  isReadyMarker,
  isTokenResponse,
  serializeCommand,
  buildHelloCommand,
  type FirmwareCommand,
  getPriorityForCommand,
  PRIORITY,
  CMD,
} from '../protocol/FirmwareJson.js';

export type TransportState = 
  | 'closed'
  | 'opening'
  | 'waiting_boot'
  | 'handshaking'
  | 'ready'
  | 'error';

export interface TransportEvents {
  onLine: (line: string) => void;
  onStateChange: (state: TransportState) => void;
  onError: (error: Error) => void;
}

interface QueuedWrite {
  line: string;
  priority: number;
  timestamp: number;
}

export class SerialTransport {
  private port: SerialPort | null = null;
  private parser: ReadlineParser | null = null;
  private portPath: string;
  private baudRate: number;
  private events: TransportEvents;
  
  private _state: TransportState = 'closed';
  private bootMarkerSeen = false;
  private helloAttempts = 0;
  private handshakeTimer: NodeJS.Timeout | null = null;
  private helloTimer: NodeJS.Timeout | null = null;
  
  // Rate limiting
  private writeQueue: QueuedWrite[] = [];
  private writeRateTokens: number;
  private lastRateRefill: number = Date.now();
  // Use number type since clearTimeout/clearImmediate are compatible
  private writeFlushTimer: number | NodeJS.Timeout | null = null;
  
  // Stats
  private rxBytes = 0;
  private txBytes = 0;
  private lastRxAt: number | null = null;
  private lastTxAt: number | null = null;
  private lastBootMarkerAt: number | null = null;
  private resetsSeen = 0;
  
  constructor(portPath: string, events: TransportEvents, baudRate: number = SERIAL_BAUD) {
    this.portPath = portPath;
    this.baudRate = baudRate;
    this.events = events;
    this.writeRateTokens = MAX_COMMANDS_PER_SEC;
  }
  
  get state(): TransportState {
    return this._state;
  }
  
  get isReady(): boolean {
    return this._state === 'ready';
  }
  
  private setState(newState: TransportState): void {
    if (this._state !== newState) {
      const oldState = this._state;
      this._state = newState;
      logger.info(`State: ${oldState} -> ${newState}`);
      this.events.onStateChange(newState);
    }
  }
  
  /**
   * Open the serial port and begin handshake
   */
  async open(): Promise<void> {
    if (this._state !== 'closed' && this._state !== 'error') {
      throw new Error(`Cannot open: state is ${this._state}`);
    }
    
    this.setState('opening');
    
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/24c95070-093b-462b-aff8-5147492483af',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'SerialTransport.ts:109',message:'SerialTransport.open: entry',data:{portPath:this.portPath,baudRate:this.baudRate,state:this._state},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
    // #endregion
    
    try {
      this.port = new SerialPort({
        path: this.portPath,
        baudRate: this.baudRate,
        autoOpen: false,
        // Try to minimize DTR toggling (may not work on all platforms)
        hupcl: false,
      });
      
      // Set up readline parser for line-oriented input
      this.parser = new ReadlineParser({ delimiter: '\n' });
      this.port.pipe(this.parser);
      
      // Handle incoming lines
      this.parser.on('data', (line: string) => {
        this.handleLine(line);
      });
      
      this.port.on('error', (error: Error) => {
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/24c95070-093b-462b-aff8-5147492483af',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'SerialTransport.ts:137',message:'SerialTransport.open: port error event',data:{error:error.message,portPath:this.portPath},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
        // #endregion
        logger.error('Serial port error', { error: error.message });
        this.events.onError(error);
        this.setState('error');
      });
      
      this.port.on('close', () => {
        logger.log('serial_close', { port: this.portPath });
        this.setState('closed');
      });
      
      // Open the port
      await new Promise<void>((resolve, reject) => {
        this.port!.open((err) => {
          if (err) {
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/24c95070-093b-462b-aff8-5147492483af',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'SerialTransport.ts:150',message:'SerialTransport.open: port.open() failed',data:{error:err.message,code:(err as any).code,portPath:this.portPath},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
            // #endregion
            reject(err);
          } else {
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/24c95070-093b-462b-aff8-5147492483af',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'SerialTransport.ts:153',message:'SerialTransport.open: port.open() success',data:{portPath:this.portPath,isOpen:this.port?.isOpen ?? false},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
            // #endregion
            resolve();
          }
        });
      });
      
      logger.log('serial_open', { port: this.portPath, baud: this.baudRate });
      
      // Wait for DTR settle
      await this.sleep(DTR_SETTLE_MS);
      
      // Start handshake
      this.startHandshake();
      
    } catch (error) {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/24c95070-093b-462b-aff8-5147492483af',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'SerialTransport.ts:170',message:'SerialTransport.open: exception caught',data:{error:error instanceof Error ? error.message : String(error),portPath:this.portPath},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
      // #endregion
      logger.log('serial_error', { 
        port: this.portPath, 
        error: error instanceof Error ? error.message : String(error) 
      });
      this.setState('error');
      throw error;
    }
  }
  
  /**
   * Close the serial port
   */
  async close(): Promise<void> {
    this.clearTimers();
    
    if (this.port && this.port.isOpen) {
      return new Promise<void>((resolve) => {
        this.port!.close(() => {
          this.port = null;
          this.parser = null;
          this.setState('closed');
          resolve();
        });
      });
    }
    
    this.port = null;
    this.parser = null;
    this.setState('closed');
  }
  
  /**
   * Write a command to the serial port
   * Returns true if queued/written, false if not ready
   */
  writeLine(line: string, priority: number = PRIORITY.COMMAND): boolean {
    if (!this.port || !this.port.isOpen) {
      return false;
    }
    
    // Queue the write
    this.writeQueue.push({
      line,
      priority,
      timestamp: Date.now(),
    });
    
    // Sort by priority (lower = higher priority)
    this.writeQueue.sort((a, b) => a.priority - b.priority);
    
    // Coalesce N=200 setpoints - keep only latest
    this.coalesceSetpoints();
    
    // Schedule flush
    if (!this.writeFlushTimer) {
      this.writeFlushTimer = setTimeout(() => {
        this.writeFlushTimer = null;
        this.flushWriteQueue();
      }, 0);
    }
    
    return true;
  }
  
  /**
   * Write a firmware command (serializes to JSON + newline)
   */
  writeCommand(cmd: FirmwareCommand): boolean {
    const line = serializeCommand(cmd);
    const priority = getPriorityForCommand(cmd.N);
    
    logger.log('tx_cmd', { N: cmd.N, H: cmd.H, priority });
    
    return this.writeLine(line, priority);
  }
  
  /**
   * Coalesce N=200 setpoint commands - keep only the latest
   */
  private coalesceSetpoints(): void {
    const setpointIndices: number[] = [];
    
    for (let i = 0; i < this.writeQueue.length; i++) {
      try {
        const parsed = JSON.parse(this.writeQueue[i].line);
        if (parsed.N === CMD.SETPOINT) {
          setpointIndices.push(i);
        }
      } catch {
        // Not JSON, skip
      }
    }
    
    // Keep only the last setpoint
    if (setpointIndices.length > 1) {
      // Remove all but the last
      const toRemove = setpointIndices.slice(0, -1);
      this.writeQueue = this.writeQueue.filter((_, i) => !toRemove.includes(i));
      logger.debug(`Coalesced ${toRemove.length} setpoint commands`);
    }
  }
  
  /**
   * Flush write queue with rate limiting
   */
  private flushWriteQueue(): void {
    if (!this.port || !this.port.isOpen) {
      return;
    }
    
    // Refill rate tokens
    const now = Date.now();
    const elapsed = now - this.lastRateRefill;
    const tokensToAdd = (elapsed / 1000) * MAX_COMMANDS_PER_SEC;
    this.writeRateTokens = Math.min(MAX_COMMANDS_PER_SEC, this.writeRateTokens + tokensToAdd);
    this.lastRateRefill = now;
    
    // Write as many as we can
    while (this.writeQueue.length > 0 && this.writeRateTokens >= 1) {
      const item = this.writeQueue.shift()!;
      
      // STOP commands always go through (priority 0)
      if (item.priority > PRIORITY.STOP && this.writeRateTokens < 1) {
        // Put it back
        this.writeQueue.unshift(item);
        break;
      }
      
      if (item.priority > PRIORITY.STOP) {
        this.writeRateTokens--;
      }
      
      const data = item.line + '\n';
      this.port.write(data);
      this.txBytes += data.length;
      this.lastTxAt = Date.now();
    }
    
    // If still items, schedule another flush
    if (this.writeQueue.length > 0 && !this.writeFlushTimer) {
      this.writeFlushTimer = setTimeout(() => {
        this.writeFlushTimer = null;
        this.flushWriteQueue();
      }, 20); // ~50Hz max flush rate
    }
  }
  
  /**
   * Handle an incoming line
   */
  private handleLine(line: string): void {
    const trimmed = line.trim();
    if (!trimmed) return;
    
    this.rxBytes += line.length + 1; // +1 for newline
    this.lastRxAt = Date.now();
    
    // Check for boot marker
    if (isBootMarker(trimmed)) {
      this.bootMarkerSeen = true;
      this.lastBootMarkerAt = Date.now();
      this.resetsSeen++;
      logger.log('handshake_step', { step: 'boot_marker', resets: this.resetsSeen });
      
      // If already ready and we see boot marker, firmware reset - restart handshake!
      if (this._state === 'ready') {
        logger.warn('Boot marker received while ready - firmware reset detected, restarting handshake');
        this.startHandshake();
      } else if (this._state === 'waiting_boot') {
        this.attemptHello();
      }
      return;
    }
    
    // Check for WiFi ready marker
    if (isReadyMarker(trimmed)) {
      logger.log('handshake_step', { step: 'wifi_ready' });
      // If waiting for boot or handshaking, proceed with hello
      if (this._state === 'waiting_boot') {
        // WiFi is ready, proceed with handshake
        this.attemptHello();
      } else if (this._state === 'handshaking') {
        // READY marker confirms we can continue handshake
        // Don't change state, just log - we're already handshaking
      }
      return;
    }
    
    // During handshake, check for hello response
    if (this._state === 'handshaking') {
      if (isTokenResponse(trimmed)) {
        // Got a response - consider handshake complete
        this.handshakeComplete();
      }
      // Still forward the line
    }
    
    // If still waiting for boot and we get any valid line, proceed
    if (this._state === 'waiting_boot') {
      if (isTokenResponse(trimmed)) {
        this.attemptHello();
      }
    }
    
    // Forward to event handler
    this.events.onLine(trimmed);
  }
  
  /**
   * Start the handshake process
   */
  private startHandshake(): void {
    this.setState('waiting_boot');
    this.bootMarkerSeen = false;
    this.helloAttempts = 0;
    
    // Set timeout for boot marker
    this.handshakeTimer = setTimeout(() => {
      if (this._state === 'waiting_boot') {
        logger.warn('Boot marker timeout, attempting hello anyway');
        this.attemptHello();
      }
    }, HANDSHAKE_TIMEOUT_MS);
  }
  
  /**
   * Attempt to send hello and wait for response
   */
  private attemptHello(): void {
    this.setState('handshaking');
    this.helloAttempts++;
    
    if (this.helloAttempts > 3) {
      logger.error('Handshake failed: max hello attempts exceeded');
      this.setState('error');
      return;
    }
    
    logger.log('handshake_step', { step: 'hello', attempt: this.helloAttempts });
    
    // Send hello command
    const helloCmd = buildHelloCommand(`h${this.helloAttempts}`);
    const line = serializeCommand(helloCmd);
    
    if (this.port && this.port.isOpen) {
      const data = line + '\n';
      this.port.write(data);
      this.txBytes += data.length;
      this.lastTxAt = Date.now();
    }
    
    // Set timeout for hello response
    this.helloTimer = setTimeout(() => {
      if (this._state === 'handshaking') {
        logger.warn(`Hello attempt ${this.helloAttempts} timed out`);
        this.attemptHello();
      }
    }, COMMAND_TIMEOUT_MS);
  }
  
  /**
   * Handshake completed successfully
   */
  private handshakeComplete(): void {
    this.clearTimers();
    logger.log('handshake_step', { step: 'complete', attempts: this.helloAttempts });
    this.setState('ready');
  }
  
  /**
   * Clear all timers
   */
  private clearTimers(): void {
    if (this.handshakeTimer) {
      clearTimeout(this.handshakeTimer);
      this.handshakeTimer = null;
    }
    if (this.helloTimer) {
      clearTimeout(this.helloTimer);
      this.helloTimer = null;
    }
    if (this.writeFlushTimer) {
      // Handle both Timeout and Immediate
      if (typeof this.writeFlushTimer === 'number') {
        clearTimeout(this.writeFlushTimer);
      } else {
        clearTimeout(this.writeFlushTimer);
      }
      this.writeFlushTimer = null;
    }
  }
  
  /**
   * Get transport statistics
   */
  getStats() {
    return {
      state: this._state,
      port: this.portPath,
      baud: this.baudRate,
      rxBytes: this.rxBytes,
      txBytes: this.txBytes,
      lastRxAt: this.lastRxAt,
      lastTxAt: this.lastTxAt,
      lastBootMarkerAt: this.lastBootMarkerAt,
      resetsSeen: this.resetsSeen,
      writeQueueDepth: this.writeQueue.length,
    };
  }
  
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

