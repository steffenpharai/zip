"use client";

let lastCpuCheck = Date.now();
let cpuWorkTime = 0;
let cpuIdleTime = 0;

function approximateCpuUsage(): number {
  const now = Date.now();
  const elapsed = now - lastCpuCheck;
  lastCpuCheck = now;

  // Simulate work by doing some computation
  const start = performance.now();
  for (let i = 0; i < 1000; i++) {
    Math.sqrt(i);
  }
  const workTime = performance.now() - start;

  cpuWorkTime += workTime;
  cpuIdleTime += elapsed - workTime;

  const totalTime = cpuWorkTime + cpuIdleTime;
  if (totalTime === 0) return 25; // Default to 25%

  const cpuPercent = (cpuWorkTime / totalTime) * 100;

  // Decay over time to simulate varying load
  cpuWorkTime *= 0.9;
  cpuIdleTime *= 0.9;

  // Clamp between 10% and 85% for realism
  return Math.max(10, Math.min(85, cpuPercent));
}

function getMemoryInfo(): { usedGb: number; totalGb: number } {
  // @ts-ignore - navigator.deviceMemory is not in all TypeScript definitions
  const deviceMemory = navigator.deviceMemory;
  const totalGb = deviceMemory ? deviceMemory : 16; // Default to 16GB

  // Estimate used memory (browser doesn't expose this directly)
  // Use a realistic approximation based on performance.memory if available
  // @ts-ignore - performance.memory is Chrome-specific
  const memoryInfo = performance.memory;
  if (memoryInfo) {
    const usedMb = memoryInfo.usedJSHeapSize / (1024 * 1024);
    const usedGb = usedMb / 1024;
    return {
      usedGb: Math.min(usedGb, totalGb * 0.9), // Cap at 90% of total
      totalGb,
    };
  }

  // Fallback: use a realistic mock that varies slightly
  const baseUsed = totalGb * 0.45;
  const variation = (Math.sin(Date.now() / 10000) * 0.1 + 1) * baseUsed;
  return {
    usedGb: Math.min(variation, totalGb * 0.9),
    totalGb,
  };
}

function getDiskInfo(): { usedGb: number; totalGb: number } {
  // Browser doesn't expose disk info, use realistic mock
  const totalGb = 512;
  const baseUsed = 256;
  const variation = (Math.sin(Date.now() / 15000) * 0.05 + 1) * baseUsed;
  return {
    usedGb: Math.min(variation, totalGb * 0.95),
    totalGb,
  };
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
  const cpuPercent = approximateCpuUsage();
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

