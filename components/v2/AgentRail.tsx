"use client";

import { Bezel } from "./Bezel";

/**
 * Phase 5+ agent thread placeholder — visible chrome only.
 */
export function AgentRail() {
  return (
    <Bezel callsign="AGT // STDBY" meta="PHASE 5" index={7}>
      <div className="p-3 space-y-2">
        <Row from="zip" body="Awaiting cognitive layer initialization." />
        <Row from="op" body="—" muted />
      </div>
    </Bezel>
  );
}

function Row({
  from,
  body,
  muted,
}: {
  from: "zip" | "op";
  body: string;
  muted?: boolean;
}) {
  return (
    <div className="flex items-start gap-2">
      <span
        className="zip-label text-[9px] mt-0.5"
        style={{ color: from === "zip" ? "var(--v2-cyan)" : "var(--v2-green)" }}
      >
        {from === "zip" ? "ZIP" : "OP"}
      </span>
      <span
        className={`zip-code text-[11px] ${muted ? "text-[var(--v2-text-mute)]" : "text-[var(--v2-text)]"}`}
      >
        {body}
      </span>
    </div>
  );
}
