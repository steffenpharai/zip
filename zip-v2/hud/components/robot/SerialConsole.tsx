"use client";

/**
 * SerialConsole - Live serial log viewer for robot communication
 * 
 * Displays RX/TX messages with timestamps and auto-scrolling.
 */

import { useEffect, useRef } from "react";

interface SerialLogEntry {
  direction: "rx" | "tx";
  line: string;
  ts: number;
}

interface SerialConsoleProps {
  logs: SerialLogEntry[];
  maxHeight?: number;
}

export default function SerialConsole({
  logs,
  maxHeight = 300,
}: SerialConsoleProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const autoScrollRef = useRef(true);

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (autoScrollRef.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  // Track scroll position to disable auto-scroll when user scrolls up
  const handleScroll = () => {
    if (scrollRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
      autoScrollRef.current = scrollTop + clientHeight >= scrollHeight - 10;
    }
  };

  function formatTimestamp(ts: number): string {
    const date = new Date(ts);
    const hours = date.getHours().toString().padStart(2, "0");
    const minutes = date.getMinutes().toString().padStart(2, "0");
    const seconds = date.getSeconds().toString().padStart(2, "0");
    const ms = date.getMilliseconds().toString().padStart(3, "0");
    return `${hours}:${minutes}:${seconds}.${ms}`;
  }

  return (
    <div className="bg-panel-surface border border-border rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border/50 bg-panel-surface-2">
        <h4 className="text-text-muted text-xs font-semibold uppercase tracking-wide">
          Serial Console
        </h4>
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-online-green" />
            RX
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-accent-cyan" />
            TX
          </span>
        </div>
      </div>

      {/* Log Content */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="overflow-y-auto font-mono text-xs"
        style={{ maxHeight: `${maxHeight}px` }}
      >
        {logs.length === 0 ? (
          <div className="p-3 text-text-muted text-center">
            No serial data yet...
          </div>
        ) : (
          <div className="p-2 space-y-0.5">
            {logs.map((log, index) => (
              <div
                key={`${log.ts}-${index}`}
                className={`flex items-start gap-2 py-0.5 ${
                  log.direction === "rx" ? "text-online-green" : "text-accent-cyan"
                }`}
              >
                <span className="text-text-muted flex-shrink-0 opacity-60">
                  {formatTimestamp(log.ts)}
                </span>
                <span className="flex-shrink-0">
                  {log.direction === "rx" ? ">" : "<"}
                </span>
                <span className="break-all">{log.line}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Status Bar */}
      <div className="flex items-center justify-between px-3 py-1 border-t border-border/50 bg-panel-surface-2 text-xs text-text-muted">
        <span>{logs.length} entries</span>
        {logs.length > 0 && (
          <span>
            Last: {formatTimestamp(logs[logs.length - 1].ts)}
          </span>
        )}
      </div>
    </div>
  );
}

