/**
 * Robot WebSocket Server
 * Handles WebSocket connections and message validation
 * 
 * Message Types:
 * - robot.command: Send a firmware command
 * - robot.stream.start: Start setpoint streaming
 * - robot.stream.update: Update setpoint during streaming
 * - robot.stream.stop: Stop streaming
 */

import { WebSocketServer, WebSocket } from 'ws';
import { z } from 'zod';
import { logger } from '../logging/logger.js';
import { WS_PORT, COMMAND_TIMEOUT_MS } from '../config/env.js';
import { 
  FirmwareCommandSchema, 
  type FirmwareCommand,
  COMMANDS_EXPECTING_REPLY,
} from '../protocol/FirmwareJson.js';
import type { ReplyMatcher, CommandResult } from '../protocol/ReplyMatcher.js';
import type { SetpointStreamer } from '../streaming/SetpointStreamer.js';
import type { SerialTransport } from '../serial/SerialTransport.js';

// ============================================================================
// Message Schemas
// ============================================================================

const RobotCommandSchema = z.object({
  type: z.literal('robot.command'),
  id: z.string(),
  payload: FirmwareCommandSchema,
  expectReply: z.boolean().optional().default(true),
  timeoutMs: z.number().int().positive().optional().default(COMMAND_TIMEOUT_MS),
});

const StreamStartSchema = z.object({
  type: z.literal('robot.stream.start'),
  id: z.string(),
  rateHz: z.number().int().min(1).max(20).optional().default(10),
  ttlMs: z.number().int().min(100).max(500).optional().default(200),
  v: z.number().int().min(-255).max(255),
  w: z.number().int().min(-255).max(255),
});

const StreamUpdateSchema = z.object({
  type: z.literal('robot.stream.update'),
  id: z.string(),
  v: z.number().int().min(-255).max(255),
  w: z.number().int().min(-255).max(255),
  ttlMs: z.number().int().min(100).max(500).optional(),
});

const StreamStopSchema = z.object({
  type: z.literal('robot.stream.stop'),
  id: z.string(),
  hardStop: z.boolean().optional().default(true),
});

const WsMessageSchema = z.discriminatedUnion('type', [
  RobotCommandSchema,
  StreamStartSchema,
  StreamUpdateSchema,
  StreamStopSchema,
]);

type WsMessage = z.infer<typeof WsMessageSchema>;

// ============================================================================
// Response Types
// ============================================================================

export interface RobotReply {
  type: 'robot.reply';
  id: string;
  ok: boolean;
  replyKind: 'token' | 'diagnostics' | 'none';
  token: string | null;
  diagnostics: string[] | null;
  timingMs: number;
}

export interface RobotSerialRx {
  type: 'robot.serial.rx';
  line: string;
  ts: number;
}

export interface RobotStatus {
  type: 'robot.status';
  ready: boolean;
  port: string | null;
  baud: number;
  streaming: boolean;
  streamRateHz: number;
  rxBytes: number;
  txBytes: number;
  pending: number;
  lastReadyMsAgo: number | null;
}

// ============================================================================
// WebSocket Server
// ============================================================================

export class RobotWsServer {
  private wss: WebSocketServer;
  private clients = new Set<WebSocket>();
  private transport: SerialTransport | null = null;
  private replyMatcher: ReplyMatcher | null = null;
  private streamer: SetpointStreamer | null = null;
  private readyAt: number | null = null;
  
  constructor(port: number = WS_PORT) {
    this.wss = new WebSocketServer({ port, path: '/robot' });
    
    this.wss.on('connection', (ws: WebSocket) => {
      this.handleConnection(ws);
    });
    
    logger.info(`WebSocket server listening on ws://localhost:${port}/robot`);
  }
  
  /**
   * Set the serial transport
   */
  setTransport(transport: SerialTransport): void {
    this.transport = transport;
  }
  
  /**
   * Set the reply matcher
   */
  setReplyMatcher(matcher: ReplyMatcher): void {
    this.replyMatcher = matcher;
  }
  
