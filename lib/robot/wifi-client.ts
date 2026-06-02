/**
 * WiFi Robot Client
 * 
 * @deprecated This client has been replaced by bridge-client.ts
 * ESP32 support has been removed. Use bridge-client.ts for WebSocket bridge communication.
 * 
 * HTTP-based client for communicating with the ESP32 camera module.
 * All robot commands are sent via HTTP POST to the ESP32, which forwards
 * them to the Arduino UNO via Serial2.
 * 
 * This replaces the WebSocket-based USB bridge with direct HTTP communication.
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
 * Response from POST /api/robot/command
 */
export interface WiFiCommandResponse {
  ok: boolean;
  token?: string;
  diagnostics?: string[];
  error?: string;
  timingMs: number;
}

/**
 * Response from GET /api/robot/status
 */
export interface WiFiStatusResponse {
  connected: boolean;
  rxBytes: number;
  txBytes: number;
  commands: number;
  errors: number;
  uptime: number;
  lastResponseMs: number;
}

/**
 * WiFi client configuration
 */
export interface WiFiClientConfig {
  /** ESP32 base URL (default: http://192.168.4.1) */
  baseUrl: string;
  /** Request timeout in ms (default: 2000) */
  timeoutMs: number;
  /** Status polling interval in ms (default: 5000) */
  statusPollingMs: number;
}

/**
 * WiFi client state
 */
export interface WiFiClientState {
  connected: boolean;
  lastCommandTime: number | null;
  lastStatusTime: number | null;
  stats: WiFiStatusResponse | null;
  lastError: string | null;
}

// ============================================================================
// Default Configuration
// ============================================================================

export const DEFAULT_WIFI_CONFIG: WiFiClientConfig = {
  baseUrl: "http://192.168.4.1",
  timeoutMs: 2000,
  statusPollingMs: 5000,
};

// ============================================================================
// WiFi Robot Client
// ============================================================================

class WiFiRobotClient {
  private config: WiFiClientConfig;
  private state: WiFiClientState;
  private statusPollingTimer: ReturnType<typeof setInterval> | null = null;
  private listeners = new Set<(state: WiFiClientState) => void>();

  constructor(config: Partial<WiFiClientConfig> = {}) {
    this.config = { ...DEFAULT_WIFI_CONFIG, ...config };
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
  setConfig(config: Partial<WiFiClientConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   */
  getConfig(): WiFiClientConfig {
    return { ...this.config };
  }

  // ==========================================================================
  // State Management
  // ==========================================================================

  /**
   * Get current state
   */
  getState(): WiFiClientState {
    return { ...this.state };
  }

  /**
   * Subscribe to state changes
   */
  subscribe(listener: (state: WiFiClientState) => void): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  /**
   * Update state and notify listeners
   */
  private updateState(updates: Partial<WiFiClientState>): void {
    this.state = { ...this.state, ...updates };
    for (const listener of this.listeners) {
      listener(this.state);
    }
  }

  // ==========================================================================
  // Connection Management
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
   * Check if connected (based on last successful status check)
   */
  isConnected(): boolean {
    return this.state.connected;
  }

  // ==========================================================================
  // HTTP Communication
  // ==========================================================================

  /**
   * Make HTTP request with timeout
   */
  private async fetchWithTimeout(
    url: string,
    options: RequestInit = {},
    timeoutMs?: number
  ): Promise<Response> {
    const controller = new AbortController();
    const timeout = timeoutMs ?? this.config.timeoutMs;
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  /**
   * Check ESP32 status
   */
  async checkStatus(): Promise<WiFiStatusResponse | null> {
    try {
      const response = await this.fetchWithTimeout(
        `${this.config.baseUrl}/api/robot/status`,
        { method: "GET" }
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const status = (await response.json()) as WiFiStatusResponse;
      
      this.updateState({
        connected: true,
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
  // Robot Commands
  // ==========================================================================

  /**
   * Send a command to the robot
   */
  async sendCommand(command: FirmwareCommand): Promise<WiFiCommandResponse> {
    try {
      const response = await this.fetchWithTimeout(
        `${this.config.baseUrl}/api/robot/command`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(command),
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const result = (await response.json()) as WiFiCommandResponse;
      
      this.updateState({
        connected: true,
        lastCommandTime: Date.now(),
        lastError: result.ok ? null : result.error ?? "Command failed",
      });

      return result;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Request failed";
      this.updateState({
        connected: false,
        lastError: errorMsg,
      });

      return {
        ok: false,
        error: errorMsg,
        timingMs: 0,
      };
    }
  }

  /**
   * Emergency stop
   */
  async stop(): Promise<WiFiCommandResponse> {
    try {
      const response = await this.fetchWithTimeout(
        `${this.config.baseUrl}/api/robot/stop`,
        { method: "POST" },
        1000 // Shorter timeout for emergency stop
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const result = (await response.json()) as WiFiCommandResponse;
      
      this.updateState({
        connected: true,
        lastCommandTime: Date.now(),
        lastError: null,
      });

      return result;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Stop failed";
      this.updateState({
        lastError: errorMsg,
      });

      return {
        ok: false,
        error: errorMsg,
        timingMs: 0,
      };
    }
  }

  // ==========================================================================
  // High-Level Commands
  // ==========================================================================

  /**
   * Send hello/ping command (N=0)
   */
  async hello(): Promise<WiFiCommandResponse> {
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
  async directMotor(left: number, right: number): Promise<WiFiCommandResponse> {
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
  async setServo(angle: number): Promise<WiFiCommandResponse> {
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

export const wifiRobotClient = new WiFiRobotClient();

export { WiFiRobotClient };

