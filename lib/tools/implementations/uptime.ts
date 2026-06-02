// Server-side uptime tracking
// Reads real system uptime from /proc/uptime and load average from /proc/loadavg

import { readFileSync } from "fs";

let serverStartTime: number | null = null;
let sessionCount = 0;

if (typeof window === "undefined") {
  // Server-side initialization
  serverStartTime = Date.now();
}

export function initializeUptime() {
  if (serverStartTime === null) {
    serverStartTime = Date.now();
  }
  sessionCount++;
}

export function getServerStartTime(): number {
  if (serverStartTime === null) {
    serverStartTime = Date.now();
  }
  return serverStartTime;
}

function getSystemUptime(): number {
  try {
    const uptimeContent = readFileSync("/proc/uptime", "utf-8");
    const parts = uptimeContent.trim().split(/\s+/);
    const uptimeSeconds = parseFloat(parts[0]) || 0;
    return Math.floor(uptimeSeconds);
  } catch (error) {
    console.error("Error reading system uptime:", error);
    // Fallback to application uptime
    const now = Date.now();
    const startTime = getServerStartTime();
    return Math.floor((now - startTime) / 1000);
  }
}

function getLoadAverage(): { load1min: number; loadPercent: number } {
  try {
    const loadavgContent = readFileSync("/proc/loadavg", "utf-8");
    const parts = loadavgContent.trim().split(/\s+/);
    const load1min = parseFloat(parts[0]) || 0;
    
    // Get number of CPU cores to calculate load percentage
    let cpuCount = 1;
    try {
      const cpuInfoContent = readFileSync("/proc/cpuinfo", "utf-8");
      const matches = cpuInfoContent.match(/^processor\s*:/gm);
      cpuCount = matches ? matches.length : 1;
    } catch {
      // Default to 1 if we can't read cpuinfo
    }
    
    // Load average as percentage (load / num_cores * 100)
    // Cap at 100% for display purposes
    const loadPercent = Math.min(100, (load1min / cpuCount) * 100);
    
    return {
      load1min,
      loadPercent: Math.round(loadPercent),
    };
  } catch (error) {
    console.error("Error reading load average:", error);
    return { load1min: 0, loadPercent: 0 };
  }
}

export async function getUptime(input: {
  sessionStartTime?: number;
  commandsCount?: number;
}): Promise<{
  runningSeconds: number;
  sessionCount: number;
  commandsCount: number;
  loadLabel: string;
  loadPercent: number;
  sessionTimeLabel: string;
}> {
  // Get real system uptime
  const runningSeconds = getSystemUptime();

  // Session time is still based on application session
  const now = Date.now();
  const sessionStart = input.sessionStartTime || now;
  const sessionSeconds = Math.floor((now - sessionStart) / 1000);

  // Get real system load average
  const { loadPercent, load1min } = getLoadAverage();
  const commandsCount = input.commandsCount || 0;

  function formatDuration(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    if (minutes > 0) {
      return `${minutes}m ${secs}s`;
    }
    return `${secs}s`;
  }

  // Format load label (show 1-minute load average)
  const loadLabel = `${loadPercent}%`;

  return {
    runningSeconds,
    sessionCount,
    commandsCount,
    loadLabel,
    loadPercent,
    sessionTimeLabel: formatDuration(sessionSeconds),
  };
}