  /**
   * Set the setpoint streamer
   */
  setStreamer(streamer: SetpointStreamer): void {
    this.streamer = streamer;
  }
  
  /**
   * Mark the bridge as ready
   */
  markReady(): void {
    this.readyAt = Date.now();
    this.broadcastStatus();
  }
  
  /**
   * Handle a new WebSocket connection
   */
  private handleConnection(ws: WebSocket): void {
    this.clients.add(ws);
    logger.log('ws_connect', { clients: this.clients.size });
    
    // Send initial status
    this.sendStatus(ws);
    
    ws.on('message', (data: Buffer) => {
      this.handleMessage(ws, data);
    });
    
    ws.on('close', () => {
      this.clients.delete(ws);
      logger.log('ws_disconnect', { clients: this.clients.size });
    });
    
    ws.on('error', (error: Error) => {
      logger.error('WebSocket error', { error: error.message });
    });
  }
  
  /**
   * Handle an incoming WebSocket message
   */
  private async handleMessage(ws: WebSocket, data: Buffer): Promise<void> {
    let message: WsMessage;
    
    try {
      const json = JSON.parse(data.toString());
      message = WsMessageSchema.parse(json);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      this.sendError(ws, 'invalid_message', errorMsg);
      return;
    }
    
    logger.log('ws_msg', { type: message.type, id: message.id });
    
    switch (message.type) {
      case 'robot.command':
        await this.handleCommand(ws, message);
        break;
      case 'robot.stream.start':
        this.handleStreamStart(ws, message);
        break;
      case 'robot.stream.update':
        this.handleStreamUpdate(ws, message);
        break;
      case 'robot.stream.stop':
        await this.handleStreamStop(ws, message);
        break;
    }
  }
  
  /**
   * Handle a robot.command message
   */
  private async handleCommand(
    ws: WebSocket, 
    msg: z.infer<typeof RobotCommandSchema>
  ): Promise<void> {
    if (!this.transport || !this.transport.isReady) {
      this.sendReply(ws, {
        id: msg.id,
        ok: false,
        replyKind: 'none',
        token: null,
        diagnostics: null,
        timingMs: 0,
      }, 'Bridge not ready');
      return;
    }
    
    const cmd = msg.payload;
    
    // Check if command expects a reply
    const expectsReply = COMMANDS_EXPECTING_REPLY.has(cmd.N as number);
    
    if (expectsReply && this.replyMatcher) {
      // Add to pending queue before sending
      const resultPromise = this.replyMatcher.addPending(msg.id, cmd, msg.timeoutMs);
      
      // Send command
      this.transport.writeCommand(cmd);
      
      try {
        const result = await resultPromise;
        this.sendReply(ws, result);
      } catch (error) {
        this.sendReply(ws, {
          id: msg.id,
          ok: false,
          replyKind: 'none',
          token: null,
          diagnostics: null,
          timingMs: 0,
        }, error instanceof Error ? error.message : 'Command failed');
      }
    } else {
      // Fire-and-forget command
      this.transport.writeCommand(cmd);
      this.sendReply(ws, {
        id: msg.id,
        ok: true,
        replyKind: 'none',
        token: null,
        diagnostics: null,
        timingMs: 0,
      });
    }
  }
  
  /**
   * Handle a robot.stream.start message
   */
  private handleStreamStart(
    ws: WebSocket, 
    msg: z.infer<typeof StreamStartSchema>
  ): void {
    if (!this.transport || !this.transport.isReady) {
      this.sendReply(ws, {
        id: msg.id,
        ok: false,
        replyKind: 'none',
        token: null,
        diagnostics: null,
        timingMs: 0,
      }, 'Bridge not ready');
      return;
    }
    
    if (!this.streamer) {
      this.sendReply(ws, {
        id: msg.id,
        ok: false,
        replyKind: 'none',
        token: null,
        diagnostics: null,
        timingMs: 0,
      }, 'Streamer not available');
      return;
    }
    
    this.streamer.start(msg.v, msg.w, msg.rateHz, msg.ttlMs);
    
    this.sendReply(ws, {
      id: msg.id,
      ok: true,
      replyKind: 'none',
      token: null,
      diagnostics: null,
      timingMs: 0,
    });
    
    this.broadcastStatus();
  }
  
