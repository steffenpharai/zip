/**
 * Robot Bridge Client
 * 
 * WebSocket-based client for communicating with the robot bridge.
 * All robot commands are sent via WebSocket to the bridge, which forwards
 * them to the Arduino UNO via serial port.
 */

import type {
  FirmwareCommand,
  RobotDiagnostics,
  MotionOwner,
} from "./types";

// ============================================================================
// Types
// ============================================================================

/**
 * Response from robot.command message
 */
export interface BridgeCommandResponse {
  ok: boolean;
  token?: string;
  diagnostics?: string[];
  error?: string;
  timingMs: number;
}

/**
 * Response from bridge health endpoint
 */
export interface BridgeStatusResponse {
  status: "ok" | "error";
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

/**
 * Bridge client configuration
 */
export interface BridgeClientConfig {
  /** Bridge WebSocket URL (default: ws://localhost:8765/robot) */
  wsUrl: string;
  /** Bridge HTTP URL (default: http://localhost:8766) */
  httpUrl: string;
  /** Request timeout in ms (default: 2000) */
  timeoutMs: number;
  /** Status polling interval in ms (default: 5000) */
  statusPollingMs: number;
  /** Reconnect delay in ms (default: 2000) */
  reconnectDelay: number;
  /** Max reconnect attempts (default: 10) */
  maxReconnectAttempts: number;
}

/**
 * Bridge client state
 */
export interface BridgeClientState {
  connected: boolean;
  lastCommandTime: number | null;
  lastStatusTime: number | null;
  stats: BridgeStatusResponse | null;
  lastError: string | null;
}

// ============================================================================
// Default Configuration
// ============================================================================

export const DEFAULT_BRIDGE_CONFIG: BridgeClientConfig = {
  wsUrl: process.env.NEXT_PUBLIC_ROBOT_BRIDGE_WS_URL || "ws://localhost:8765/robot",
  httpUrl: process.env.NEXT_PUBLIC_ROBOT_BRIDGE_HTTP_URL || "http://localhost:8766",
  timeoutMs: 2000,
  statusPollingMs: 5000,
  reconnectDelay: 2000,
  maxReconnectAttempts: 10,
};

// ============================================================================
// Bridge Robot Client
// ============================================================================

class BridgeRobotClient {
  private config: BridgeClientConfig;
  private state: BridgeClientState;
  private ws: WebSocket | null = null;
  private statusPollingTimer: ReturnType<typeof setInterval> | null = null;
  private listeners = new Set<(state: BridgeClientState) => void>();
  private pendingCommands = new Map<string, {
    resolve: (response: BridgeCommandResponse) => void;
    reject: (error: Error) => void;
    timeout: ReturnType<typeof setTimeout>;
  }>();
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private nextId = 1;

  constructor(config: Partial<BridgeClientConfig> = {}) {
    this.config = { ...DEFAULT_BRIDGE_CONFIG, ...config };
    this.state = {
      connected: false,
      lastCommandTime: null,
      lastStatusTime: null,
      stats: null,
      lastError: null,
    };
  }

  // ==========================================================================
  // Configuration
  // ==========================================================================

  /**
   * Update client configuration
   */
  setConfig(config: Partial<BridgeClientConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   */
  getConfig(): BridgeClientConfig {
    return { ...this.config };
  }

  // ==========================================================================
  // State Management
  // ==========================================================================

  /**
   * Get current state
   */
  getState(): BridgeClientState {
    return { ...this.state };
  }

  /**
   * Subscribe to state changes
   */
  subscribe(listener: (state: BridgeClientState) => void): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  /**
   * Update state and notify listeners
   */
  private updateState(updates: Partial<BridgeClientState>): void {
    this.state = { ...this.state, ...updates };
    for (const listener of this.listeners) {
      listener(this.state);
    }
  }

  // ==========================================================================
  // WebSocket Connection Management
  // ==========================================================================

  /**
   * Connect to bridge WebSocket
   */
  connect(): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      return;
    }

    if (this.ws) {
      this.ws.close();
    }

    try {
      this.ws = new WebSocket(this.config.wsUrl);

      this.ws.onopen = () => {
        console.log("[BridgeClient] WebSocket connected");
        this.reconnectAttempts = 0;
        this.updateState({
          connected: true,
          lastError: null,
        });
        this.startPolling();
      };

      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          this.handleMessage(msg);
        } catch (error) {
          console.error("[BridgeClient] Failed to parse message:", error);
        }
      };

