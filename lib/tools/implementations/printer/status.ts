/**
 * 3D Printer status and monitoring tools (READ tier)
 * 
 * Tools for querying printer status, temperatures, progress, and file listings
 */

import { z } from "zod";
import { moonrakerRequest, moonrakerRequestWithRetry } from "./client";

// Status tool schemas
export const getPrinterStatusSchema = z.object({});

export const getPrinterStatusOutputSchema = z.object({
  state: z.string(),
  klippyConnected: z.boolean(),
  temperatures: z.object({
    hotend: z.object({
      current: z.number(),
      target: z.number(),
    }),
    bed: z.object({
      current: z.number(),
      target: z.number(),
    }),
  }),
  position: z.object({
    x: z.number().optional(),
    y: z.number().optional(),
    z: z.number().optional(),
    e: z.number().optional(),
  }).optional(),
  printProgress: z.object({
    filename: z.string().optional(),
    progress: z.number().min(0).max(100).optional(),
    printTime: z.number().optional(),
    printTimeLeft: z.number().optional(),
    state: z.string().optional(),
    layer: z.number().optional(),
    totalLayers: z.number().optional(),
  }).optional(),
  fanSpeed: z.number().min(0).max(100).optional(),
  flowRate: z.number().min(0).max(200).optional(),
  printSpeed: z.number().optional(),
});

export async function getPrinterStatus(
  input: z.infer<typeof getPrinterStatusSchema>
): Promise<z.infer<typeof getPrinterStatusOutputSchema>> {
  try {
    // Query printer objects for comprehensive status
    // Try to query additional objects for diagnostics, but handle gracefully if not available
    const objects = [
      "heater_bed",
      "extruder",
      "print_stats",
      "toolhead",
      "fan",
      "fan_generic",
      "display_status",
      "virtual_sdcard",
    ];
    
    const queryParams = objects.join("&");
    const data = await moonrakerRequestWithRetry<{
      status: {
        heater_bed?: {
          temperature: number;
          target: number;
        };
        extruder?: {
          temperature: number;
          target: number;
          pressure_advance?: number;
        };
        print_stats?: {
          filename?: string;
          state?: string;
          print_duration?: number;
          total_duration?: number;
        };
        toolhead?: {
          position?: [number, number, number, number];
          velocity?: number;
          extruder_velocity?: number;
        };
        fan?: {
          speed?: number;
        };
        fan_generic?: {
          speed?: number;
        };
        display_status?: {
          progress?: number;
          message?: string;
        };
        virtual_sdcard?: {
          progress?: number;
          file_position?: number;
          is_active?: boolean;
        };
      };
    }>(`/printer/objects/query?${queryParams}`);
    
    const status = data.status || {};
    
    // Get server info to check Klippy connection
    const serverInfo = await moonrakerRequest<{
      klippy_connected: boolean;
      klippy_state: string;
    }>("/server/info");
    
    // Calculate print progress
    let printProgress: {
      filename?: string;
      progress?: number;
      printTime?: number;
      printTimeLeft?: number;
      state?: string;
      layer?: number;
      totalLayers?: number;
    } | undefined;
    
    if (status.print_stats) {
      const stats = status.print_stats;
      const printDuration = stats.print_duration || 0;
      const totalDuration = stats.total_duration || 0;
      
      let progress = 0;
      if (totalDuration > 0 && printDuration > 0) {
        progress = Math.min(100, Math.round((printDuration / totalDuration) * 100));
      }
      
      // Try to get progress from display_status or virtual_sdcard if available
      if (status.display_status?.progress !== undefined) {
        progress = Math.min(100, Math.max(0, status.display_status.progress * 100));
      } else if (status.virtual_sdcard?.progress !== undefined) {
        progress = Math.min(100, Math.max(0, status.virtual_sdcard.progress * 100));
      }
      
      let printTimeLeft: number | undefined;
      if (progress > 0 && progress < 100 && totalDuration > printDuration) {
        printTimeLeft = totalDuration - printDuration;
      }
      
      // Extract layer information from display_status message if available
      let layer: number | undefined;
      let totalLayers: number | undefined;
      if (status.display_status?.message) {
        const layerMatch = status.display_status.message.match(/layer\s+(\d+)\s*\/\s*(\d+)/i);
        if (layerMatch) {
          layer = parseInt(layerMatch[1], 10);
          totalLayers = parseInt(layerMatch[2], 10);
        }
      }
      
      printProgress = {
        filename: stats.filename,
        progress,
        printTime: printDuration,
        printTimeLeft,
        state: stats.state,
        layer,
        totalLayers,
      };
    }
    
    // Get fan speed (try fan first, then fan_generic)
    let fanSpeed: number | undefined;
    if (status.fan?.speed !== undefined) {
      fanSpeed = Math.min(100, Math.max(0, status.fan.speed * 100));
    } else if (status.fan_generic?.speed !== undefined) {
      fanSpeed = Math.min(100, Math.max(0, status.fan_generic.speed * 100));
    }
    
    // Get flow rate from extruder (if available as a multiplier)
    // Flow rate is typically stored as a multiplier (1.0 = 100%)
    let flowRate: number | undefined;
    // Note: Flow rate might need to be queried separately or calculated
    // For now, we'll leave it undefined if not directly available
    
    // Get print speed from toolhead velocity
    let printSpeed: number | undefined;
    if (status.toolhead?.velocity !== undefined) {
      printSpeed = status.toolhead.velocity;
    } else if (status.toolhead?.extruder_velocity !== undefined) {
      printSpeed = status.toolhead.extruder_velocity;
    }
    
    return {
      state: serverInfo.klippy_state || "unknown",
      klippyConnected: serverInfo.klippy_connected || false,
      temperatures: {
        hotend: {
          current: status.extruder?.temperature || 0,
          target: status.extruder?.target || 0,
        },
        bed: {
          current: status.heater_bed?.temperature || 0,
          target: status.heater_bed?.target || 0,
        },
      },
      position: status.toolhead?.position ? {
        x: status.toolhead.position[0],
        y: status.toolhead.position[1],
        z: status.toolhead.position[2],
        e: status.toolhead.position[3],
      } : undefined,
      printProgress,
      fanSpeed,
      flowRate,
      printSpeed,
    };
  } catch (error) {
    throw error instanceof Error ? error : new Error("Failed to get printer status");
  }
}

