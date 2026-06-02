"use client";

/**
 * useRobot - React hook for robot state management
 * 
 * Provides real-time robot state, connection management, and command functions
 * for use in both the compact HUD panel and full diagnostics page.
 * 
 * Communication is via WebSocket to bridge, which forwards to UNO via serial port.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { robotClient, type RobotState } from "@/lib/robot/client";
import type {
  RobotDiagnostics,
  RobotSensors,
  RobotConnectionState,
  RobotStatusResponse,
} from "@/lib/robot/types";
import type { BridgeStatusResponse } from "@/lib/robot/bridge-client";

export interface UseRobotOptions {
  /**
   * Automatically connect on mount
   * @default true
   */
  autoConnect?: boolean;
  /**
   * Poll for sensor data at this interval (ms). Set to 0 to disable.
   * @default 0
   */
  sensorPollingMs?: number;
  /**
   * Poll for diagnostics at this interval (ms). Set to 0 to disable.
   * @default 0
   */
  diagnosticsPollingMs?: number;
}

export interface UseRobotReturn {
  // State
  state: RobotState;
  connection: RobotConnectionState;
  isReady: boolean;
  isStreaming: boolean;
  
  // Connection
  connect: () => void;
  disconnect: () => void;
  checkHealth: () => Promise<BridgeStatusResponse | null>;
  
  // Commands
  stop: () => Promise<void>;
  move: (v: number, w: number) => Promise<void>;
  directMotor: (left: number, right: number) => Promise<void>;
  setServo: (angle: number) => Promise<void>;
  
  // Streaming
  startStreaming: (v: number, w: number, options?: { rateHz?: number; ttlMs?: number }) => void;
  updateStreaming: (v: number, w: number) => void;
  stopStreaming: (hardStop?: boolean) => void;
  
  // Data
  getDiagnostics: () => Promise<RobotDiagnostics | null>;
  getSensors: () => Promise<RobotSensors>;
}

export function useRobot(options: UseRobotOptions = {}): UseRobotReturn {
  const { 
    autoConnect = true, 
    sensorPollingMs = 0,
    diagnosticsPollingMs = 0,
  } = options;
  
  const [state, setState] = useState<RobotState>(robotClient.getState());
  const [isStreaming, setIsStreaming] = useState(false);
  const sensorPollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const diagnosticsPollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Subscribe to state changes
  useEffect(() => {
    const unsubscribe = robotClient.subscribe((newState) => {
      setState(newState);
    });
    
    return unsubscribe;
  }, []);

  // Auto-connect on mount
  useEffect(() => {
    if (autoConnect) {
      robotClient.connect();
    }
    
    return () => {
      // Don't disconnect on unmount - other components may be using it
    };
  }, [autoConnect]);

  // Sensor polling
  useEffect(() => {
    if (sensorPollingMs > 0 && state.connection === "connected") {
      sensorPollingRef.current = setInterval(async () => {
        try {
          await getSensors();
        } catch (error) {
          console.error("[useRobot] Sensor polling error:", error);
        }
      }, sensorPollingMs);
    }
    
    return () => {
      if (sensorPollingRef.current) {
        clearInterval(sensorPollingRef.current);
        sensorPollingRef.current = null;
      }
    };
  }, [sensorPollingMs, state.connection]);

  // Diagnostics polling
  useEffect(() => {
    if (diagnosticsPollingMs > 0 && state.connection === "connected") {
      diagnosticsPollingRef.current = setInterval(async () => {
        try {
          await robotClient.getDiagnostics();
        } catch (error) {
          console.error("[useRobot] Diagnostics polling error:", error);
        }
      }, diagnosticsPollingMs);
    }
    
    return () => {
      if (diagnosticsPollingRef.current) {
        clearInterval(diagnosticsPollingRef.current);
        diagnosticsPollingRef.current = null;
      }
    };
  }, [diagnosticsPollingMs, state.connection]);

  // Connection functions
  const connect = useCallback(() => {
    robotClient.connect();
  }, []);

  const disconnect = useCallback(() => {
    robotClient.disconnect();
  }, []);

  const checkHealth = useCallback(async (): Promise<BridgeStatusResponse | null> => {
    return robotClient.checkHealth();
  }, []);

  // Command functions
  const stop = useCallback(async (): Promise<void> => {
    setIsStreaming(false);
    await robotClient.stop();
  }, []);

  const move = useCallback(async (v: number, w: number): Promise<void> => {
    // Convert v (forward velocity) and w (turn rate) to L/R motor values
    const left = Math.max(-255, Math.min(255, Math.round(v + w)));
    const right = Math.max(-255, Math.min(255, Math.round(v - w)));
    await robotClient.directMotor(left, right);
  }, []);

  const directMotor = useCallback(async (left: number, right: number): Promise<void> => {
    await robotClient.directMotor(left, right);
  }, []);

  const setServo = useCallback(async (angle: number): Promise<void> => {
    await robotClient.setServo(angle);
  }, []);

  // Streaming functions
  const startStreaming = useCallback((
    v: number, 
    w: number, 
    streamOptions?: { rateHz?: number; ttlMs?: number }
  ): void => {
    setIsStreaming(true);
    robotClient.startStreaming(v, w, streamOptions);
  }, []);

  const updateStreaming = useCallback((v: number, w: number): void => {
    robotClient.updateStreaming(v, w);
  }, []);

  const stopStreaming = useCallback((hardStop = true): void => {
    setIsStreaming(false);
    robotClient.stopStreaming(hardStop);
  }, []);

  // Data functions
  const getDiagnostics = useCallback(async (): Promise<RobotDiagnostics | null> => {
    return robotClient.getDiagnostics();
  }, []);

  const getSensors = useCallback(async (): Promise<RobotSensors> => {
    return robotClient.getSensors();
  }, []);

  return {
    // State
    state,
    connection: state.connection,
    isReady: state.connection === "connected",
    isStreaming,
    
    // Connection
    connect,
    disconnect,
    checkHealth,
    
    // Commands
    stop,
    move,
    directMotor,
    setServo,
    
    // Streaming
    startStreaming,
    updateStreaming,
    stopStreaming,
    
    // Data
    getDiagnostics,
    getSensors,
  };
}

export default useRobot;
