/**
 * Reply Matcher
 * Correlates firmware responses to pending commands using FIFO ordering
 * 
 * The firmware does NOT include request IDs in responses.
 * We match replies by:
 * 1. FIFO ordering - oldest pending command matches first
 * 2. Response "shape" - token vs diagnostics
 */

import { logger } from '../logging/logger.js';
import { 
  CMD, 
  COMMANDS_EXPECTING_REPLY,
  isTokenResponse, 
  parseTokenResponse,
  isDiagnosticsLine,
  type FirmwareCommand,
  type TokenResponse,
  type DiagnosticsResponse,
} from './FirmwareJson.js';
import { COMMAND_TIMEOUT_MS, DIAGNOSTICS_COLLECT_MS } from '../config/env.js';

export interface PendingCommand {
  id: string;
  command: FirmwareCommand;
  sentAt: number;
  timeoutMs: number;
  resolve: (result: CommandResult) => void;
  reject: (error: Error) => void;
}

export interface CommandResult {
  id: string;
  ok: boolean;
  replyKind: 'token' | 'diagnostics' | 'none';
  token: string | null;
  diagnostics: string[] | null;
  timingMs: number;
}

interface DiagnosticsCollector {
  pendingCmd: PendingCommand;
  lines: string[];
  startedAt: number;
  timer: NodeJS.Timeout | null;
  maxLines: number;
  maxBytes: number;
  currentBytes: number;
}

export class ReplyMatcher {
  private pendingQueue: PendingCommand[] = [];
  private diagCollector: DiagnosticsCollector | null = null;
  private timeoutCheckInterval: NodeJS.Timeout | null = null;
  
  constructor() {
    // Check for timeouts every 50ms
    this.timeoutCheckInterval = setInterval(() => this.checkTimeouts(), 50);
  }
  
  /**
   * Add a command to the pending queue
   */
  addPending(
    id: string,
    command: FirmwareCommand,
    timeoutMs: number = COMMAND_TIMEOUT_MS
  ): Promise<CommandResult> {
    // Check if command expects a reply
    if (!COMMANDS_EXPECTING_REPLY.has(command.N as number)) {
      // Fire-and-forget command
      return Promise.resolve({
        id,
        ok: true,
        replyKind: 'none',
        token: null,
        diagnostics: null,
        timingMs: 0,
      });
    }
    
    return new Promise((resolve, reject) => {
      const pending: PendingCommand = {
        id,
        command,
        sentAt: Date.now(),
        timeoutMs,
        resolve,
        reject,
      };
      
      this.pendingQueue.push(pending);
      logger.debug(`Added pending command: id=${id}, N=${command.N}, queue=${this.pendingQueue.length}`);
    });
  }
  
  /**
   * Process an incoming line from the firmware
   */
  processLine(line: string): void {
    const trimmed = line.trim();
    if (!trimmed) return;
    
    logger.log('rx_line', { line: trimmed });
    
    // If we're collecting diagnostics, add to collector
    if (this.diagCollector) {
      if (isDiagnosticsLine(trimmed) || this.isLikelyDiagnosticsLine(trimmed)) {
        this.addDiagnosticsLine(trimmed);
        return;
      }
      // Non-diagnostics line - finalize collector first
      this.finalizeDiagnosticsCollector();
    }
    
    // Check if it's a token response
    const tokenResp = parseTokenResponse(trimmed);
    if (tokenResp) {
      this.handleTokenResponse(tokenResp);
      return;
    }
    
    // Check if it's a diagnostics line (start of N=120 response)
    if (isDiagnosticsLine(trimmed)) {
      this.startDiagnosticsCollection(trimmed);
      return;
    }
    
    // Unknown line - log and ignore
    logger.debug(`Unknown line: ${trimmed}`);
  }
  
  /**
   * Handle a token response like {H_ok}
   */
  private handleTokenResponse(resp: TokenResponse): void {
    // Find oldest pending command expecting a token (not N=120)
    const idx = this.pendingQueue.findIndex(p => p.command.N !== CMD.DIAGNOSTICS);
    
    if (idx === -1) {
      logger.warn(`Token response with no pending command: ${resp.token}`);
      return;
    }
    
    const pending = this.pendingQueue.splice(idx, 1)[0];
    const timingMs = Date.now() - pending.sentAt;
    
    logger.debug(`Matched token ${resp.token} to command id=${pending.id}, timing=${timingMs}ms`);
    
    // For sensor responses (like {batt_1136}), tokenKind is 'value', which should be ok=true
    // Only 'false' and 'unknown' should result in ok=false
    pending.resolve({
      id: pending.id,
      ok: resp.tokenKind !== 'false' && resp.tokenKind !== 'unknown',
      replyKind: 'token',
      token: resp.token,
      diagnostics: null,
      timingMs,
    });
  }
  
