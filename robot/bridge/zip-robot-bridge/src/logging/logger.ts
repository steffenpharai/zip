/**
 * NDJSON Logger
 * Non-blocking logging to file with structured events
 */

import fs from 'fs';
import path from 'path';
import { LOG_PATH, DEBUG } from '../config/env.js';

export type LogEvent =
  | 'serial_open'
  | 'serial_close'
  | 'serial_error'
  | 'rx_line'
  | 'tx_cmd'
  | 'ws_connect'
  | 'ws_disconnect'
  | 'ws_msg'
  | 'pending_timeout'
  | 'handshake_step'
  | 'stream_start'
  | 'stream_stop'
  | 'stream_update'
  | 'rate_limit'
  | 'health_check'
  | 'emergency_stop'
  | 'error';

export interface LogEntry {
  timestamp: number;
  event: LogEvent;
  data?: Record<string, unknown>;
}

class Logger {
  private fd: number | null = null;
  private queue: string[] = [];
  private writing = false;
  private logPath: string;
  
  constructor() {
    this.logPath = LOG_PATH;
    this.ensureDir();
    this.open();
  }
  
  private ensureDir(): void {
    const dir = path.dirname(this.logPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
  
  private open(): void {
    try {
      this.fd = fs.openSync(this.logPath, 'a');
    } catch (err) {
      console.error('[Logger] Failed to open log file:', err);
    }
  }
  
  log(event: LogEvent, data?: Record<string, unknown>): void {
    const entry: LogEntry = {
      timestamp: Date.now(),
      event,
      data,
    };
    
    // Verbose rx_line only in DEBUG mode
    if (event === 'rx_line' && !DEBUG) {
      return;
    }
    
    const line = JSON.stringify(entry) + '\n';
    this.queue.push(line);
    
    // Non-blocking write
    if (!this.writing) {
      this.flush();
    }
  }
  
  private flush(): void {
    if (this.fd === null || this.queue.length === 0) {
      this.writing = false;
      return;
    }
    
    this.writing = true;
    const batch = this.queue.splice(0, 100).join('');
    
    fs.write(this.fd, batch, (err) => {
      if (err) {
        console.error('[Logger] Write error:', err);
      }
      // Continue flushing if more items
      if (this.queue.length > 0) {
        setImmediate(() => this.flush());
      } else {
        this.writing = false;
      }
    });
  }
  
  close(): void {
    if (this.fd !== null) {
      // Flush remaining synchronously
      if (this.queue.length > 0) {
        const batch = this.queue.join('');
        fs.writeSync(this.fd, batch);
        this.queue = [];
      }
      fs.closeSync(this.fd);
      this.fd = null;
    }
  }
  
  // Console logging helpers
  info(msg: string, data?: Record<string, unknown>): void {
    console.log(`[Bridge] ${msg}`, data ? JSON.stringify(data) : '');
  }
  
  warn(msg: string, data?: Record<string, unknown>): void {
    console.warn(`[Bridge] ⚠️ ${msg}`, data ? JSON.stringify(data) : '');
  }
  
  error(msg: string, data?: Record<string, unknown>): void {
    console.error(`[Bridge] ❌ ${msg}`, data ? JSON.stringify(data) : '');
    this.log('error', { message: msg, ...data });
  }
  
  debug(msg: string, data?: Record<string, unknown>): void {
    if (DEBUG) {
      console.log(`[Bridge] 🔍 ${msg}`, data ? JSON.stringify(data) : '');
    }
  }
}

export const logger = new Logger();

