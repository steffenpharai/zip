"use client";

import { useState, useEffect } from "react";
import { useEventBus } from "@/lib/events/hooks";
import type { ZipEvent } from "@/lib/events/types";
import { LAYOUT } from "@/lib/constants";

interface SystemStats {
  cpuPercent: number;
  ramUsedGb: number;
  ramTotalGb: number;
  diskUsedGb: number;
  diskTotalGb: number;
  cpuLabel: string;
  memLabel: string;
  diskLabel: string;
}

interface Uptime {
  runningSeconds: number;
  sessionCount: number;
  commandsCount: number;
  loadLabel: string;
  loadPercent: number;
  sessionTimeLabel: string;
}

type TabType = "stats" | "uptime";

export default function SystemStatsPanel() {
  const [activeTab, setActiveTab] = useState<TabType>("stats");
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [uptime, setUptime] = useState<Uptime | null>(null);
  const [localSessionTime, setLocalSessionTime] = useState(0);

  useEventBus((event: ZipEvent) => {
    if (event.type === "panel.update") {
      if (event.panel === "system") {
        setStats(event.payload as SystemStats);
      } else if (event.panel === "uptime") {
        setUptime(event.payload as Uptime);
      }
    }
  });

  // Immediate system stats fetch on mount (via API for real data)
  useEffect(() => {
    const fetchImmediateStats = async () => {
      try {
        const response = await fetch("/api/tools/get_system_stats", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
        if (response.ok) {
          const { result } = await response.json();
          setStats(result);
        }
      } catch (error) {
        console.error("Failed to fetch immediate system stats:", error);
      }
    };
    fetchImmediateStats();
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setLocalSessionTime((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

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

  const isLoading = activeTab === "stats" ? !stats : !uptime;

  return (
    <div
      className="bg-panel-surface-2 border border-border rounded-xl p-4"
      style={{ borderRadius: `${LAYOUT.CARD_RADIUS}px` }}
    >
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-text-muted text-xs font-semibold uppercase tracking-wide flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-online-green"></span>
          System
        </h4>
        <div className="flex gap-1">
          <button
            onClick={() => setActiveTab("stats")}
            className={`px-2 py-1 text-xs font-medium rounded transition-colors ${
              activeTab === "stats"
                ? "bg-panel-surface text-text-primary"
                : "text-text-muted hover:text-text-primary"
            }`}
          >
            Stats
          </button>
          <button
            onClick={() => setActiveTab("uptime")}
            className={`px-2 py-1 text-xs font-medium rounded transition-colors ${
              activeTab === "uptime"
                ? "bg-panel-surface text-text-primary"
                : "text-text-muted hover:text-text-primary"
            }`}
          >
            Uptime
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="text-text-muted text-sm">Loading...</div>
      ) : (
        <>
          {activeTab === "stats" && stats && (
            <div className="space-y-3">
              {/* CPU */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-text-primary text-xs">CPU</span>
                  <span className="text-text-muted text-xs">{stats.cpuLabel}</span>
                </div>
                <div className="h-2 bg-panel-surface rounded-full overflow-hidden">
                  <div
                    className="h-full bg-accent-cyan transition-all duration-300"
                    style={{ width: `${stats.cpuPercent}%` }}
                  />
                </div>
              </div>

              {/* RAM */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-text-primary text-xs">RAM</span>
                  <span className="text-text-muted text-xs">{stats.memLabel}</span>
                </div>
                <div className="h-2 bg-panel-surface rounded-full overflow-hidden">
                  <div
                    className="h-full bg-accent-cyan-2 transition-all duration-300"
                    style={{
                      width: `${(stats.ramUsedGb / stats.ramTotalGb) * 100}%`,
                    }}
                  />
                </div>
              </div>

              {/* Disk */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-text-primary text-xs">Disk</span>
                  <span className="text-text-muted text-xs">{stats.diskLabel}</span>
                </div>
                <div className="h-2 bg-panel-surface rounded-full overflow-hidden">
                  <div
                    className="h-full bg-accent-cyan transition-all duration-300"
                    style={{
                      width: `${(stats.diskUsedGb / stats.diskTotalGb) * 100}%`,
                    }}
                  />
                </div>
              </div>
            </div>
          )}

          {activeTab === "uptime" && uptime && (
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
          )}
        </>
      )}
    </div>
  );
}

