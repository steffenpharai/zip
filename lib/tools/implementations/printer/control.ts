/**
 * 3D Printer control tools (ACT tier)
 * 
 * Tools for controlling printer operations (start/pause/resume/cancel prints,
 * temperature control, movement commands)
 * All operations require user confirmation
 */

import { z } from "zod";
import { moonrakerRequest, moonrakerRequestWithRetry, getLongOperationTimeout } from "./client";

// Start print
export const startPrintSchema = z.object({
  filename: z.string().min(1).describe("G-code filename to print (must exist on printer)"),
});

export const startPrintOutputSchema = z.object({
  success: z.boolean(),
  filename: z.string(),
  message: z.string(),
});

export async function startPrint(
  input: z.infer<typeof startPrintSchema>
): Promise<z.infer<typeof startPrintOutputSchema>> {
  try {
    // Validate file exists first
    const files = await moonrakerRequest<Array<{ path: string }>>("/server/files/list?root=gcodes");
    const fileExists = files.some(file => file.path === input.filename);
    
    if (!fileExists) {
      throw new Error(`File not found on printer: ${input.filename}`);
    }
    
    // Check if printer is already printing
    const status = await moonrakerRequest<{
      status: {
        print_stats?: {
          state?: string;
        };
      };
    }>("/printer/objects/query?print_stats");
    
    const printState = status.status?.print_stats?.state;
    if (printState === "printing" || printState === "paused") {
      throw new Error(`Printer is already ${printState}. Please cancel the current print first.`);
    }
    
    await moonrakerRequest("/printer/print/start", "POST", {
      filename: input.filename,
    });
    
    return {
      success: true,
      filename: input.filename,
      message: `Print started: ${input.filename}`,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to start print: ${errorMessage}`);
  }
}

// Pause print
export const pausePrintSchema = z.object({});

export const pausePrintOutputSchema = z.object({
  success: z.boolean(),
  message: z.string(),
});

export async function pausePrint(
  input: z.infer<typeof pausePrintSchema>
): Promise<z.infer<typeof pausePrintOutputSchema>> {
  try {
    // Check if printer is actually printing
    const status = await moonrakerRequest<{
      status: {
        print_stats?: {
          state?: string;
        };
      };
    }>("/printer/objects/query?print_stats");
    
    const printState = status.status?.print_stats?.state;
    if (printState !== "printing") {
      throw new Error(`Cannot pause: printer is not currently printing (state: ${printState || "idle"})`);
    }
    
    await moonrakerRequest("/printer/print/pause", "POST");
    
    return {
      success: true,
      message: "Print paused",
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to pause print: ${errorMessage}`);
  }
}

// Resume print
export const resumePrintSchema = z.object({});

export const resumePrintOutputSchema = z.object({
  success: z.boolean(),
  message: z.string(),
});

export async function resumePrint(
  input: z.infer<typeof resumePrintSchema>
): Promise<z.infer<typeof resumePrintOutputSchema>> {
  try {
    // Check if printer is paused
    const status = await moonrakerRequest<{
      status: {
        print_stats?: {
          state?: string;
        };
      };
    }>("/printer/objects/query?print_stats");
    
    const printState = status.status?.print_stats?.state;
    if (printState !== "paused") {
      throw new Error(`Cannot resume: printer is not paused (state: ${printState || "idle"})`);
    }
    
    await moonrakerRequest("/printer/print/resume", "POST");
    
    return {
      success: true,
      message: "Print resumed",
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to resume print: ${errorMessage}`);
  }
}

// Cancel print
export const cancelPrintSchema = z.object({});

export const cancelPrintOutputSchema = z.object({
  success: z.boolean(),
  message: z.string(),
});

export async function cancelPrint(
  input: z.infer<typeof cancelPrintSchema>
): Promise<z.infer<typeof cancelPrintOutputSchema>> {
  try {
    // Check if printer is printing or paused
    const status = await moonrakerRequest<{
      status: {
        print_stats?: {
          state?: string;
        };
      };
    }>("/printer/objects/query?print_stats");
    
    const printState = status.status?.print_stats?.state;
    if (printState !== "printing" && printState !== "paused") {
      throw new Error(`Cannot cancel: no active print job (state: ${printState || "idle"})`);
    }
    
    await moonrakerRequest("/printer/print/cancel", "POST");
    
    return {
      success: true,
      message: "Print cancelled",
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to cancel print: ${errorMessage}`);
  }
}