  /**
   * Start collecting diagnostics lines
   */
  private startDiagnosticsCollection(firstLine: string): void {
    // Find pending N=120 command
    const idx = this.pendingQueue.findIndex(p => p.command.N === CMD.DIAGNOSTICS);
    
    if (idx === -1) {
      logger.warn(`Diagnostics line with no pending N=120 command: ${firstLine}`);
      return;
    }
    
    const pending = this.pendingQueue.splice(idx, 1)[0];
    
    this.diagCollector = {
      pendingCmd: pending,
      lines: [firstLine],
      startedAt: Date.now(),
      timer: null,
      maxLines: 10,
      maxBytes: 512,
      currentBytes: firstLine.length,
    };
    
    // Set timer to finalize after quiet period
    this.diagCollector.timer = setTimeout(() => {
      this.finalizeDiagnosticsCollector();
    }, DIAGNOSTICS_COLLECT_MS);
  }
  
  /**
   * Add a line to diagnostics collector
   */
  private addDiagnosticsLine(line: string): void {
    if (!this.diagCollector) return;
    
    this.diagCollector.lines.push(line);
    this.diagCollector.currentBytes += line.length;
    
    // Reset the quiet timer
    if (this.diagCollector.timer) {
      clearTimeout(this.diagCollector.timer);
    }
    this.diagCollector.timer = setTimeout(() => {
      this.finalizeDiagnosticsCollector();
    }, DIAGNOSTICS_COLLECT_MS);
    
    // Check limits
    if (
      this.diagCollector.lines.length >= this.diagCollector.maxLines ||
      this.diagCollector.currentBytes >= this.diagCollector.maxBytes
    ) {
      this.finalizeDiagnosticsCollector();
    }
  }
  
  /**
   * Finalize diagnostics collection and resolve
   */
  private finalizeDiagnosticsCollector(): void {
    if (!this.diagCollector) return;
    
    const { pendingCmd, lines, startedAt, timer } = this.diagCollector;
    
    if (timer) {
      clearTimeout(timer);
    }
    
    const timingMs = Date.now() - pendingCmd.sentAt;
    
    logger.debug(`Finalized diagnostics: id=${pendingCmd.id}, lines=${lines.length}, timing=${timingMs}ms`);
    
    pendingCmd.resolve({
      id: pendingCmd.id,
      ok: true,
      replyKind: 'diagnostics',
      token: null,
      diagnostics: lines,
      timingMs,
    });
    
    this.diagCollector = null;
  }
  
  /**
   * Check if a line looks like it could be diagnostics continuation
   */
  private isLikelyDiagnosticsLine(line: string): boolean {
    // Lines starting with { that aren't tokens
    return line.startsWith('{') && !isTokenResponse(line);
  }
  
  /**
   * Check for timed-out commands
   */
  private checkTimeouts(): void {
    const now = Date.now();
    
    // Check pending queue
    const timedOut: PendingCommand[] = [];
    this.pendingQueue = this.pendingQueue.filter(p => {
      if (now - p.sentAt > p.timeoutMs) {
        timedOut.push(p);
        return false;
      }
      return true;
    });
    
    for (const p of timedOut) {
      logger.log('pending_timeout', { id: p.id, N: p.command.N });
      p.reject(new Error(`Command timeout after ${p.timeoutMs}ms`));
    }
    
    // Check diagnostics collector timeout (overall, not just quiet period)
    if (this.diagCollector) {
      const elapsed = now - this.diagCollector.pendingCmd.sentAt;
      if (elapsed > this.diagCollector.pendingCmd.timeoutMs * 2) {
        // Force finalize even if incomplete
        this.finalizeDiagnosticsCollector();
      }
    }
  }
  
  /**
   * Get count of pending commands
   */
  getPendingCount(): number {
    return this.pendingQueue.length + (this.diagCollector ? 1 : 0);
  }
  
  /**
   * Cleanup resources
   */
  cleanup(): void {
    if (this.timeoutCheckInterval) {
      clearInterval(this.timeoutCheckInterval);
      this.timeoutCheckInterval = null;
    }
    
    if (this.diagCollector?.timer) {
      clearTimeout(this.diagCollector.timer);
    }
    
    // Reject all pending
    for (const p of this.pendingQueue) {
      p.reject(new Error('ReplyMatcher shutdown'));
    }
    this.pendingQueue = [];
    
    if (this.diagCollector) {
      this.diagCollector.pendingCmd.reject(new Error('ReplyMatcher shutdown'));
      this.diagCollector = null;
    }
  }
}

