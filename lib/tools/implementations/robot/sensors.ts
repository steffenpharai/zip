/**
 * Robot Sensor Tools (READ tier)
 * 
 * Tools for reading robot sensors
 * Uses server-side client for API route compatibility
 */

import { z } from "zod";
import {
  checkBridgeHealth,
  getUltrasonic,
  getLineSensor,
  getBattery,
} from "@/lib/robot/server-client";

// ============================================================================
// get_robot_sensors - Get all sensor readings
// ============================================================================

export const getRobotSensorsSchema = z.object({
  sensors: z.array(z.enum(["ultrasonic", "line", "battery", "all"]))
    .optional()
    .default(["all"])
    .describe("Which sensors to read (default: all)"),
});

export const getRobotSensorsOutputSchema = z.object({
  success: z.boolean(),
  ultrasonic: z.object({
    distance: z.number().nullable().describe("Distance in cm (null if no echo)"),
    obstacle: z.boolean().describe("True if obstacle within 20cm"),
  }).nullable(),
  lineSensor: z.object({
    left: z.number().describe("Left sensor analog value (0-1023)"),
    middle: z.number().describe("Middle sensor analog value (0-1023)"),
    right: z.number().describe("Right sensor analog value (0-1023)"),
    lineDetected: z.object({
      left: z.boolean(),
      middle: z.boolean(),
      right: z.boolean(),
    }).describe("Which sensors detect a line (threshold ~500)"),
  }).nullable(),
  battery: z.object({
    voltage: z.number().describe("Battery voltage in mV"),
    percent: z.number().describe("Estimated battery percentage (0-100)"),
    status: z.enum(["full", "good", "low", "critical"]),
  }).nullable(),
  error: z.string().nullable(),
});

export async function getRobotSensors(
  input: z.infer<typeof getRobotSensorsSchema>
): Promise<z.infer<typeof getRobotSensorsOutputSchema>> {
  try {
    // Check bridge health first
    const health = await checkBridgeHealth();
    if (!health || !health.ready) {
      return {
        success: false,
        ultrasonic: null,
        lineSensor: null,
        battery: null,
        error: "Robot bridge not connected or not ready",
      };
    }

    const sensors = input.sensors ?? ["all"];
    const readAll = sensors.includes("all");

    // Build response
    let ultrasonic: z.infer<typeof getRobotSensorsOutputSchema>["ultrasonic"] = null;
    let lineSensor: z.infer<typeof getRobotSensorsOutputSchema>["lineSensor"] = null;
    let battery: z.infer<typeof getRobotSensorsOutputSchema>["battery"] = null;

    // Read ultrasonic
    if (readAll || sensors.includes("ultrasonic")) {
      const distance = await getUltrasonic("distance");
      if (distance !== null && typeof distance === "number") {
        ultrasonic = {
          distance: distance > 0 ? distance : null,
          obstacle: distance > 0 && distance <= 20,
        };
      } else {
        ultrasonic = { distance: null, obstacle: false };
      }
    }

    // Read line sensors
    if (readAll || sensors.includes("line")) {
      const [left, middle, right] = await Promise.all([
        getLineSensor(0),
        getLineSensor(1),
        getLineSensor(2),
      ]);

      const LINE_THRESHOLD = 500;
      lineSensor = {
        left: left ?? 0,
        middle: middle ?? 0,
        right: right ?? 0,
        lineDetected: {
          left: (left ?? 0) > LINE_THRESHOLD,
          middle: (middle ?? 0) > LINE_THRESHOLD,
          right: (right ?? 0) > LINE_THRESHOLD,
        },
      };
    }

    // Read battery
    if (readAll || sensors.includes("battery")) {
      const voltageMv = await getBattery();
      if (voltageMv !== null) {
        // 7.4V 2S LiPo: 6.0V (empty) to 8.4V (full)
        const percent = Math.max(0, Math.min(100, 
          ((voltageMv - 6000) / (8400 - 6000)) * 100
        ));
        
        let status: "full" | "good" | "low" | "critical";
        if (percent >= 80) status = "full";
        else if (percent >= 40) status = "good";
        else if (percent >= 20) status = "low";
        else status = "critical";

        battery = {
          voltage: voltageMv,
          percent: Math.round(percent),
          status,
        };
      }
    }

    return {
      success: true,
      ultrasonic,
      lineSensor,
      battery,
      error: null,
    };
  } catch (error) {
    return {
      success: false,
      ultrasonic: null,
      lineSensor: null,
      battery: null,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
