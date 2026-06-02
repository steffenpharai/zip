/**
 * Robot Client
 * 
 * Unified interface for robot control via WebSocket bridge.
 * Communicates with the bridge via WebSocket, which forwards commands to UNO via serial port.
 */

import { eventBus } from "@/lib/events/bus";
import {
  bridgeRobotClient,
  type BridgeCommandResponse,
  type BridgeStatusResponse,
} from "./bridge-client";
import type {
  RobotDiagnostics,
  RobotState,
  RobotConnectionState,
  RobotSensors,
  RobotStatusResponse,
} from "./types";
import {
  DEFAULT_ROBOT_CONFIG,
  INITIAL_ROBOT_STATE,
  ROBOT_COMMANDS,
} from "./types";

// ============================================================================
// Singleton Client Instance
// ============================================================================

class RobotClient {
  private state: RobotState = { ...INITIAL_ROBOT_STATE };
  private listeners = new Set<(state: RobotState) => void>();
  private config = DEFAULT_ROBOT_CONFIG;
  private pollingStarted = false;
  private diagnosticsTimer: ReturnType<typeof setInterval> | null = null;
  
  // Streaming state
  private streamingTimer: ReturnType<typeof setInterval> | null = null;
  private streamingSetpoint = { v: 0, w: 0 };
  private isStreaming = false;

  constructor() {
    // Subscribe to bridge client state changes
    bridgeRobotClient.subscribe((bridgeState) => {
      const connection: RobotConnectionState = bridgeState.connected 
        ? "connected" 
        : bridgeState.lastError 
          ? "error" 
          : "disconnected";
      
      // Convert bridge status to robot status response format
      const robotStatus: RobotStatusResponse | null = bridgeState.stats ? {
        connected: bridgeState.stats.ready && bridgeState.stats.serialOpen,
        rxBytes: bridgeState.stats.rxBytes,
        txBytes: bridgeState.stats.txBytes,
        commands: 0, // Not available from bridge status
        errors: 0, // Not available from bridge status
        uptime: bridgeState.stats.uptime,
        lastResponseMs: bridgeState.lastCommandTime 
          ? Date.now() - bridgeState.lastCommandTime 
          : -1,
      } : null;
      
      this.updateState({
        connection,
        bridgeStatus: robotStatus,
        lastError: bridgeState.lastError,
      });
    });
  }

  // ==========================================================================
  // Connection Management
  // ==========================================================================

  /**
   * Start connection monitoring (status polling)
   */
  connect(): void {
    if (this.pollingStarted) {
      return;
    }
    
    this.pollingStarted = true;
    bridgeRobotClient.connect();
    bridgeRobotClient.startPolling();
    
    // Start diagnostics polling if configured
    if (this.config.diagnosticsPollingMs > 0) {
      this.startDiagnosticsPolling();
    }
  }

  /**
   * Stop connection monitoring
   */
  disconnect(): void {
    this.pollingStarted = false;
    bridgeRobotClient.stopPolling();
    bridgeRobotClient.disconnect();
    this.stopDiagnosticsPolling();
    this.stopStreaming();
    this.updateState({ connection: "disconnected" });
  }

  /**
   * Check if connected and ready
   */
  isReady(): boolean {
    return this.state.connection === "connected";
  }

  // ==========================================================================
  // State Management
  // ==========================================================================

  /**
   * Update state and notify listeners
   */
  private updateState(updates: Partial<RobotState>): void {
    this.state = {
      ...this.state,
      ...updates,
      lastUpdated: Date.now(),
    };

    // Notify all listeners
    for (const listener of this.listeners) {
      listener(this.state);
    }

    // Emit panel update event
    eventBus.emit({
      type: "panel.update",
      panel: "robot",
      payload: {
        connection: this.state.connection,
        bridgeStatus: this.state.bridgeStatus,
        diagnostics: this.state.diagnostics,
        sensors: this.state.sensors,
      },
      ts: Date.now(),
    });
  }

  /**
   * Get current state
   */
  getState(): RobotState {
    return this.state;
  }

  /**
   * Subscribe to state changes
   */
  subscribe(listener: (state: RobotState) => void): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  // ==========================================================================
  // Diagnostics Polling
  // ==========================================================================

  private startDiagnosticsPolling(): void {
    if (this.diagnosticsTimer) {
      return;
    }

    this.diagnosticsTimer = setInterval(async () => {
      if (this.state.connection === "connected") {
        await this.getDiagnostics();
      }
    }, this.config.diagnosticsPollingMs);
  }

  private stopDiagnosticsPolling(): void {
    if (this.diagnosticsTimer) {
      clearInterval(this.diagnosticsTimer);
      this.diagnosticsTimer = null;
    }
  }

  // ==========================================================================
  // High-Level Commands
  // ==========================================================================

  /**
   * Send hello/ping command
   */
  async hello(): Promise<BridgeCommandResponse> {
    return bridgeRobotClient.hello();
  }

