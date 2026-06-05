/**
 * Robot Status Tools (READ tier)
 * 
 * Tools for querying robot status and diagnostics
 * Uses server-side HTTP/WebSocket client for API route compatibility
 */

import { z } from "zod";
import {
  checkBridgeHealth,
  getDiagnostics as fetchDiagnostics,
} from "@/lib/robot/server-client";
import type { RobotHealthResponse, RobotDiagnostics } from "@/lib/robot/types";

// ============================================================================
// get_robot_status - Get robot connection and status
// ============================================================================

export const getRobotStatusSchema = z.object({});

export const getRobotStatusOutputSchema = z.object({
  connected: z.boolean(),
  ready: z.boolean(),
  connection: z.enum(["disconnected", "connecting", "connected", "handshaking", "ready", "error"]),
  port: z.string().nullable(),
  baud: z.number(),
  streaming: z.boolean(),
  streamRateHz: z.number(),
  rxBytes: z.number(),
  txBytes: z.number(),
  pendingCommands: z.number(),
  uptimeMs: z.number().nullable(),
  lastError: z.string().nullable(),
});

export async function getRobotStatus(
  _input: z.infer<typeof getRobotStatusSchema>
): Promise<z.infer<typeof getRobotStatusOutputSchema>> {
  let health: RobotHealthResponse | null = null;
  
  try {
    health = await checkBridgeHealth();
  } catch (error) {
    // Health check failed
    console.error("[getRobotStatus] Health check failed:", error);
  }

  if (health) {
    return {
      connected: health.serialOpen,
      ready: health.ready,
      connection: health.ready ? "ready" : health.serialOpen ? "connected" : "disconnected",
      port: health.port,
      baud: health.baud,
      streaming: health.streaming,
      streamRateHz: health.streaming ? 10 : 0,
      rxBytes: health.rxBytes,
      txBytes: health.txBytes,
      pendingCommands: health.pendingQueueDepth,
      uptimeMs: health.uptime,
      lastError: null,
    };
  }

  // Bridge not reachable
  return {
    connected: false,
    ready: false,
    connection: "disconnected",
    port: null,
    baud: 115200,
    streaming: false,
    streamRateHz: 0,
    rxBytes: 0,
    txBytes: 0,
    pendingCommands: 0,
    uptimeMs: null,
    lastError: "Bridge not reachable",
  };
}

// ============================================================================
// get_robot_diagnostics - Get firmware debug state dump
// ============================================================================

export const getRobotDiagnosticsSchema = z.object({});

export const getRobotDiagnosticsOutputSchema = z.object({
  success: z.boolean(),
  owner: z.enum(["Idle", "Direct", "Stopped"]).nullable(),
  motorLeft: z.number().nullable(),
  motorRight: z.number().nullable(),
  standby: z.boolean().nullable(),
  motionState: z.number().nullable(),
  resets: z.number().nullable(),
  stats: z.object({
    rxBytes: z.number(),
    txBytes: z.number(),
    jsonDecodeErrors: z.number(),
    parseErrors: z.number(),
    badCommands: z.number(),
    uptimeMs: z.number(),
  }).nullable(),
  error: z.string().nullable(),
});

export async function getRobotDiagnostics(
  _input: z.infer<typeof getRobotDiagnosticsSchema>
): Promise<z.infer<typeof getRobotDiagnosticsOutputSchema>> {
  try {
    // First check if bridge is available
    const health = await checkBridgeHealth();
    if (!health || !health.ready) {
      return {
        success: false,
        owner: null,
        motorLeft: null,
        motorRight: null,
        standby: null,
        motionState: null,
        resets: null,
        stats: null,
        error: "Robot bridge not connected or not ready",
      };
    }

    const diagnostics: RobotDiagnostics | null = await fetchDiagnostics();

    if (!diagnostics) {
      return {
        success: false,
        owner: null,
        motorLeft: null,
        motorRight: null,
        standby: null,
        motionState: null,
        resets: null,
        stats: null,
        error: "Failed to get diagnostics from firmware",
      };
    }

    const ownerLabels: Record<string, "Idle" | "Direct" | "Stopped"> = {
      I: "Idle",
      D: "Direct",
      X: "Stopped",
    };

    return {
      success: true,
      owner: ownerLabels[diagnostics.owner] ?? "Idle",
      motorLeft: diagnostics.motorLeft,
      motorRight: diagnostics.motorRight,
      standby: diagnostics.standby,
      motionState: diagnostics.state,
      resets: diagnostics.resets,
      stats: {
        rxBytes: diagnostics.stats.rxBytes,
        txBytes: diagnostics.stats.txBytes,
        jsonDecodeErrors: diagnostics.stats.jsonDecodeErrors,
        parseErrors: diagnostics.stats.parseErrors,
        badCommands: diagnostics.stats.badCommands,
        uptimeMs: diagnostics.stats.uptime,
      },
      error: null,
    };
  } catch (error) {
    return {
      success: false,
      owner: null,
      motorLeft: null,
      motorRight: null,
      standby: null,
      motionState: null,
      resets: null,
      stats: null,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