  /**
   * Handle a robot.stream.update message
   */
  private handleStreamUpdate(
    ws: WebSocket, 
    msg: z.infer<typeof StreamUpdateSchema>
  ): void {
    if (!this.streamer) {
      this.sendReply(ws, {
        id: msg.id,
        ok: false,
        replyKind: 'none',
        token: null,
        diagnostics: null,
        timingMs: 0,
      }, 'Streamer not available');
      return;
    }
    
    this.streamer.update(msg.v, msg.w, msg.ttlMs);
    
    this.sendReply(ws, {
      id: msg.id,
      ok: true,
      replyKind: 'none',
      token: null,
      diagnostics: null,
      timingMs: 0,
    });
  }
  
  /**
   * Handle a robot.stream.stop message
   */
  private async handleStreamStop(
    ws: WebSocket, 
    msg: z.infer<typeof StreamStopSchema>
  ): Promise<void> {
    if (!this.streamer) {
      this.sendReply(ws, {
        id: msg.id,
        ok: false,
        replyKind: 'none',
        token: null,
        diagnostics: null,
        timingMs: 0,
      }, 'Streamer not available');
      return;
    }
    
    await this.streamer.stop(msg.hardStop);
    
    this.sendReply(ws, {
      id: msg.id,
      ok: true,
      replyKind: 'none',
      token: null,
      diagnostics: null,
      timingMs: 0,
    });
    
    this.broadcastStatus();
  }
  
  /**
   * Send a reply to a WebSocket client
   */
  private sendReply(ws: WebSocket, result: CommandResult, errorMessage?: string): void {
    const reply: RobotReply = {
      type: 'robot.reply',
      id: result.id,
      ok: result.ok && !errorMessage,
      replyKind: result.replyKind,
      token: result.token,
      diagnostics: result.diagnostics,
      timingMs: result.timingMs,
    };
    
    if (errorMessage) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (reply as any).error = errorMessage;
    }
    
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(reply));
    }
  }
  
  /**
   * Send an error to a WebSocket client
   */
  private sendError(ws: WebSocket, code: string, message: string): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'robot.error',
        code,
        message,
      }));
    }
  }
  
  /**
   * Send status to a single client
   */
  private sendStatus(ws: WebSocket): void {
    const status = this.buildStatus();
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(status));
    }
  }
  
  /**
   * Broadcast status to all clients
   */
  broadcastStatus(): void {
    const status = this.buildStatus();
    this.broadcast(status);
  }
  
  /**
   * Broadcast a serial RX line to all clients
   */
  broadcastRxLine(line: string): void {
    const msg: RobotSerialRx = {
      type: 'robot.serial.rx',
      line,
      ts: Date.now(),
    };
    this.broadcast(msg);
  }
  
  /**
   * Build status object
   */
  private buildStatus(): RobotStatus {
    const transportStats = this.transport?.getStats();
    const streamerStats = this.streamer?.getStats();
    
    return {
      type: 'robot.status',
      ready: this.transport?.isReady ?? false,
      port: transportStats?.port ?? null,
      baud: transportStats?.baud ?? 115200,
      streaming: streamerStats?.status === 'streaming',
      streamRateHz: streamerStats?.rateHz ?? 0,
      rxBytes: transportStats?.rxBytes ?? 0,
      txBytes: transportStats?.txBytes ?? 0,
      pending: this.replyMatcher?.getPendingCount() ?? 0,
      lastReadyMsAgo: this.readyAt ? Date.now() - this.readyAt : null,
    };
  }
  
  /**
   * Broadcast a message to all clients
   */
  private broadcast(msg: object): void {
    const data = JSON.stringify(msg);
    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data);
      }
    }
  }
  
  /**
   * Get client count
   */
  getClientCount(): number {
    return this.clients.size;
  }
  
  /**
   * Close the server
   */
  close(): void {
    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.close();
      }
    }
    this.clients.clear();
    this.wss.close();
  }
}

