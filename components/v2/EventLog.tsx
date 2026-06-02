"use client";

import { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import type { UnoRawMsg } from "@/lib/v2/types";
import type { CockpitEvent } from "@/lib/v2/useEventLog";

import { Bezel } from "./Bezel";

const KIND_COLOR: Record<CockpitEvent["kind"], string> = {
  info: "var(--v2-cyan)",
  warn: "var(--v2-amber)",
  crit: "var(--v2-rose)",
  cmd: "var(--v2-green)",
  link: "var(--v2-cyan-bright)",
};

export function EventLog({
  events,
  rawLog,
}: {
  events: CockpitEvent[];
  rawLog: UnoRawMsg[];
}) {
  return (
    <div className="grid grid-cols-5 gap-3 h-full">
      <div className="col-span-3">
        <Bezel callsign="LOG // EVENTS" meta="LAST 24" index={5}>
          <Timeline events={events} />
        </Bezel>
      </div>
      <div className="col-span-2">
        <Bezel callsign="LOG // UART" meta="115200 · /dev/ttyUSB0" index={6}>
          <UartConsole rawLog={rawLog} />
        </Bezel>
      </div>
    </div>
  );
}

function Timeline({ events }: { events: CockpitEvent[] }) {
  if (events.length === 0) {
    return (
      <div className="px-3 py-5 zip-label text-[10px] text-[var(--v2-text-mute)]">
        Awaiting telemetry…
      </div>
    );
  }
  return (
    <div className="flex flex-row-reverse gap-2 px-3 py-2 overflow-x-auto">
      {events
        .slice()
        .reverse()
        .map((e, i) => (
          <motion.div
            key={`${e.ts}-${i}`}
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="shrink-0 min-w-[140px] px-2 py-1.5 rounded-sm border"
            style={{
              borderColor: "var(--v2-panel-edge)",
              background: "rgba(8,18,26,0.65)",
            }}
          >
            <div className="flex items-center justify-between leading-none">
              <span
                className="zip-label text-[9px]"
                style={{ color: KIND_COLOR[e.kind] }}
              >
                {e.kind.toUpperCase()}
              </span>
              <span className="zip-num text-[10px] text-[var(--v2-text-mute)]">
                {formatRelative(e.ts)}
              </span>
            </div>
            <div className="zip-code text-[11px] text-[var(--v2-text)] mt-1 break-all">
              {e.text}
            </div>
          </motion.div>
        ))}
    </div>
  );
}

function formatRelative(ts: number) {
  const dt = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (dt < 60) return `${dt}s`;
  return `${Math.floor(dt / 60)}m`;
}

function UartConsole({ rawLog }: { rawLog: UnoRawMsg[] }) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [rawLog.length]);

  return (
    <div className="p-2.5">
      <div
        ref={ref}
        className="zip-code text-[11px] leading-tight h-32 overflow-y-auto rounded-sm border border-[var(--v2-panel-edge)] bg-[rgba(5,11,17,0.9)] p-2"
      >
        {rawLog.length === 0 && (
          <div className="text-[var(--v2-text-mute)]">— no traffic —</div>
        )}
        {rawLog.map((m, i) => (
          <div
            key={i}
            className={
              m.direction === "in"
                ? "text-[var(--v2-green)]"
                : "text-[var(--v2-cyan-bright)]"
            }
          >
            <span className="text-[var(--v2-text-mute)] mr-1">
              {m.direction === "in" ? "‹" : "›"}
            </span>
            <span className="break-all">{m.line}</span>
          </div>
        ))}
        <span className="zip-caret inline-block w-1.5 h-3 ml-0.5 align-text-bottom bg-[var(--v2-cyan)]" />
      </div>
    </div>
  );
}