// Set temperature
export const setTemperatureSchema = z.object({
  heater: z.enum(["extruder", "heater_bed"]).describe("Heater to control: 'extruder' for hotend or 'heater_bed' for bed"),
  target: z.number().min(0).max(300).describe("Target temperature in Celsius (0-300 for extruder, 0-120 for bed)"),
});

export const setTemperatureOutputSchema = z.object({
  success: z.boolean(),
  heater: z.string(),
  target: z.number(),
  message: z.string(),
});

export async function setTemperature(
  input: z.infer<typeof setTemperatureSchema>
): Promise<z.infer<typeof setTemperatureOutputSchema>> {
  try {
    // Validate temperature ranges
    if (input.heater === "heater_bed" && input.target > 120) {
      throw new Error("Bed temperature cannot exceed 120°C");
    }
    if (input.heater === "extruder" && input.target > 300) {
      throw new Error("Extruder temperature cannot exceed 300°C");
    }
    
    // Use G-code command to set temperature
    const gcode = input.heater === "extruder" 
      ? `M104 S${input.target}` 
      : `M140 S${input.target}`;
    
    await moonrakerRequest("/printer/gcode/script", "POST", {
      script: gcode,
    });
    
    return {
      success: true,
      heater: input.heater,
      target: input.target,
      message: `Set ${input.heater} temperature to ${input.target}°C`,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to set temperature: ${errorMessage}`);
  }
}

// Home axes
export const homeAxesSchema = z.object({
  axes: z.array(z.enum(["X", "Y", "Z", "E"])).optional().describe("Axes to home (default: all axes)"),
});

export const homeAxesOutputSchema = z.object({
  success: z.boolean(),
  axes: z.array(z.string()),
  message: z.string(),
});

export async function homeAxes(
  input: z.infer<typeof homeAxesSchema>
): Promise<z.infer<typeof homeAxesOutputSchema>> {
  try {
    const axes = input.axes && input.axes.length > 0 ? input.axes : ["X", "Y", "Z"];
    
    // Build G28 command (home command)
    const axesStr = axes.join("");
    const gcode = `G28 ${axesStr}`;
    
    await moonrakerRequest("/printer/gcode/script", "POST", {
      script: gcode,
    });
    
    return {
      success: true,
      axes,
      message: `Homed axes: ${axes.join(", ")}`,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to home axes: ${errorMessage}`);
  }
}

// Move axis
export const moveAxisSchema = z.object({
  axis: z.enum(["X", "Y", "Z", "E"]).describe("Axis to move (X, Y, Z, or E for extruder)"),
  distance: z.number().describe("Distance to move in mm (positive or negative)"),
  speed: z.number().positive().max(1000).optional().describe("Movement speed in mm/s (default: 100)"),
});

export const moveAxisOutputSchema = z.object({
  success: z.boolean(),
  axis: z.string(),
  distance: z.number(),
  message: z.string(),
});

export async function moveAxis(
  input: z.infer<typeof moveAxisSchema>
): Promise<z.infer<typeof moveAxisOutputSchema>> {
  try {
    // Validate movement limits (safety)
    const maxDistance = 300; // Max 300mm movement
    if (Math.abs(input.distance) > maxDistance) {
      throw new Error(`Movement distance cannot exceed ${maxDistance}mm`);
    }
    
    const speed = input.speed || 100;
    const axis = input.axis.toUpperCase();
    
    // Build G1 command (linear move)
    const gcode = `G1 ${axis}${input.distance} F${speed * 60}`; // F is in mm/min
    
    await moonrakerRequest("/printer/gcode/script", "POST", {
      script: gcode,
    });
    
    return {
      success: true,
      axis: input.axis,
      distance: input.distance,
      message: `Moved ${input.axis} axis ${input.distance > 0 ? "+" : ""}${input.distance}mm at ${speed}mm/s`,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to move axis: ${errorMessage}`);
  }
}

