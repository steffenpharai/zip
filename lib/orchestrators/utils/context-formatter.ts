/**
 * Context data formatter utility
 * 
 * Formats user context data for inclusion in prompts
 */

import type { UserContext } from "@/lib/context/types";

/**
 * Format user context data into a readable string for the AI prompt
 */
export function formatContextData(context?: UserContext): string {
  if (!context) {
    return "";
  }

  const parts: string[] = [];

  // Location
  if (context.location) {
    parts.push(`\nUser Location: ${context.location.lat.toFixed(4)}°N, ${context.location.lon.toFixed(4)}°E`);
  }

  // Weather
  if (context.weather) {
    const w = context.weather;
    parts.push(`\nCurrent Weather:`);
    parts.push(`  - Temperature: ${Math.round(w.tempF)}°F (feels like ${Math.round(w.feelsLikeF)}°F)`);
    parts.push(`  - Condition: ${w.condition}`);
    parts.push(`  - Location: ${w.city}, ${w.country}`);
    parts.push(`  - Humidity: ${w.humidityPercent}%`);
    parts.push(`  - Wind: ${w.windMs.toFixed(1)} m/s`);
    if (w.pressure) parts.push(`  - Pressure: ${w.pressure} hPa`);
    if (w.uvIndex !== undefined) parts.push(`  - UV Index: ${w.uvIndex}`);
    if (w.airQuality) {
      parts.push(`  - Air Quality: AQI ${w.airQuality.usAqi} (PM2.5: ${w.airQuality.pm25} µg/m³)`);
    }
  }

  // System Stats
  if (context.systemStats) {
    const s = context.systemStats;
    parts.push(`\nSystem Status:`);
    parts.push(`  - CPU: ${s.cpuPercent}%`);
    parts.push(`  - RAM: ${s.ramUsedGb.toFixed(1)}/${s.ramTotalGb.toFixed(1)} GB (${Math.round((s.ramUsedGb / s.ramTotalGb) * 100)}%)`);
    parts.push(`  - Disk: ${s.diskUsedGb.toFixed(1)}/${s.diskTotalGb.toFixed(1)} GB (${Math.round((s.diskUsedGb / s.diskTotalGb) * 100)}%)`);
  }

  // Uptime
  if (context.uptime) {
    const u = context.uptime;
    parts.push(`\nSystem Uptime:`);
    parts.push(`  - Running: ${u.runningSeconds}s`);
    parts.push(`  - Session: ${u.sessionTimeLabel}`);
    parts.push(`  - Commands: ${u.commandsCount}`);
    parts.push(`  - Load: ${u.loadPercent}%`);
  }

  // Camera (UI state - note: YOLOE vision runs independently via ROS2)
  if (context.cameraEnabled !== undefined) {
    parts.push(`\nCamera (UI): ${context.cameraEnabled ? "Enabled" : "Disabled"}`);
    parts.push(`\nIMPORTANT: YOLOE vision system runs independently via ROS2 and is always available.`);
    parts.push(`The camera UI state does not affect vision detection availability.`);
    parts.push(`You can always use get_vision_detections and query_vision tools regardless of camera UI state.`);
  }

  if (parts.length === 0) {
    return "";
  }

  return `\n\n=== CURRENT USER CONTEXT ===${parts.join("")}\n\nIMPORTANT: Use this context data when answering questions. For example:
- If asked about weather, use the weather data above instead of asking for location
- If asked about system status, use the system stats above instead of calling tools
- Only call tools if you need more recent or additional data beyond what's provided above
=== END CONTEXT ===\n`;
}

