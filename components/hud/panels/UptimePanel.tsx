"use client";

import { useState, useEffect } from "react";
import { useEventBus } from "@/lib/events/hooks";
import type { ZipEvent } from "@/lib/events/types";
import { LAYOUT } from "@/lib/constants";

interface Uptime {
  runningSeconds: number;
  sessionCount: number;
  commandsCount: number;
  loadLabel: string;
  loadPercent: number;
  sessionTimeLabel: string;
}

export default function UptimePanel() {
  const [uptime, setUptime] = useState<Uptime | null>(null);
  const [localSessionTime, setLocalSessionTime] = useState(0);

  useEventBus((event: ZipEvent) => {
    if (event.type === "panel.update" && event.panel === "uptime") {
      setUptime(event.payload as Uptime);
    }
  });

  useEffect(() => {
    const interval = setInterval(() => {
      setLocalSessionTime((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  if (!uptime) {
    return (
      <div
        className="bg-panel-surface-2 border border-border rounded-xl p-4"
        style={{ borderRadius: `${LAYOUT.CARD_RADIUS}px` }}
      >
        <h4 className="text-text-muted text-xs font-semibold uppercase tracking-wide mb-3">
          System Uptime
        </h4>
        <div className="text-text-muted text-sm">Loading...</div>
      </div>
    );
  }

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

  return (
    <div
      className="bg-panel-surface-2 border border-border rounded-xl p-4"
      style={{ borderRadius: `${LAYOUT.CARD_RADIUS}px` }}
    >
      <h4 className="text-text-muted text-xs font-semibold uppercase tracking-wide mb-3">
        System Uptime
      </h4>
      <div className="space-y-2">
        <div className="flex justify-between items-center">
          <span className="text-text-primary text-xs">Running</span>
          <span className="text-text-muted text-xs">
            {formatDuration(uptime.runningSeconds)}
          </span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-text-primary text-xs">Session</span>
          <span className="text-text-muted text-xs">
            {formatDuration(localSessionTime)}
          </span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-text-primary text-xs">Commands</span>
          <span className="text-text-muted text-xs">{uptime.commandsCount}</span>
        </div>
        <div className="mt-3">
          <div className="flex justify-between items-center mb-1">
            <span className="text-text-primary text-xs">Load</span>
            <span className="text-text-muted text-xs">{uptime.loadLabel}</span>
          </div>
          <div className="h-2 bg-panel-surface rounded-full overflow-hidden">
            <div
              className="h-full bg-accent-cyan transition-all duration-300"
              style={{ width: `${uptime.loadPercent}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