export const getPrinterTemperatureSchema = z.object({});

export const getPrinterTemperatureOutputSchema = z.object({
  hotend: z.object({
    current: z.number(),
    target: z.number(),
  }),
  bed: z.object({
    current: z.number(),
    target: z.number(),
  }),
});

export async function getPrinterTemperature(
  input: z.infer<typeof getPrinterTemperatureSchema>
): Promise<z.infer<typeof getPrinterTemperatureOutputSchema>> {
  try {
    const data = await moonrakerRequestWithRetry<{
      status: {
        heater_bed?: {
          temperature: number;
          target: number;
        };
        extruder?: {
          temperature: number;
          target: number;
        };
      };
    }>("/printer/objects/query?heater_bed&extruder");
    
    const status = data.status || {};
    
    return {
      hotend: {
        current: status.extruder?.temperature || 0,
        target: status.extruder?.target || 0,
      },
      bed: {
        current: status.heater_bed?.temperature || 0,
        target: status.heater_bed?.target || 0,
      },
    };
  } catch (error) {
    throw error instanceof Error ? error : new Error("Failed to get printer temperature");
  }
}

export const getPrintProgressSchema = z.object({});

export const getPrintProgressOutputSchema = z.object({
  filename: z.string().optional(),
  progress: z.number().min(0).max(100).optional(),
  printTime: z.number().optional(),
  printTimeLeft: z.number().optional(),
  state: z.string().optional(),
});

export async function getPrintProgress(
  input: z.infer<typeof getPrintProgressSchema>
): Promise<z.infer<typeof getPrintProgressOutputSchema>> {
  try {
    const data = await moonrakerRequestWithRetry<{
      status: {
        print_stats?: {
          filename?: string;
          state?: string;
          print_duration?: number;
          total_duration?: number;
        };
      };
    }>("/printer/objects/query?print_stats");
    
    const stats = data.status?.print_stats;
    
    if (!stats) {
      return {
        state: "idle",
      };
    }
    
    const printDuration = stats.print_duration || 0;
    const totalDuration = stats.total_duration || 0;
    
    let progress = 0;
    if (totalDuration > 0 && printDuration > 0) {
      progress = Math.min(100, Math.round((printDuration / totalDuration) * 100));
    }
    
    let printTimeLeft: number | undefined;
    if (progress > 0 && progress < 100 && totalDuration > printDuration) {
      printTimeLeft = totalDuration - printDuration;
    }
    
    return {
      filename: stats.filename,
      progress,
      printTime: printDuration,
      printTimeLeft,
      state: stats.state,
    };
  } catch (error) {
    throw error instanceof Error ? error : new Error("Failed to get print progress");
  }
}

export const listPrinterFilesSchema = z.object({
  root: z.string().optional().default("gcodes"),
});

export const listPrinterFilesOutputSchema = z.object({
  files: z.array(z.object({
    path: z.string(),
    modified: z.number().optional(),
    size: z.number().optional(),
  })),
  root: z.string(),
});

export async function listPrinterFiles(
  input: z.infer<typeof listPrinterFilesSchema>
): Promise<z.infer<typeof listPrinterFilesOutputSchema>> {
  try {
    const root = input.root || "gcodes";
    const data = await moonrakerRequestWithRetry<Array<{
      path: string;
      modified?: number;
      size?: number;
    }>>(`/server/files/list?root=${encodeURIComponent(root)}`);
    
    return {
      files: data.map(file => ({
        path: file.path,
        modified: file.modified,
        size: file.size,
      })),
      root,
    };
  } catch (error) {
    throw error instanceof Error ? error : new Error("Failed to list printer files");
  }
}

