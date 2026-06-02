"use client";

/**
 * ConnectionStatus - Bridge robot connection status display
 * 
 * Shows WebSocket bridge connection state and robot communication stats.
 */

import type { RobotConnectionState, RobotStatusResponse } from "@/lib/robot/types";

interface ConnectionStatusProps {
  connection: RobotConnectionState;
  status: RobotStatusResponse | null;
  onRefresh?: () => void;
}

export default function ConnectionStatus({
  connection,
  status,
  onRefresh,
}: ConnectionStatusProps) {
  function getConnectionColor(state: RobotConnectionState): string {
    switch (state) {
      case "connected":
        return "bg-online-green";
      case "error":
        return "bg-red-500";
      default:
        return "bg-text-muted";
    }
  }

  function getConnectionLabel(state: RobotConnectionState): string {
    switch (state) {
      case "connected":
        return "Connected";
      case "error":
        return "Error";
      default:
        return "Disconnected";
    }
  }

  function formatUptime(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    }
    if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    }
    return `${seconds}s`;
  }

  function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  return (
    <div className="bg-panel-surface border border-border rounded-lg p-4 space-y-4">
      {/* Connection Status Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`w-3 h-3 rounded-full ${getConnectionColor(connection)}`} />
          <div>
            <div className="text-text-primary font-medium">
              {getConnectionLabel(connection)}
            </div>
            <div className="text-text-muted text-xs">
              Bridge Connection
            </div>
          </div>
        </div>
        {onRefresh && (
          <button
            onClick={onRefresh}
            className="px-3 py-1.5 text-xs bg-panel-surface-2 border border-border rounded hover:border-accent-cyan/50 hover:text-accent-cyan transition-colors"
          >
            Refresh
          </button>
        )}
      </div>

      {/* Bridge Info */}
      {status && (
        <div className="pt-3 border-t border-border/50">
          <div className="flex items-center gap-2 text-sm">
            <svg className="w-4 h-4 text-accent-cyan" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <span className="text-text-muted">Bridge:</span>
            <span className="text-text-primary font-mono">ws://localhost:8765</span>
          </div>
        </div>
      )}

      {/* Connection Details */}
      {status && (
        <div className="grid grid-cols-2 gap-3 pt-3 border-t border-border/50">
          <div>
            <div className="text-text-muted text-xs uppercase tracking-wide">Uptime</div>
            <div className="text-text-primary font-mono text-sm">
              {formatUptime(status.uptime)}
            </div>
          </div>
          <div>
            <div className="text-text-muted text-xs uppercase tracking-wide">Commands</div>
            <div className="text-text-primary font-mono text-sm">
              {status.commands}
            </div>
          </div>
          <div>
            <div className="text-text-muted text-xs uppercase tracking-wide">Errors</div>
            <div className={`font-mono text-sm ${status.errors > 0 ? "text-yellow-500" : "text-text-primary"}`}>
              {status.errors}
            </div>
          </div>
          <div>
            <div className="text-text-muted text-xs uppercase tracking-wide">Last Response</div>
            <div className="text-text-primary font-mono text-sm">
              {status.lastResponseMs >= 0 ? `${status.lastResponseMs}ms ago` : "N/A"}
            </div>
          </div>
        </div>
      )}

      {/* Traffic Stats */}
      {status && (
        <div className="grid grid-cols-2 gap-3 pt-3 border-t border-border/50">
          <div>
            <div className="text-text-muted text-xs uppercase tracking-wide">RX (from UNO)</div>
            <div className="text-online-green font-mono text-sm">
              {formatBytes(status.rxBytes)}
            </div>
          </div>
          <div>
            <div className="text-text-muted text-xs uppercase tracking-wide">TX (to UNO)</div>
            <div className="text-accent-cyan font-mono text-sm">
              {formatBytes(status.txBytes)}
            </div>
          </div>
        </div>
      )}

      {/* Status indicators */}
      {status && (
        <div className="flex gap-4 pt-3 border-t border-border/50 text-xs">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${status.connected ? "bg-online-green" : "bg-red-500"}`} />
            <span className="text-text-muted">Serial2 (UNO)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${connection === "connected" ? "bg-online-green" : "bg-text-muted"}`} />
            <span className="text-text-muted">Bridge</span>
          </div>
        </div>
      )}

      {/* Disconnected state hint */}
      {connection === "disconnected" && !status && (
        <div className="pt-3 border-t border-border/50 text-center text-sm text-text-muted">
          <p>Bridge not connected</p>
          <p className="text-xs mt-1 opacity-75">Ensure the bridge service is running on localhost:8765</p>
        </div>
      )}
    </div>
  );
}