  /**
   * Get diagnostics (N=120)
   */
  async getDiagnostics(): Promise<RobotDiagnostics | null> {
    const diagnostics = await bridgeRobotClient.getDiagnostics();
    if (diagnostics) {
      this.updateState({ diagnostics });
    }
    return diagnostics;
  }

  /**
   * Emergency stop (N=201)
   */
  async stop(): Promise<BridgeCommandResponse> {
    // Stop streaming first
    if (this.isStreaming) {
      this.stopStreaming();
    }
    return bridgeRobotClient.stop();
  }

  /**
   * Direct motor control (N=999)
   */
  async directMotor(left: number, right: number): Promise<BridgeCommandResponse> {
    return bridgeRobotClient.directMotor(left, right);
  }

  /**
   * Set servo angle (N=5)
   */
  async setServo(angle: number): Promise<BridgeCommandResponse> {
    return bridgeRobotClient.setServo(angle);
  }

  /**
   * Get ultrasonic distance (N=21)
   */
  async getUltrasonic(mode: "distance" | "obstacle" = "distance"): Promise<number | boolean> {
    return bridgeRobotClient.getUltrasonic(mode);
  }

  /**
   * Get line sensor reading (N=22)
   */
  async getLineSensor(sensor: "left" | "middle" | "right"): Promise<number> {
    return bridgeRobotClient.getLineSensor(sensor);
  }

  /**
   * Get battery voltage (N=23)
   */
  async getBattery(): Promise<number> {
    return bridgeRobotClient.getBattery();
  }

  // ==========================================================================
  // Streaming Control (HTTP-based)
  // ==========================================================================

  /**
   * Start motion streaming
   * Sends periodic motor commands at the specified rate
   */
  startStreaming(
    v: number,
    w: number,
    options: { rateHz?: number; ttlMs?: number } = {}
  ): void {
    const rateHz = options.rateHz ?? this.config.defaultStreamRateHz;
    const intervalMs = Math.floor(1000 / rateHz);

    this.streamingSetpoint = { v, w };
    this.isStreaming = true;

    // Stop any existing streaming
    if (this.streamingTimer) {
      clearInterval(this.streamingTimer);
    }

    // Start periodic command sending
    this.streamingTimer = setInterval(async () => {
      if (!this.isStreaming) {
        return;
      }

      // Convert v (velocity) and w (turn rate) to left/right motor values
      const left = Math.max(-255, Math.min(255, this.streamingSetpoint.v + this.streamingSetpoint.w));
      const right = Math.max(-255, Math.min(255, this.streamingSetpoint.v - this.streamingSetpoint.w));

      try {
        await bridgeRobotClient.directMotor(left, right);
      } catch {
        // Ignore errors during streaming - next iteration will try again
      }
    }, intervalMs);
  }

  /**
   * Update streaming setpoint
   */
  updateStreaming(v: number, w: number): void {
    this.streamingSetpoint = { v, w };
  }

  /**
   * Stop streaming
   */
  stopStreaming(hardStop = true): void {
    this.isStreaming = false;

    if (this.streamingTimer) {
      clearInterval(this.streamingTimer);
      this.streamingTimer = null;
    }

    if (hardStop) {
      bridgeRobotClient.stop().catch(() => {
        // Ignore stop errors
      });
    }
  }

  /**
   * Check if streaming is active
   */
  getStreamingState(): boolean {
    return this.isStreaming;
  }

  // ==========================================================================
  // Health Check
  // ==========================================================================

  /**
   * Check bridge status
   */
  async checkHealth(): Promise<BridgeStatusResponse | null> {
    return bridgeRobotClient.checkStatus();
  }

  /**
   * Get all sensor readings
   */
  async getSensors(): Promise<RobotSensors> {
    const now = Date.now();

    // Fetch all sensors in parallel
    const [distance, left, middle, right, battery] = await Promise.all([
      bridgeRobotClient.getUltrasonic("distance").catch(() => 0),
      bridgeRobotClient.getLineSensor("left").catch(() => 0),
      bridgeRobotClient.getLineSensor("middle").catch(() => 0),
      bridgeRobotClient.getLineSensor("right").catch(() => 0),
      bridgeRobotClient.getBattery().catch(() => 0),
    ]);

    // Calculate battery percentage (7.4V 2S LiPo: 6.0V=0%, 8.4V=100%)
    const batteryVoltage = battery as number;
    const batteryPercent = Math.max(0, Math.min(100,
      ((batteryVoltage - 6000) / (8400 - 6000)) * 100
    ));

    const sensors: RobotSensors = {
      ultrasonic: {
        distance: distance as number,
        obstacle: (distance as number) > 0 && (distance as number) <= 20,
        timestamp: now,
      },
      lineSensor: {
        left: left as number,
        middle: middle as number,
        right: right as number,
        timestamp: now,
      },
      battery: {
        voltage: batteryVoltage,
        percent: batteryPercent,
        timestamp: now,
      },
    };

    this.updateState({ sensors });
    return sensors;
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

export const robotClient = new RobotClient();

// Re-export types for convenience
export type {
  RobotState,
  RobotDiagnostics,
  RobotConnectionState,
  RobotSensors,
  RobotStatusResponse,
};
