"use client";

import { useState } from "react";
import { useEventBus } from "@/lib/events/hooks";
import type { ZipEvent } from "@/lib/events/types";
import { LAYOUT } from "@/lib/constants";

interface PrinterStatus {
  state: string;
  klippyConnected: boolean;
  temperatures: {
    hotend: {
      current: number;
      target: number;
    };
    bed: {
      current: number;
      target: number;
    };
  };
  position?: {
    x?: number;
    y?: number;
    z?: number;
    e?: number;
  };
  printProgress?: {
    filename?: string;
    progress?: number;
    printTime?: number;
    printTimeLeft?: number;
    state?: string;
    layer?: number;
    totalLayers?: number;
  };
  fanSpeed?: number;
  flowRate?: number;
  printSpeed?: number;
}

export default function PrinterPanel() {
  const [printerStatus, setPrinterStatus] = useState<PrinterStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEventBus((event: ZipEvent) => {
    if (event.type === "panel.update" && event.panel === "printer") {
      setPrinterStatus(event.payload as PrinterStatus);
      setError(null);
    } else if (event.type === "panel.update" && event.panel === "printer_error") {
      setError((event.payload as { message: string }).message);
      setPrinterStatus(null);
    }
  });

  function formatDuration(seconds: number): string {
    if (!seconds || seconds < 0) return "0s";
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    if (minutes > 0) {
      return `${minutes}m ${secs}s`;
    }
    return `${secs}s`;
  }

  function getStateColor(state: string): string {
    switch (state?.toLowerCase()) {
      case "ready":
        return "bg-online-green";
      case "printing":
        return "bg-accent-cyan";
      case "paused":
        return "bg-yellow-500";
      case "error":
        return "bg-red-500";
      default:
        return "bg-text-muted";
    }
  }

  const isLoading = !printerStatus && !error;
  const isConnected = printerStatus?.klippyConnected ?? false;

  return (
    <div
      className="bg-panel-surface-2 border border-border rounded-xl p-3 flex flex-col flex-1 min-h-0 overflow-hidden"
      style={{ borderRadius: `${LAYOUT.CARD_RADIUS}px` }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-2 flex-shrink-0">
        <h4 className="text-text-muted text-xs font-semibold uppercase tracking-wide flex items-center gap-2">
          <span
            className={`w-2 h-2 rounded-full ${
              isConnected ? "bg-online-green" : "bg-text-muted"
            }`}
          />
          Neptune 4 Pro
        </h4>
        <div className="flex items-center gap-2">
          <span
            className={`w-2 h-2 rounded-full ${getStateColor(printerStatus?.state || "unknown")}`}
          />
          <span className="text-text-muted text-xs capitalize">
            {printerStatus?.state || "Unknown"}
          </span>
        </div>
      </div>

      {/* Content - Scrollable if needed, but optimized for no scroll */}
      <div className="flex-1 min-h-0 overflow-y-auto space-y-2">
        {error ? (
          <div className="text-red-400 text-xs py-2">
            <div className="flex items-center gap-2">
              <svg
                className="w-4 h-4"
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
              <span>{error}</span>
            </div>
          </div>
        ) : isLoading ? (
          <div className="text-text-muted text-xs py-2">Loading...</div>
        ) : printerStatus ? (
          <>
            {/* Temperatures Section */}
            <div className="space-y-2 pb-2 border-b border-border/50">
              {/* Hotend */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-text-primary text-xs">Hotend</span>
                  <span className="text-text-muted text-xs">
                    {printerStatus.temperatures.hotend.current.toFixed(1)}°C /{" "}
                    {printerStatus.temperatures.hotend.target.toFixed(0)}°C
                  </span>
                </div>
                <div className="h-1.5 bg-panel-surface rounded-full overflow-hidden">
                  <div
                    className="h-full bg-red-500 transition-all duration-300"
                    style={{
                      width: `${Math.min(
                        100,
                        (printerStatus.temperatures.hotend.current / 300) * 100
                      )}%`,
                    }}
                  />
                </div>
                {printerStatus.temperatures.hotend.target > 0 && (
                  <div className="mt-0.5">
                    <div className="h-0.5 bg-panel-surface rounded-full overflow-hidden">
                      <div
                        className="h-full bg-red-400/50 transition-all duration-300"
                        style={{
                          width: `${Math.min(
                            100,
                            (printerStatus.temperatures.hotend.current /
                              printerStatus.temperatures.hotend.target) *
                              100
                          )}%`,
                        }}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Bed */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-text-primary text-xs">Bed</span>
                  <span className="text-text-muted text-xs">
                    {printerStatus.temperatures.bed.current.toFixed(1)}°C /{" "}
                    {printerStatus.temperatures.bed.target.toFixed(0)}°C
                  </span>
                </div>
                <div className="h-1.5 bg-panel-surface rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-500 transition-all duration-300"
                    style={{
                      width: `${Math.min(
                        100,
                        (printerStatus.temperatures.bed.current / 120) * 100
                      )}%`,
                    }}
                  />
                </div>
                {printerStatus.temperatures.bed.target > 0 && (
                  <div className="mt-0.5">
                    <div className="h-0.5 bg-panel-surface rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-400/50 transition-all duration-300"
                        style={{
                          width: `${Math.min(
                            100,
                            (printerStatus.temperatures.bed.current /
                              printerStatus.temperatures.bed.target) *
                              100
                          )}%`,
                        }}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Print Progress Section */}
            {printerStatus.printProgress?.filename && (
              <div className="space-y-1.5 pb-2 border-b border-border/50">
                <div className="text-text-primary text-xs truncate">
                  {printerStatus.printProgress.filename}
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-text-muted text-xs">Progress</span>
                  <span className="text-text-muted text-xs">
                    {printerStatus.printProgress.progress?.toFixed(1) || 0}%
                  </span>
                </div>
                <div className="h-1.5 bg-panel-surface rounded-full overflow-hidden">
                  <div
                    className="h-full bg-accent-cyan transition-all duration-300"
                    style={{
                      width: `${printerStatus.printProgress.progress || 0}%`,
                    }}
                  />
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {printerStatus.printProgress.printTime !== undefined && (
                    <div className="flex justify-between">
                      <span className="text-text-muted">Time:</span>
                      <span className="text-text-primary">
                        {formatDuration(printerStatus.printProgress.printTime)}
                      </span>
                    </div>
                  )}
                  {printerStatus.printProgress.printTimeLeft !== undefined &&
                    printerStatus.printProgress.printTimeLeft > 0 && (
                      <div className="flex justify-between">
                        <span className="text-text-muted">Left:</span>
                        <span className="text-text-primary">
                          {formatDuration(printerStatus.printProgress.printTimeLeft)}
                        </span>
                      </div>
                    )}
                  {printerStatus.printProgress.layer !== undefined &&
                    printerStatus.printProgress.totalLayers !== undefined && (
                      <div className="flex justify-between col-span-2">
                        <span className="text-text-muted">Layer:</span>
                        <span className="text-text-primary">
                          {printerStatus.printProgress.layer} / {printerStatus.printProgress.totalLayers}
                        </span>
                      </div>
                    )}
                </div>
              </div>
            )}

            {/* Position Section */}
            {printerStatus.position && (
              <div className="grid grid-cols-2 gap-x-2 gap-y-1 pb-2 border-b border-border/50">
                <div className="flex justify-between">
                  <span className="text-text-muted text-xs">X:</span>
                  <span className="text-text-primary text-xs font-mono">
                    {printerStatus.position.x?.toFixed(2) || "0.00"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-muted text-xs">Y:</span>
                  <span className="text-text-primary text-xs font-mono">
                    {printerStatus.position.y?.toFixed(2) || "0.00"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-muted text-xs">Z:</span>
                  <span className="text-text-primary text-xs font-mono">
                    {printerStatus.position.z?.toFixed(2) || "0.00"}
                  </span>
                </div>
                {printerStatus.position.e !== undefined && (
                  <div className="flex justify-between">
                    <span className="text-text-muted text-xs">E:</span>
                    <span className="text-text-primary text-xs font-mono">
                      {printerStatus.position.e.toFixed(2)}
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Performance Section */}
            {(printerStatus.fanSpeed !== undefined ||
              printerStatus.flowRate !== undefined ||
              printerStatus.printSpeed !== undefined) && (
              <div className="space-y-1">
                {printerStatus.fanSpeed !== undefined && (
                  <div className="flex justify-between items-center">
                    <span className="text-text-muted text-xs">Fan:</span>
                    <span className="text-text-primary text-xs">
                      {printerStatus.fanSpeed.toFixed(0)}%
                    </span>
                  </div>
                )}
                {printerStatus.flowRate !== undefined && (
                  <div className="flex justify-between items-center">
                    <span className="text-text-muted text-xs">Flow:</span>
                    <span className="text-text-primary text-xs">
                      {printerStatus.flowRate.toFixed(0)}%
                    </span>
                  </div>
                )}
                {printerStatus.printSpeed !== undefined && (
                  <div className="flex justify-between items-center">
                    <span className="text-text-muted text-xs">Speed:</span>
                    <span className="text-text-primary text-xs">
                      {printerStatus.printSpeed.toFixed(1)} mm/s
                    </span>
                  </div>
                )}
              </div>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}