      this.ws.onerror = (error) => {
        console.error("[BridgeClient] WebSocket error:", error);
        this.updateState({
          connected: false,
          lastError: "WebSocket connection error",
        });
      };

      this.ws.onclose = () => {
        console.log("[BridgeClient] WebSocket closed");
        this.updateState({ connected: false });
        this.stopPolling();
        this.scheduleReconnect();
      };
    } catch (error) {
      console.error("[BridgeClient] Failed to create WebSocket:", error);
      this.updateState({
        connected: false,
        lastError: error instanceof Error ? error.message : "Connection failed",
      });
      this.scheduleReconnect();
    }
  }

  /**
   * Disconnect from bridge
   */
  disconnect(): void {
    this.stopPolling();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.updateState({ connected: false });
  }

  /**
   * Schedule reconnection attempt
   */
  private scheduleReconnect(): void {
    if (this.reconnectTimer || this.reconnectAttempts >= this.config.maxReconnectAttempts) {
      return;
    }

    this.reconnectAttempts++;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      console.log(`[BridgeClient] Reconnecting (attempt ${this.reconnectAttempts})...`);
      this.connect();
    }, this.config.reconnectDelay);
  }

  /**
   * Handle incoming WebSocket message
   */
  private handleMessage(msg: any): void {
    if (msg.type === "robot.reply") {
      const pending = this.pendingCommands.get(msg.id);
      if (pending) {
        clearTimeout(pending.timeout);
        this.pendingCommands.delete(msg.id);

        const response: BridgeCommandResponse = {
          ok: msg.ok,
          token: msg.token || undefined,
          diagnostics: msg.diagnostics || undefined,
          error: msg.error || undefined,
          timingMs: msg.timingMs || 0,
        };

        if (msg.ok) {
          pending.resolve(response);
        } else {
          pending.reject(new Error(msg.error || "Command failed"));
        }
      }
    } else if (msg.type === "robot.status") {
      // Update status from bridge
      this.updateState({
        lastStatusTime: Date.now(),
      });
    }
  }

  // ==========================================================================
  // Status Polling
  // ==========================================================================

  /**
   * Start status polling to monitor connection
   */
  startPolling(): void {
    if (this.statusPollingTimer) {
      return;
    }

    // Initial status check
    this.checkStatus();

    // Start polling
    this.statusPollingTimer = setInterval(() => {
      this.checkStatus();
    }, this.config.statusPollingMs);
  }

  /**
   * Stop status polling
   */
  stopPolling(): void {
    if (this.statusPollingTimer) {
      clearInterval(this.statusPollingTimer);
      this.statusPollingTimer = null;
    }
  }

  /**
   * Check if connected (based on WebSocket state)
   */
  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN && this.state.connected;
  }

  // ==========================================================================
  // HTTP Communication (for status)
  // ==========================================================================

  /**
   * Check bridge status via HTTP
   */
  async checkStatus(): Promise<BridgeStatusResponse | null> {
    try {
      const response = await fetch(`${this.config.httpUrl}/health`, {
        method: "GET",
        signal: AbortSignal.timeout(this.config.timeoutMs),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const status = (await response.json()) as BridgeStatusResponse;
      
      this.updateState({
        connected: status.ready && status.serialOpen,
        lastStatusTime: Date.now(),
        stats: status,
        lastError: null,
      });

      return status;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Connection failed";
      this.updateState({
        connected: false,
        lastError: errorMsg,
      });
      return null;
    }
  }

  // ==========================================================================
  // Robot Commands (WebSocket)
  // ==========================================================================

  /**
   * Send a command to the robot via WebSocket
   */
  async sendCommand(command: FirmwareCommand): Promise<BridgeCommandResponse> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      // Try to connect
      this.connect();
      throw new Error("Not connected to bridge. Attempting to connect...");
    }

    const id = `cmd_${this.nextId++}_${Date.now()}`;
    
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingCommands.delete(id);
        reject(new Error(`Command timeout after ${this.config.timeoutMs}ms`));
      }, this.config.timeoutMs);

      this.pendingCommands.set(id, {
        resolve,
        reject,
        timeout,
      });

      try {
        const message = JSON.stringify({
          type: "robot.command",
          id,
          payload: command,
          expectReply: true,
          timeoutMs: this.config.timeoutMs,
        });
        this.ws!.send(message);
        this.updateState({
          lastCommandTime: Date.now(),
        });
      } catch (error) {
        this.pendingCommands.delete(id);
        clearTimeout(timeout);
        reject(error instanceof Error ? error : new Error("Failed to send command"));
      }
    });
  }

  /**
   * Emergency stop
   */
  async stop(): Promise<BridgeCommandResponse> {
    return this.sendCommand({ N: 201, H: "stop" });
  }

  // ==========================================================================
  // High-Level Commands
  // ==========================================================================

  /**
   * Send hello/ping command (N=0)
   */
  async hello(): Promise<BridgeCommandResponse> {
    return this.sendCommand({ N: 0, H: "hello" });
  }

  /**
   * Get diagnostics (N=120)
   */
  async getDiagnostics(): Promise<RobotDiagnostics | null> {
    const result = await this.sendCommand({ N: 120, H: "diag" });
    
    if (!result.ok || !result.diagnostics || result.diagnostics.length < 2) {
      return null;
    }

    return this.parseDiagnostics(result.diagnostics);
  }

  /**
   * Direct motor control (N=999)
   */
  async directMotor(left: number, right: number): Promise<BridgeCommandResponse> {
    return this.sendCommand({
      N: 999,
      H: "motor",
      D1: Math.max(-255, Math.min(255, Math.round(left))),
      D2: Math.max(-255, Math.min(255, Math.round(right))),
    });
  }

  /**
   * Set servo angle (N=5)
   */
  async setServo(angle: number): Promise<BridgeCommandResponse> {
    return this.sendCommand({
      N: 5,
      H: "servo",
      D1: Math.max(0, Math.min(180, Math.round(angle))),
    });
  }

  /**
   * Get ultrasonic distance (N=21)
   */
  async getUltrasonic(mode: "distance" | "obstacle" = "distance"): Promise<number | boolean> {
    const result = await this.sendCommand({
      N: 21,
      H: "ultra",
      D1: mode === "distance" ? 2 : 1,
    });

    if (result.ok && result.token) {
      const match = result.token.match(/\{[\w]+_(\w+)\}/);
      if (match) {
        if (mode === "obstacle") {
          return match[1] === "true";
        }
        return parseInt(match[1], 10);
      }
    }

    return mode === "obstacle" ? false : 0;
  }

  /**
   * Get line sensor reading (N=22)
   */
  async getLineSensor(sensor: "left" | "middle" | "right"): Promise<number> {
    const sensorMap = { left: 0, middle: 1, right: 2 };
    const result = await this.sendCommand({
      N: 22,
      H: "line",
      D1: sensorMap[sensor],
    });

    if (result.ok && result.token) {
      const match = result.token.match(/\{[\w]+_(\d+)\}/);
      if (match) {
        return parseInt(match[1], 10);
      }
    }

    return 0;
  }

  /**
   * Get battery voltage (N=23)
   */
  async getBattery(): Promise<number> {
    const result = await this.sendCommand({ N: 23, H: "batt" });

    if (result.ok && result.token) {
      const match = result.token.match(/\{[\w]+_(\d+)\}/);
      if (match) {
        return parseInt(match[1], 10);
      }
    }

    return 0;
  }

  // ==========================================================================
  // Parsing Helpers
  // ==========================================================================

  /**
   * Parse diagnostics response
   */
  private parseDiagnostics(lines: string[]): RobotDiagnostics | null {
    try {
      if (lines.length < 2) return null;

      // Parse first line: {I100,-100,0,1,5}
      const line1Match = lines[0].match(/\{([IDX])(-?\d+),(-?\d+),(\d+),(\d+),(\d+)/);
      if (!line1Match) return null;

      // Parse second line: {stats:rx=...,jd=...,pe=...,tx=...,ms=...}
      const line2Match = lines[1].match(
        /\{stats:rx=(\d+),jd=(\d+),pe=(\d+)(?:,bc=(\d+))?,tx=(\d+),ms=(\d+)\}/
      );
      if (!line2Match) return null;

      return {
        owner: line1Match[1] as MotionOwner,
        motorLeft: parseInt(line1Match[2], 10),
        motorRight: parseInt(line1Match[3], 10),
        standby: line1Match[4] === "1",
        state: parseInt(line1Match[5], 10),
        resets: parseInt(line1Match[6], 10),
        stats: {
          rxBytes: parseInt(line2Match[1], 10),
          jsonDecodeErrors: parseInt(line2Match[2], 10),
          parseErrors: parseInt(line2Match[3], 10),
          badCommands: line2Match[4] ? parseInt(line2Match[4], 10) : 0,
          txBytes: parseInt(line2Match[5], 10),
          uptime: parseInt(line2Match[6], 10),
        },
      };
    } catch {
      return null;
    }
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

export const bridgeRobotClient = new BridgeRobotClient();

export { BridgeRobotClient };
