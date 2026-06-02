"use client";

import type { ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";

/**
 * Cockpit layout shell. Fixed viewport, no scrolling.
 *
 *   ┌───────────────────────────────────────────────┐
 *   │ MISSION BAR (h-12)                            │
 *   ├───────┬───────────────────────────────┬───────┤
 *   │       │                               │       │
 *   │ left  │           center (hero)       │ right │
 *   │       │                               │       │
 *   ├───────┴───────────────────────────────┴───────┤
 *   │ bottom event/UART rail (~200px)               │
 *   └───────────────────────────────────────────────┘
 *
 * Uses `minmax(0, 1fr)` on the flexible row + column so children can SHRINK
 * below their natural size (critical for the 3D canvas and the aspect-video
 * camera stub on ultrawide monitors).
 */
export function HudShell({
  mission,
  left,
  center,
  right,
  bottom,
}: {
  mission: ReactNode;
  left: ReactNode;
  center: ReactNode;
  right: ReactNode;
  bottom: ReactNode;
}) {
  const reduced = useReducedMotion();
  return (
    <div
      className="w-full text-[var(--v2-text)] flex flex-col overflow-hidden"
      style={{ height: "100vh" }}
    >
      <motion.div
        initial={reduced ? false : { opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        className="shrink-0"
      >
        {mission}
      </motion.div>

      <main
        className="flex-1 grid gap-3 p-3 min-h-0"
        style={{
          gridTemplateColumns: "minmax(260px, 320px) minmax(0, 1fr) minmax(320px, 380px)",
          gridTemplateRows: "minmax(0, 1fr) minmax(170px, 200px)",
          gridTemplateAreas: `
            "left center right"
            "bottom bottom bottom"
          `,
        }}
      >
        <section
          style={{ gridArea: "left" }}
          className="min-h-0 overflow-y-auto pr-1 [scrollbar-width:thin]"
        >
          {left}
        </section>
        <section
          style={{ gridArea: "center" }}
          className="min-h-0 min-w-0 flex flex-col gap-3"
        >
          {center}
        </section>
        <section
          style={{ gridArea: "right" }}
          className="min-h-0 overflow-y-auto pr-1 [scrollbar-width:thin]"
        >
          {right}
        </section>
        <section style={{ gridArea: "bottom" }} className="min-h-0 min-w-0">
          {bottom}
        </section>
      </main>
    </div>
  );
}
