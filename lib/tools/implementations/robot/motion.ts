/**
 * Robot Motion Tools (ACT tier)
 * 
 * Tools for controlling robot movement. These require user confirmation
 * before execution as they cause physical movement.
 * Uses server-side client for API route compatibility.
 */

import { z } from "zod";
import {
  checkBridgeHealth,
  sendStopCommand,
  sendDirectMotor,
  emergencyStop,
  startStreaming as bridgeStartStreaming,
  stopStreaming as bridgeStopStreaming,
} from "@/lib/robot/server-client";

// ============================================================================
// robot_move - Move with velocity and turn rate
// ============================================================================

export const robotMoveSchema = z.object({
  velocity: z.number().min(-255).max(255).describe("Forward velocity (-255 to 255, negative = backward)"),
  turnRate: z.number().min(-255).max(255).describe("Turn rate (-255 to 255, positive = turn right)"),
  durationMs: z.number().min(0).max(5000).optional().describe("Duration in ms (0-5000, optional - if not set, robot keeps moving until stopped)"),
});

export const robotMoveOutputSchema = z.object({
  success: z.boolean(),
  motorLeft: z.number().nullable(),
  motorRight: z.number().nullable(),
  message: z.string(),
  error: z.string().nullable(),
});

export async function robotMove(
  input: z.infer<typeof robotMoveSchema>
): Promise<z.infer<typeof robotMoveOutputSchema>> {
  try {
    // Check bridge health first
    const health = await checkBridgeHealth();
    if (!health || !health.ready) {
      return {
        success: false,
        motorLeft: null,
        motorRight: null,
        message: "Robot not connected",
        error: "Robot bridge not connected or not ready",
      };
    }

    // Convert v (velocity) and w (turnRate) to differential drive
    const { velocity: v, turnRate: w, durationMs } = input;
    const left = Math.max(-255, Math.min(255, Math.round(v + w)));
    const right = Math.max(-255, Math.min(255, Math.round(v - w)));

    const success = await sendDirectMotor(left, right);

    if (!success) {
      return {
        success: false,
        motorLeft: null,
        motorRight: null,
        message: "Failed to send motor command",
        error: "Motor command failed",
      };
    }

    // If duration specified, schedule stop
    if (durationMs && durationMs > 0) {
      setTimeout(async () => {
        try {
          await sendStopCommand();
        } catch {
          // Ignore stop errors
        }
      }, durationMs);
    }

    const direction = v > 0 ? "forward" : v < 0 ? "backward" : "stationary";
    const turning = w > 0 ? "turning right" : w < 0 ? "turning left" : "";
    const durationText = durationMs ? ` for ${durationMs}ms` : "";

    return {
      success: true,
      motorLeft: left,
      motorRight: right,
      message: `Robot moving ${direction}${turning ? `, ${turning}` : ""}${durationText}`,
      error: null,
    };
  } catch (error) {
    return {
      success: false,
      motorLeft: null,
      motorRight: null,
      message: "Failed to move robot",
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// ============================================================================
// robot_stop - Emergency stop
// ============================================================================

export const robotStopSchema = z.object({});

export const robotStopOutputSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  error: z.string().nullable(),
});

export async function robotStop(
  _input: z.infer<typeof robotStopSchema>
): Promise<z.infer<typeof robotStopOutputSchema>> {
  try {
    // Try WebSocket stop first
    const wsSuccess = await sendStopCommand();
    if (wsSuccess) {
      return {
        success: true,
        message: "Robot stopped successfully",
        error: null,
      };
    }

    // Fall back to HTTP emergency stop
    const httpSuccess = await emergencyStop();
    if (httpSuccess) {
      return {
        success: true,
        message: "Robot stopped via emergency HTTP endpoint",
        error: null,
      };
    }

    return {
      success: false,
      message: "Failed to stop robot",
      error: "Neither WebSocket nor HTTP stop succeeded",
    };
  } catch (error) {
    // Try HTTP as last resort
    try {
      const httpSuccess = await emergencyStop();
      if (httpSuccess) {
        return {
          success: true,
          message: "Robot stopped via emergency HTTP endpoint",
          error: null,
        };
      }
    } catch {
      // HTTP also failed
    }

    return {
      success: false,
      message: "Failed to stop robot",
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// ============================================================================
// robot_stream_start - Start continuous motion streaming
// ============================================================================

export const robotStreamStartSchema = z.object({
  velocity: z.number().min(-255).max(255).describe("Initial forward velocity (-255 to 255)"),
  turnRate: z.number().min(-255).max(255).describe("Initial turn rate (-255 to 255)"),
  rateHz: z.number().min(1).max(20).optional().default(10).describe("Stream rate in Hz (1-20, default 10)"),
  ttlMs: z.number().min(150).max(300).optional().default(200).describe("Time-to-live in ms (150-300, default 200)"),
});

export const robotStreamStartOutputSchema = z.object({
  success: z.boolean(),
  streaming: z.boolean(),
  rateHz: z.number(),
  message: z.string(),
  error: z.string().nullable(),
});

export async function robotStreamStart(
  input: z.infer<typeof robotStreamStartSchema>
): Promise<z.infer<typeof robotStreamStartOutputSchema>> {
  try {
    // Check bridge health first
    const health = await checkBridgeHealth();
    if (!health || !health.ready) {
      return {
        success: false,
        streaming: false,
        rateHz: 0,
        message: "Robot not connected",
        error: "Robot bridge not connected or not ready",
      };
    }

    const { velocity: v, turnRate: w, rateHz, ttlMs } = input;

    const success = await bridgeStartStreaming(v, w, rateHz ?? 10, ttlMs ?? 200);

    if (!success) {
      return {
        success: false,
        streaming: false,
        rateHz: 0,
        message: "Failed to start streaming",
        error: "Stream start command failed",
      };
    }

    return {
      success: true,
      streaming: true,
      rateHz: rateHz ?? 10,
      message: `Started streaming motion at ${rateHz ?? 10}Hz with TTL ${ttlMs ?? 200}ms`,
      error: null,
    };
  } catch (error) {
    return {
      success: false,
      streaming: false,
      rateHz: 0,
      message: "Failed to start streaming",
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// ============================================================================
// robot_stream_stop - Stop motion streaming
// ============================================================================

export const robotStreamStopSchema = z.object({
  hardStop: z.boolean().optional().default(true).describe("Send immediate stop command (N=201) after stopping stream"),
});

export const robotStreamStopOutputSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  error: z.string().nullable(),
});

export async function robotStreamStop(
  input: z.infer<typeof robotStreamStopSchema>
): Promise<z.infer<typeof robotStreamStopOutputSchema>> {
  try {
    // Check bridge health first
    const health = await checkBridgeHealth();
    if (!health || !health.ready) {
      return {
        success: false,
        message: "Robot not connected",
        error: "Robot bridge not connected or not ready",
      };
    }

    const success = await bridgeStopStreaming(input.hardStop);

    if (!success) {
      return {
        success: false,
        message: "Failed to stop streaming",
        error: "Stream stop command failed",
      };
    }

    return {
      success: true,
      message: input.hardStop 
        ? "Stopped streaming and sent hard stop" 
        : "Stopped streaming (robot will coast to stop)",
      error: null,
    };
  } catch (error) {
    return {
      success: false,
      message: "Failed to stop streaming",
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
