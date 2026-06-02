"use client";

import { Bezel } from "./Bezel";

/**
 * "No signal" camera surface. Phase 3 wires the live MJPEG stream from the
 * Jetson here.
 */
export function CameraFeed() {
  return (
    <Bezel
      callsign="CAM // BOW"
      meta="640×480 · 30FPS · STUB"
      index={3}
      className="overflow-hidden"
    >
      <div className="relative aspect-video zip-v2-scanlines zip-v2-grain zip-hatch">
        {/* SMPTE-ish color bars (subtle) hint at "no signal" */}
        <div className="absolute inset-0 flex">
          {["#0E1B25", "#0F2030", "#0A1822", "#101C28", "#0B1620", "#0D1E2A", "#091621"].map(
            (c, i) => (
              <div key={i} className="flex-1" style={{ background: c }} />
            ),
          )}
        </div>
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center">
            <div className="zip-label text-[10px] text-[var(--v2-text-mute)] mb-1">
              NO VIDEO SIGNAL
            </div>
            <div className="zip-num text-[11px] text-[var(--v2-text-dim)]">
              CAMERA PIPELINE · PHASE 3
            </div>
          </div>
        </div>
        {/* recording dot (faked off) */}
        <div className="absolute top-2 left-2 flex items-center gap-1.5 zip-label text-[9px] text-[var(--v2-text-mute)]">
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--v2-text-mute)]" />
          STBY
        </div>
        <div className="absolute top-2 right-2 zip-num text-[9px] text-[var(--v2-text-mute)]">
          00:00:00:00
        </div>
      </div>
    </Bezel>
  );
}
