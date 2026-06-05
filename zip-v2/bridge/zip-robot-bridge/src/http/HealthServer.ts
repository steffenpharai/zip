/**
 * Health HTTP Server
 * Provides health check endpoint and emergency stop API
 */

import http from 'http';
import { logger } from '../logging/logger.js';
import { HTTP_PORT } from '../config/env.js';
import type { SerialTransport } from '../serial/SerialTransport.js';
import type { ReplyMatcher } from '../protocol/ReplyMatcher.js';
import type { SetpointStreamer } from '../streaming/SetpointStreamer.js';
import { buildStopCommand, PRIORITY } from '../protocol/FirmwareJson.js';

export interface HealthStatus {
  status: 'ok' | 'degraded' | 'error';
  serialOpen: boolean;
  ready: boolean;
  port: string | null;
  baud: number;
  streaming: boolean;
  pendingQueueDepth: number;
  lastRxAt: number | null;
  lastTxAt: number | null;
  lastBootMarkerAt: number | null;
  resetsSeen: number;
  rxBytes: number;
  txBytes: number;
  uptime: number;
  timestamp: number;
}

export class HealthServer {
  private server: http.Server;
  private transport: SerialTransport | null = null;
  private replyMatcher: ReplyMatcher | null = null;
  private streamer: SetpointStreamer | null = null;
  private startTime: number = Date.now();
  
  constructor(port: number = HTTP_PORT) {
    this.server = http.createServer((req, res) => {
      this.handleRequest(req, res);
    });
    
    this.server.listen(port, () => {
      logger.info(`HTTP server listening on http://localhost:${port}`);
    });
  }
  
  /**
   * Set dependencies
   */
  setTransport(transport: SerialTransport): void {
    this.transport = transport;
  }
  
  setReplyMatcher(matcher: ReplyMatcher): void {
    this.replyMatcher = matcher;
  }
  
  setStreamer(streamer: SetpointStreamer): void {
    this.streamer = streamer;
  }
  
  /**
   * Handle an HTTP request
   */
  private handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }
    
    const url = req.url || '/';
    const method = req.method || 'GET';
    
    // Route requests
    if (method === 'GET' && url === '/health') {
      this.handleHealth(res);
    } else if (method === 'POST' && url === '/api/robot/stop') {
      this.handleEmergencyStop(req, res);
    } else {
      res.writeHead(404);
      res.end(JSON.stringify({ error: 'Not found' }));
    }
  }
  
  /**
   * Handle GET /health
   */
  private handleHealth(res: http.ServerResponse): void {
    logger.log('health_check', {});
    
    const status = this.buildHealthStatus();
    
    res.setHeader('Content-Type', 'application/json');
    res.writeHead(status.status === 'ok' ? 200 : status.status === 'degraded' ? 200 : 503);
    res.end(JSON.stringify(status));
  }
  
  /**
   * Handle POST /api/robot/stop
   */
  private async handleEmergencyStop(
    req: http.IncomingMessage, 
    res: http.ServerResponse
  ): Promise<void> {
    logger.log('emergency_stop', {});
    
    // Stop streaming first
    if (this.streamer && this.streamer.isStreaming()) {
      await this.streamer.stop(false); // Don't send stop here, we'll do it manually
    }
    
    // Send stop command with highest priority
    if (this.transport && this.transport.isReady) {
      const stopCmd = buildStopCommand('emergency');
      this.transport.writeCommand(stopCmd);
    }
    
    res.setHeader('Content-Type', 'application/json');
    res.writeHead(200);
    res.end(JSON.stringify({
      ok: true,
      message: 'Emergency stop sent',
      timestamp: Date.now(),
    }));
  }
  
  /**
   * Build health status object
   */
  private buildHealthStatus(): HealthStatus {
    const transportStats = this.transport?.getStats();
    const isReady = this.transport?.isReady ?? false;
    const isOpen = transportStats?.state !== 'closed' && transportStats?.state !== 'error';
    
    let status: 'ok' | 'degraded' | 'error' = 'ok';
    if (!isOpen) {
      status = 'error';
    } else if (!isReady) {
      status = 'degraded';
    }
    
    return {
      status,
      serialOpen: isOpen,
      ready: isReady,
      port: transportStats?.port ?? null,
      baud: transportStats?.baud ?? 115200,
      streaming: this.streamer?.isStreaming() ?? false,
      pendingQueueDepth: this.replyMatcher?.getPendingCount() ?? 0,
      lastRxAt: transportStats?.lastRxAt ?? null,
      lastTxAt: transportStats?.lastTxAt ?? null,
      lastBootMarkerAt: transportStats?.lastBootMarkerAt ?? null,
      resetsSeen: transportStats?.resetsSeen ?? 0,
      rxBytes: transportStats?.rxBytes ?? 0,
      txBytes: transportStats?.txBytes ?? 0,
      uptime: Date.now() - this.startTime,
      timestamp: Date.now(),
    };
  }
  
  /**
   * Close the server
   */
  close(): void {
    this.server.close();
  }
}

