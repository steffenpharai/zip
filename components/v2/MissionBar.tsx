"use client";

import { fmtHMS, fmtMs } from "@/lib/v2/formats";
import type { ConnectionState } from "@/lib/v2/types";

export function MissionBar({
  connection,
  unoConnected,
  unoPort,
  url,
  protocolVersion,
  serviceVersion,
  fps,
  latencyMs,
  uptimeS,
  wheelsLocked = false,
  onReconnect,
}: {
  connection: ConnectionState;
  unoConnected: boolean;
  unoPort: string;
  url: string;
  protocolVersion: string;
  serviceVersion: string;
  fps: number;
  latencyMs: number | null;
  uptimeS: number;
  wheelsLocked?: boolean;
  onReconnect: () => void;
}) {
  const conn = describeConnection(connection);
  return (
    <header className="relative h-12 px-4 flex items-center gap-6 border-b border-[var(--v2-panel-edge)] bg-[rgba(5,11,17,0.7)] backdrop-blur-md">
      {/* Wordmark + version */}
      <div className="flex items-baseline gap-3 select-none">
        <span
          className="font-extrabold text-[15px] text-[var(--v2-cyan-bright)] zip-glow-cyan zip-num"
          style={{ letterSpacing: "0.4em", paddingLeft: "0.2em" }}
        >
          ZIP
        </span>
        <span className="zip-label text-[10px] text-[var(--v2-text-dim)]">
          V2 · OPERATOR CONSOLE
        </span>
      </div>

      <Sep />

      {/* Connection */}
      <Block label="LINK">
        <span className="flex items-center gap-2">
          <span
            className={`zip-pulse-dot inline-block w-1.5 h-1.5 rounded-full`}
            style={{ background: conn.color, boxShadow: `0 0 8px ${conn.color}` }}
          />
          <span className="zip-num text-[12px]" style={{ color: conn.text }}>
            {conn.label}
          </span>
        </span>
      </Block>

      <Block label="UNO">
        <span
          className="zip-num text-[12px]"
          style={{ color: unoConnected ? "var(--v2-green)" : "var(--v2-rose)" }}
        >
          {unoConnected ? unoPort || "ATTACHED" : "DETACHED"}
        </span>
      </Block>

      <Block label="PROTO">
        <span className="zip-num text-[12px] text-[var(--v2-text)]">
          {protocolVersion || "—"}
          <span className="text-[var(--v2-text-mute)] ml-1">/ {serviceVersion || "—"}</span>
        </span>
      </Block>

      {/* spacer */}
      <div className="flex-1" />

      <Block label="MODE">
        {wheelsLocked ? (
          <span
            className="zip-num text-[12px] font-bold text-[var(--v2-rose)]"
            style={{ textShadow: "0 0 8px var(--v2-rose)" }}
          >
            ⊘ WHEELS LOCKED
          </span>
        ) : (
          <span className="zip-num text-[12px] text-[var(--v2-amber)] zip-glow-amber">
            MANUAL
          </span>
        )}
      </Block>

      <Block label="RTT">
        <span className="zip-num text-[12px] text-[var(--v2-text)]">
          {fmtMs(latencyMs)} <span className="text-[10px] text-[var(--v2-text-mute)]">ms</span>
        </span>
      </Block>

      <Block label="FPS">
        <span className="zip-num text-[12px] text-[var(--v2-text)]">
          {fps > 0 ? Math.round(fps) : "—"}
        </span>
      </Block>

      <Block label="UP">
        <span className="zip-num text-[12px] text-[var(--v2-text)]">{fmtHMS(uptimeS)}</span>
      </Block>

      <Sep />

      <button
        type="button"
        onClick={onReconnect}
        className="zip-label text-[10px] text-[var(--v2-cyan)] hover:text-[var(--v2-cyan-bright)] border border-[var(--v2-panel-edge)] hover:border-[var(--v2-cyan)] px-2 py-1 rounded-sm"
        title={url}
      >
        ↻ RECONNECT
      </button>
    </header>
  );
}

function Block({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col leading-tight">
      <span className="zip-label text-[9px] text-[var(--v2-text-mute)]">{label}</span>
      <span className="leading-none">{children}</span>
    </div>
  );
}

function Sep() {
  return (
    <span
      className="h-7 w-px"
      style={{ background: "var(--v2-panel-edge)" }}
      aria-hidden
    />
  );
}

function describeConnection(c: ConnectionState) {
  switch (c) {
    case "open":
      return { label: "ONLINE", color: "#2EE59D", text: "#2EE59D" };
    case "connecting":
      return { label: "CONNECTING", color: "#F59E0B", text: "#F59E0B" };
    case "reconnecting":
      return { label: "RECONNECT", color: "#F59E0B", text: "#F59E0B" };
    case "closed":
      return { label: "OFFLINE", color: "#6F8E9B", text: "#A7C6D3" };
    case "error":
      return { label: "ERROR", color: "#FB7185", text: "#FB7185" };
  }
}
