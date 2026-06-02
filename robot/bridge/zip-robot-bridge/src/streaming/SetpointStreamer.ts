/**
 * Setpoint Streamer
 * Manages streaming of N=200 setpoint commands at a fixed rate
 * 
 * Features:
 * - Single timer (no parallel timers)
 * - Coalesces setpoint updates (keeps latest)
 * - Enforces rate limits and TTL clamping
 * - Clean stop with N=201
 */

import { logger } from '../logging/logger.js';
import { 
  STREAM_DEFAULT_RATE_HZ,
  STREAM_MAX_RATE_HZ,
  STREAM_DEFAULT_TTL_MS,
  STREAM_MIN_TTL_MS,
  STREAM_MAX_TTL_MS,
} from '../config/env.js';
import {
  buildSetpointCommand,
  buildStopCommand,
  clampPWM,
  clampTTL,
  clampRateHz,
  type FirmwareCommand,
} from '../protocol/FirmwareJson.js';

export interface SetpointState {
  v: number;     // Forward velocity (-255 to 255)
  w: number;     // Yaw/turn rate (-255 to 255)
  ttlMs: number; // Time-to-live in ms
}

export interface StreamerConfig {
  rateHz: number;
  ttlMs: number;
}

export type StreamerStatus = 'stopped' | 'streaming';

export class SetpointStreamer {
  private status: StreamerStatus = 'stopped';
  private currentSetpoint: SetpointState | null = null;
  private config: StreamerConfig;
  private timer: NodeJS.Timeout | null = null;
  private sendFn: ((cmd: FirmwareCommand) => boolean) | null = null;
  
  // Stats
  private framesSent = 0;
  private streamStartedAt: number | null = null;
  
  constructor() {
    this.config = {
      rateHz: STREAM_DEFAULT_RATE_HZ,
      ttlMs: STREAM_DEFAULT_TTL_MS,
    };
  }
  
  /**
   * Set the function used to send commands
   */
  setSendFunction(fn: (cmd: FirmwareCommand) => boolean): void {
    this.sendFn = fn;
  }
  
  /**
   * Start streaming with initial setpoint
   */
  start(v: number, w: number, rateHz?: number, ttlMs?: number): void {
    // Clamp values
    const clampedRate = clampRateHz(rateHz ?? STREAM_DEFAULT_RATE_HZ, STREAM_MAX_RATE_HZ);
    const clampedTtl = clampTTL(ttlMs ?? STREAM_DEFAULT_TTL_MS);
    
    // Update config
    this.config = {
      rateHz: clampedRate,
      ttlMs: clampedTtl,
    };
    
    // Set initial setpoint
    this.currentSetpoint = {
      v: clampPWM(v),
      w: clampPWM(w),
      ttlMs: clampedTtl,
    };
    
    // Start timer if not already running
    if (this.status !== 'streaming') {
      this.status = 'streaming';
      this.framesSent = 0;
      this.streamStartedAt = Date.now();
      this.startTimer();
      
      logger.log('stream_start', {
        v: this.currentSetpoint.v,
        w: this.currentSetpoint.w,
        rateHz: clampedRate,
        ttlMs: clampedTtl,
      });
    }
    
    // Send first frame immediately
    this.sendFrame();
  }
  
  /**
   * Update the current setpoint (while streaming)
   */
  update(v: number, w: number, ttlMs?: number): void {
    if (this.status !== 'streaming') {
      // If not streaming, start streaming
      this.start(v, w, this.config.rateHz, ttlMs);
      return;
    }
    
    // Update setpoint (will be sent on next timer tick)
    this.currentSetpoint = {
      v: clampPWM(v),
      w: clampPWM(w),
      ttlMs: clampTTL(ttlMs ?? this.config.ttlMs),
    };
    
    logger.log('stream_update', {
      v: this.currentSetpoint.v,
      w: this.currentSetpoint.w,
      ttlMs: this.currentSetpoint.ttlMs,
    });
  }
  
  /**
   * Stop streaming
   * @param hardStop If true, send N=201 stop command
   */
  async stop(hardStop: boolean = true): Promise<void> {
    const wasStreaming = this.status === 'streaming';
    
    // Stop the timer first
    this.stopTimer();
    this.status = 'stopped';
    this.currentSetpoint = null;
    
    logger.log('stream_stop', {
      hardStop,
      framesSent: this.framesSent,
      durationMs: this.streamStartedAt ? Date.now() - this.streamStartedAt : 0,
    });
    
    this.streamStartedAt = null;
    
    // Send stop command if requested
    if (hardStop && wasStreaming && this.sendFn) {
      const stopCmd = buildStopCommand('stream_stop');
      this.sendFn(stopCmd);
    }
  }
  
  /**
   * Start the streaming timer
   */
  private startTimer(): void {
    if (this.timer) {
      clearInterval(this.timer);
    }
    
    const intervalMs = 1000 / this.config.rateHz;
    this.timer = setInterval(() => {
      this.sendFrame();
    }, intervalMs);
  }
  
  /**
   * Stop the streaming timer
   */
  private stopTimer(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
  
  /**
   * Send the current setpoint frame
   */
  private sendFrame(): void {
    if (!this.currentSetpoint || !this.sendFn) {
      return;
    }
    
    const cmd = buildSetpointCommand(
      this.currentSetpoint.v,
      this.currentSetpoint.w,
      this.currentSetpoint.ttlMs
    );
    
    if (this.sendFn(cmd)) {
      this.framesSent++;
    }
  }
  
  /**
   * Get current status
   */
  getStatus(): StreamerStatus {
    return this.status;
  }
  
  /**
   * Get current config
   */
  getConfig(): StreamerConfig {
    return { ...this.config };
  }
  
  /**
   * Get current setpoint
   */
  getCurrentSetpoint(): SetpointState | null {
    return this.currentSetpoint ? { ...this.currentSetpoint } : null;
  }
  
  /**
   * Get stats
   */
  getStats() {
    return {
      status: this.status,
      rateHz: this.config.rateHz,
      ttlMs: this.config.ttlMs,
      framesSent: this.framesSent,
      durationMs: this.streamStartedAt ? Date.now() - this.streamStartedAt : 0,
      currentSetpoint: this.currentSetpoint,
    };
  }
  
  /**
   * Check if currently streaming
   */
  isStreaming(): boolean {
    return this.status === 'streaming';
  }
  
  /**
   * Cleanup
   */
  cleanup(): void {
    this.stopTimer();
    this.status = 'stopped';
    this.currentSetpoint = null;
    this.sendFn = null;
  }
}

