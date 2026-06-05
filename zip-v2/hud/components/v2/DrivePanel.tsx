"use client";

import type { ClientMessage } from "@/lib/v2/types";
import { DRIVE_SPEED_V, DRIVE_SPEED_W } from "@/lib/v2/useDriveTick";
import { Bezel } from "./Bezel";
import { EStopButton } from "./EStopButton";
import { Joystick } from "./Joystick";
import { WasdGlyph } from "./WasdGlyph";

type Axes = { v: number; w: number };
type Keys = { up: boolean; down: boolean; left: boolean; right: boolean };

export function DrivePanel({
  axes,
  keys,
  onJoystick,
  onStop,
  send,
}: {
  axes: Axes;
  keys: Keys;
  onJoystick: (a: Axes) => void;
  onStop: () => void;
  send: (m: ClientMessage) => void;
}) {
  const vp = Math.round(axes.v * DRIVE_SPEED_V);
  const wp = Math.round(axes.w * DRIVE_SPEED_W);
  const speedPct = Math.round(Math.hypot(axes.v, axes.w) * 100);

  return (
    <aside className="flex flex-col gap-3">
      <Bezel callsign="CMD // MANUAL" meta="WASD · ARROW · STICK" index={2}>
        <div className="p-3 flex flex-col items-center gap-3">
          <Joystick onChange={onJoystick} axes={axes} size={208} />
          <WasdGlyph keys={keys} />
          <div className="w-full grid grid-cols-3 gap-1.5 mt-1">
            <Readout label="V" value={vp} sub={`/${DRIVE_SPEED_V}`} />
            <Readout label="ω" value={wp} sub={`/${DRIVE_SPEED_W}`} />
            <Readout label="MAG" value={speedPct} sub="%" />
          </div>
        </div>
      </Bezel>

      <Bezel callsign="CMD // MACRO" meta="N=210" index={3}>
        <div className="p-3 grid grid-cols-2 gap-2">
          <MacroBtn label="FIG-8" id={1} send={send} />
          <MacroBtn label="SPIN 360°" id={2} send={send} />
          <MacroBtn label="WIGGLE" id={3} send={send} />
          <MacroBtn label="STEP FWD" id={4} send={send} />
        </div>
      </Bezel>

      <Bezel callsign="SAFE // ESTOP" meta="N=201" noCorners index={4}>
        <div className="p-3">
          <EStopButton onStop={onStop} />
        </div>
      </Bezel>
    </aside>
  );
}

function Readout({ label, value, sub }: { label: string; value: number; sub?: string }) {
  return (
    <div className="border border-[var(--v2-panel-edge)] bg-[rgba(8,18,26,0.65)] rounded-sm px-2 py-1.5">
      <div className="zip-label text-[9px] text-[var(--v2-text-mute)]">{label}</div>
      <div className="zip-num text-base font-medium text-[var(--v2-text)] flex items-baseline gap-0.5">
        {String(value).padStart(4, " ")}
        {sub && <span className="zip-num text-[10px] text-[var(--v2-text-dim)]">{sub}</span>}
      </div>
    </div>
  );
}

function MacroBtn({
  label,
  id,
  send,
}: {
  label: string;
  id: 1 | 2 | 3 | 4;
  send: (m: ClientMessage) => void;
}) {
  return (
    <button
      type="button"
      onClick={() =>
        send({
          type: "macro",
          macro_id: id,
          intensity: 200,
          ttl_ms: 5000,
        })
      }
      className="zip-label text-[10px] text-[var(--v2-text-dim)] border border-[var(--v2-panel-edge)] bg-[rgba(8,18,26,0.6)] hover:bg-[rgba(39,180,205,0.12)] hover:text-[var(--v2-cyan-bright)] hover:border-[var(--v2-cyan)] py-2 px-2 rounded-sm"
    >
      {label}
    </button>
  );
}
