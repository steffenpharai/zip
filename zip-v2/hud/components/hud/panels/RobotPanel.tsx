"use client";

/**
 * RobotPanel - Compact HUD panel for robot status
 * 
 * Shows connection status, motor state, and quick stats.
 * Links to full diagnostics page at /robot.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { useEventBus } from "@/lib/events/hooks";
import type { ZipEvent } from "@/lib/events/types";
import { LAYOUT } from "@/lib/constants";
import type { RobotConnectionState } from "@/lib/robot/types";

interface RobotPanelStatus {
  connection: RobotConnectionState;
  ready: boolean;
  port: string | null;
  streaming: boolean;
  streamRateHz: number;
  motorLeft?: number;
  motorRight?: number;
  battery?: {
    voltage: number;
    percent: number;
  };
}

export default function RobotPanel() {
  const [robotStatus, setRobotStatus] = useState<RobotPanelStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEventBus((event: ZipEvent) => {
    if (event.type === "panel.update" && event.panel === "robot") {
      const payload = event.payload as RobotPanelStatus;
      setRobotStatus(payload);
      setError(null);
    } else if (event.type === "panel.update" && event.panel === "robot_error") {
      setError((event.payload as { message: string }).message);
    }
  });

  // Poll for initial status on mount
  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const res = await fetch("/api/tools/get_robot_status", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        });
        if (res.ok) {
          const data = await res.json();
          if (data.result) {
            setRobotStatus({
              connection: data.result.connection,
              ready: data.result.ready,
              port: data.result.port,
              streaming: data.result.streaming,
              streamRateHz: data.result.streamRateHz,
            });
          }
        }
      } catch {
        // Ignore initial fetch errors - robot may not be connected
      }
    };

    fetchStatus();
    const interval = setInterval(fetchStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  function getConnectionColor(connection: RobotConnectionState): string {
    switch (connection) {
      case "connected":
        return "bg-online-green";
      case "error":
        return "bg-red-500";
      case "disconnected":
      default:
        return "bg-text-muted";
    }
  }

  function getConnectionLabel(connection: RobotConnectionState): string {
    switch (connection) {
      case "connected":
        return "Connected";
      case "error":
        return "Error";
      case "disconnected":
      default:
        return "Disconnected";
    }
  }

  function formatMotorPWM(pwm: number | undefined): string {
    if (pwm === undefined) return "--";
    const direction = pwm >= 0 ? "+" : "";
    return `${direction}${pwm}`;
  }

  const isConnected = robotStatus?.connection === "connected";

  return (
    <div
      className="bg-panel-surface-2 border border-border rounded-xl p-3 flex flex-col"
      style={{ borderRadius: `${LAYOUT.CARD_RADIUS}px` }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-text-muted text-xs font-semibold uppercase tracking-wide flex items-center gap-2">
          <span
            className={`w-2 h-2 rounded-full ${
              robotStatus ? getConnectionColor(robotStatus.connection) : "bg-text-muted"
            }`}
          />
          Robot
        </h4>
        <span className="text-text-muted text-xs">
          {robotStatus ? getConnectionLabel(robotStatus.connection) : "Unknown"}
        </span>
      </div>

      {/* Content */}
      <div className="space-y-2">
        {error ? (
          <div className="text-red-400 text-xs py-1">
            <div className="flex items-center gap-2">
              <svg
                className="w-3 h-3 flex-shrink-0"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <span className="truncate">{error}</span>
            </div>
          </div>
        ) : !robotStatus || robotStatus.connection === "disconnected" ? (
          <div className="text-text-muted text-xs py-1">
            Bridge not connected
          </div>
        ) : (
          <>
            {/* Port and Streaming Status */}
            <div className="flex justify-between text-xs">
              <span className="text-text-muted">Port:</span>
              <span className="text-text-primary font-mono">
                {robotStatus.port || "Auto"}
              </span>
            </div>

            {/* Streaming indicator */}
            {robotStatus.streaming && (
              <div className="flex items-center justify-between text-xs">
                <span className="text-text-muted">Streaming:</span>
                <span className="text-accent-cyan flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-accent-cyan animate-pulse" />
                  {robotStatus.streamRateHz}Hz
                </span>
              </div>
            )}

            {/* Motor Status (if available) */}
            {(robotStatus.motorLeft !== undefined || robotStatus.motorRight !== undefined) && (
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-text-muted">L:</span>
                  <span className="text-text-primary font-mono">
                    {formatMotorPWM(robotStatus.motorLeft)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-muted">R:</span>
                  <span className="text-text-primary font-mono">
                    {formatMotorPWM(robotStatus.motorRight)}
                  </span>
                </div>
              </div>
            )}

            {/* Battery (if available) */}
            {robotStatus.battery && (
              <div className="flex justify-between text-xs">
                <span className="text-text-muted">Battery:</span>
                <span className={`font-mono ${
                  robotStatus.battery.percent > 40 ? "text-online-green" :
                  robotStatus.battery.percent > 20 ? "text-yellow-500" :
                  "text-red-500"
                }`}>
                  {robotStatus.battery.percent.toFixed(0)}%
                </span>
              </div>
            )}
          </>
        )}
      </div>

      {/* Link to full diagnostics */}
      <div className="mt-3 pt-2 border-t border-border/50">
        <Link
          href="/robot"
          className="flex items-center justify-center gap-2 text-xs text-accent-cyan hover:text-accent-cyan-2 transition-colors"
        >
          <span>View Diagnostics</span>
          <svg
            className="w-3 h-3"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 5l7 7-7 7"
            />
          </svg>
        </Link>
      </div>
    </div>
  );
}

