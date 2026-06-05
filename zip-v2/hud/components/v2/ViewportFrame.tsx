"use client";

/**
 * Decorative chrome wrapping the 3D viewport: corner brackets, callsign
 * across the top edge, edge tick rails, and scanlines/grain overlay.
 * Visually establishes the "sensor display" framing.
 */
import { Suspense, type ReactNode } from "react";

export function ViewportFrame({
  callsign = "VIEW // WORLD",
  topRight,
  bottomLeft,
  bottomRight,
  children,
}: {
  callsign?: string;
  topRight?: ReactNode;
  bottomLeft?: ReactNode;
  bottomRight?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="relative w-full h-full">
      {/* The actual canvas / viewport content */}
      <div className="absolute inset-0 zip-v2-scanlines zip-v2-grain overflow-hidden">
        <Suspense
          fallback={
            <div className="w-full h-full flex items-center justify-center text-[var(--v2-text-dim)] zip-label">
              INITIALIZING VIEW
            </div>
          }
        >
          {children}
        </Suspense>
      </div>

      {/* large outer corner brackets */}
      <LargeBracket pos="tl" />
      <LargeBracket pos="tr" />
      <LargeBracket pos="bl" />
      <LargeBracket pos="br" />

      {/* edge crosshair ticks */}
      <EdgeTicks />

      {/* TOP EDGE — callsign band */}
      <div className="absolute top-3 left-12 right-12 flex items-center justify-between pointer-events-none">
        <div className="flex items-center gap-3">
          <span className="zip-label text-[10px] text-[var(--v2-cyan)]/85 zip-glow-cyan">
            {callsign}
          </span>
          <span className="h-px w-12 bg-[var(--v2-panel-edge)]" />
        </div>
        <div className="flex items-center gap-3 zip-label text-[10px] text-[var(--v2-text-dim)]">
          {topRight}
        </div>
      </div>

      {/* BOTTOM EDGE — left readouts */}
      <div className="absolute bottom-3 left-12 right-12 flex items-end justify-between pointer-events-none">
        <div className="zip-label text-[10px] text-[var(--v2-text-dim)] flex items-center gap-3">
          {bottomLeft}
        </div>
        <div className="zip-label text-[10px] text-[var(--v2-text-dim)] flex items-center gap-3">
          {bottomRight}
        </div>
      </div>
    </div>
  );
}

function LargeBracket({ pos }: { pos: "tl" | "tr" | "bl" | "br" }) {
  const base = "absolute w-7 h-7 pointer-events-none";
  const orient =
    pos === "tl"
      ? "top-2 left-2 border-l border-t"
      : pos === "tr"
        ? "top-2 right-2 border-r border-t"
        : pos === "bl"
          ? "bottom-2 left-2 border-l border-b"
          : "bottom-2 right-2 border-r border-b";
  return (
    <div
      className={`${base} ${orient}`}
      style={{ borderColor: "var(--v2-cyan)", opacity: 0.6 }}
    />
  );
}

function EdgeTicks() {
  // Small tick marks halfway down each side — a center crosshair
  return (
    <div className="absolute inset-0 pointer-events-none">
      {/* top */}
      <div
        className="absolute top-2 left-1/2 -translate-x-1/2 h-2 w-px"
        style={{ background: "var(--v2-cyan)", opacity: 0.6 }}
      />
      {/* bottom */}
      <div
        className="absolute bottom-2 left-1/2 -translate-x-1/2 h-2 w-px"
        style={{ background: "var(--v2-cyan)", opacity: 0.6 }}
      />
      {/* left */}
      <div
        className="absolute left-2 top-1/2 -translate-y-1/2 w-2 h-px"
        style={{ background: "var(--v2-cyan)", opacity: 0.6 }}
      />
      {/* right */}
      <div
        className="absolute right-2 top-1/2 -translate-y-1/2 w-2 h-px"
        style={{ background: "var(--v2-cyan)", opacity: 0.6 }}
      />
    </div>
  );
}
