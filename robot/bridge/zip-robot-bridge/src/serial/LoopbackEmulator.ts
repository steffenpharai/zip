/**
 * Loopback Emulator
 * Emulates the SerialTransport interface but uses a virtual firmware instead of real serial.
 * This allows testing the full bridge without hardware.
 * 
 * Behavior:
 * - On open, goes through same handshake as real transport
 * - Virtual firmware responds {H_ok} to N=0, N=201, N=999, N=210, N=211
 * - For N=120 emits two diagnostics lines
 * - Ignores N=200 (no response)
 */

import { logger } from '../logging/logger.js';
import { 
  HANDSHAKE_TIMEOUT_MS, 
  COMMAND_TIMEOUT_MS,
  MAX_COMMANDS_PER_SEC,
} from '../config/env.js';
import { 
  isBootMarker, 
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

export class LoopbackEmulator {
  private events: TransportEvents;
  
  private _state: TransportState = 'closed';
  private bootMarkerSeen = false;
  private helloAttempts = 0;
  private handshakeTimer: NodeJS.Timeout | null = null;
  private helloTimer: NodeJS.Timeout | null = null;
  
  // Stats
  private rxBytes = 0;
  private txBytes = 0;
  private lastRxAt: number | null = null;
  private lastTxAt: number | null = null;
  private lastBootMarkerAt: number | null = null;
  private resetsSeen = 0;
  
  constructor(events: TransportEvents) {
    this.events = events;
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
      logger.info(`[Loopback] State: ${oldState} -> ${newState}`);
      this.events.onStateChange(newState);
    }
  }
  
  /**
   * Open the loopback (emulates serial port open + firmware boot)
   */
  async open(): Promise<void> {
    this.setState('opening');
    
    // Simulate DTR settle delay
    await this.sleep(100);
    
    this.startHandshake();
    
    // Schedule firmware boot marker
    setTimeout(() => {
      this.firmwareEmitLine('R');
      this.lastBootMarkerAt = Date.now();
      this.resetsSeen++;
    }, 50);
  }
  
  /**
   * Close the loopback
   */
  async close(): Promise<void> {
    this.clearTimers();
    this.setState('closed');
  }
  
  /**
   * Write a line (sent from bridge to virtual firmware)
   */
  writeLine(line: string, priority: number = PRIORITY.COMMAND): boolean {
    this.txBytes += line.length + 1;
    this.lastTxAt = Date.now();
    
    // Parse and handle as firmware would
    try {
      const cmd = JSON.parse(line);
      this.firmwareHandleCommand(cmd);
    } catch {
      logger.debug(`[Loopback] Invalid command: ${line}`);
    }
    
    return true;
  }
  
  /**
   * Write a firmware command
   */
  writeCommand(cmd: FirmwareCommand): boolean {
    const line = serializeCommand(cmd);
    return this.writeLine(line, getPriorityForCommand(cmd.N));
  }
  
  /**
   * Virtual firmware emits a line (response to bridge)
   */
  private firmwareEmitLine(line: string): void {
    this.rxBytes += line.length + 1;
    this.lastRxAt = Date.now();
    
    // Process for handshake
    this.handleLine(line);
    
    // Forward to event handler
    this.events.onLine(line);
  }
  
  /**
   * Virtual firmware handles a command
   * Firmware responds with {<tag>_ok} format, truncated to ~8 chars
   */
  private firmwareHandleCommand(cmd: { N: number; H?: string; D1?: number; D2?: number; T?: number }): void {
    // Simulate processing delay
    const tag = cmd.H ? cmd.H.substring(0, 8) : 'H';
    
    setTimeout(() => {
      switch (cmd.N) {
        case CMD.HELLO:
          this.firmwareEmitLine(`{${tag}_ok}`);
          break;
          
        case CMD.STOP:
        case CMD.DIRECT_MOTOR:
        case CMD.MACRO_START:
        case CMD.MACRO_CANCEL:
          this.firmwareEmitLine(`{${tag}_ok}`);
          break;
          
        case CMD.DIAGNOSTICS:
          // Emit two diagnostic lines
          const leftPWM = Math.floor(Math.random() * 200) - 100;
          const rightPWM = Math.floor(Math.random() * 200) - 100;
          this.firmwareEmitLine(`{I${leftPWM},${rightPWM},0,0,${this.resetsSeen}}`);
          setTimeout(() => {
            this.firmwareEmitLine(`{stats:rx=${this.txBytes},jd=0,pe=0,bc=0,tx=${this.rxBytes},ms=${Date.now() % 100000}}`);
          }, 10);
          break;
          
        case CMD.SETPOINT:
          // N=200 - no response (fire-and-forget)
          break;
          
        default:
          // Unknown command - respond with ok for legacy compatibility
          this.firmwareEmitLine(`{${tag}_ok}`);
          break;
      }
    }, 5 + Math.random() * 10); // 5-15ms simulated delay
  }
  
  /**
   * Handle an incoming line (for handshake logic)
   */
  private handleLine(line: string): void {
    const trimmed = line.trim();
    if (!trimmed) return;
    
    // Check for boot marker
    if (isBootMarker(trimmed)) {
      this.bootMarkerSeen = true;
      logger.log('handshake_step', { step: 'boot_marker', resets: this.resetsSeen });
      
      if (this._state === 'waiting_boot') {
        this.attemptHello();
      }
      return;
    }
    
    // During handshake, check for hello response
    if (this._state === 'handshaking') {
      if (isTokenResponse(trimmed)) {
        // Got a response - consider handshake complete
        this.handshakeComplete();
      }
    }
    
    // If still waiting for boot and we get any valid line, proceed
    if (this._state === 'waiting_boot') {
      if (isTokenResponse(trimmed)) {
        this.attemptHello();
      }
    }
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
    
    // Send hello command to virtual firmware
    const helloCmd = buildHelloCommand(`h${this.helloAttempts}`);
    this.writeCommand(helloCmd);
    
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
  }
  
  /**
   * Get transport statistics
   */
  getStats() {
    return {
      state: this._state,
      port: 'LOOPBACK',
      baud: 115200,
      rxBytes: this.rxBytes,
      txBytes: this.txBytes,
      lastRxAt: this.lastRxAt,
      lastTxAt: this.lastTxAt,
      lastBootMarkerAt: this.lastBootMarkerAt,
      resetsSeen: this.resetsSeen,
      writeQueueDepth: 0,
    };
  }
  
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
