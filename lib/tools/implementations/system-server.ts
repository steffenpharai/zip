// Server-side system stats (for API routes)
// Reads real system data from /proc filesystem and system commands

import { readFileSync } from "fs";
import { execSync } from "child_process";

let lastCpuStats: { total: number; idle: number } | null = null;

function getCpuUsage(): number {
  try {
    const statContent = readFileSync("/proc/stat", "utf-8");
    const cpuLine = statContent.split("\n")[0];
    const parts = cpuLine.trim().split(/\s+/);
    
    // CPU stats: user, nice, system, idle, iowait, irq, softirq, steal, guest, guest_nice
    const user = parseInt(parts[1]) || 0;
    const nice = parseInt(parts[2]) || 0;
    const system = parseInt(parts[3]) || 0;
    const idle = parseInt(parts[4]) || 0;
    const iowait = parseInt(parts[5]) || 0;
    const irq = parseInt(parts[6]) || 0;
    const softirq = parseInt(parts[7]) || 0;
    const steal = parseInt(parts[8]) || 0;
    
    const total = user + nice + system + idle + iowait + irq + softirq + steal;
    const currentIdle = idle + iowait;
    
    if (lastCpuStats) {
      const totalDiff = total - lastCpuStats.total;
      const idleDiff = currentIdle - lastCpuStats.idle;
      
      if (totalDiff > 0) {
        const cpuPercent = ((totalDiff - idleDiff) / totalDiff) * 100;
        lastCpuStats = { total, idle: currentIdle };
        return Math.max(0, Math.min(100, cpuPercent));
      }
    }
    
    lastCpuStats = { total, idle: currentIdle };
    return 0; // First call, return 0
  } catch (error) {
    console.error("Error reading CPU stats:", error);
    return 0;
  }
}

function getMemoryInfo(): { usedGb: number; totalGb: number } {
  try {
    const memInfoContent = readFileSync("/proc/meminfo", "utf-8");
    const lines = memInfoContent.split("\n");
    
    let memTotal = 0;
    let memAvailable = 0;
    let memFree = 0;
    let buffers = 0;
    let cached = 0;
    
    for (const line of lines) {
      if (line.startsWith("MemTotal:")) {
        memTotal = parseInt(line.split(/\s+/)[1]) || 0;
      } else if (line.startsWith("MemAvailable:")) {
        memAvailable = parseInt(line.split(/\s+/)[1]) || 0;
      } else if (line.startsWith("MemFree:")) {
        memFree = parseInt(line.split(/\s+/)[1]) || 0;
      } else if (line.startsWith("Buffers:")) {
        buffers = parseInt(line.split(/\s+/)[1]) || 0;
      } else if (line.startsWith("Cached:")) {
        cached = parseInt(line.split(/\s+/)[1]) || 0;
      }
    }
    
    // Convert from KB to GB
    const totalGb = memTotal / (1024 * 1024);
    
    // Calculate used memory
    // If MemAvailable exists (kernel 3.14+), use it; otherwise calculate
    let usedKb: number;
    if (memAvailable > 0) {
      usedKb = memTotal - memAvailable;
    } else {
      // Fallback calculation: total - free - buffers - cached
      usedKb = memTotal - memFree - buffers - cached;
    }
    
    const usedGb = usedKb / (1024 * 1024);
    
    return {
      usedGb: Math.max(0, usedGb),
      totalGb: Math.max(0, totalGb),
    };
  } catch (error) {
    console.error("Error reading memory info:", error);
    return { usedGb: 0, totalGb: 0 };
  }
}

function getDiskInfo(): { usedGb: number; totalGb: number } {
  try {
    // Get root filesystem usage using df command
    const dfOutput = execSync("df -BG /", { encoding: "utf-8", timeout: 5000 });
    const lines = dfOutput.trim().split("\n");
    
    if (lines.length >= 2) {
      const dataLine = lines[1];
      const parts = dataLine.trim().split(/\s+/);
      
      // df output: Filesystem, 1G-blocks, Used, Available, Use%, Mounted on
      const totalGb = parseFloat(parts[1]) || 0;
      const usedGb = parseFloat(parts[2]) || 0;
      
      return {
        usedGb: Math.max(0, usedGb),
        totalGb: Math.max(0, totalGb),
      };
    }
    
    return { usedGb: 0, totalGb: 0 };
  } catch (error) {
    console.error("Error reading disk info:", error);
    return { usedGb: 0, totalGb: 0 };
  }
}

export async function getSystemStats(): Promise<{
  cpuPercent: number;
  ramUsedGb: number;
  ramTotalGb: number;
  diskUsedGb: number;
  diskTotalGb: number;
  cpuLabel: string;
  memLabel: string;
  diskLabel: string;
}> {
  const cpuPercent = getCpuUsage();
  const { usedGb: ramUsedGb, totalGb: ramTotalGb } = getMemoryInfo();
  const { usedGb: diskUsedGb, totalGb: diskTotalGb } = getDiskInfo();

  return {
    cpuPercent: Math.round(cpuPercent * 10) / 10,
    ramUsedGb: Math.round(ramUsedGb * 100) / 100,
    ramTotalGb: Math.round(ramTotalGb * 100) / 100,
    diskUsedGb: Math.round(diskUsedGb * 100) / 100,
    diskTotalGb: Math.round(diskTotalGb * 100) / 100,
    cpuLabel: `${Math.round(cpuPercent)}%`,
    memLabel: `${Math.round(ramUsedGb)}/${Math.round(ramTotalGb)} GB`,
    diskLabel: `${Math.round(diskUsedGb)}/${Math.round(diskTotalGb)} GB`,
  };
}

