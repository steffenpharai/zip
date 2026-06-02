"use client";

import type { ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";

/**
 * Cockpit layout shell. Top mission bar (fixed), left telemetry stack,
 * center viewport (3D + camera), right command stack, bottom event log.
 *
 * Uses CSS grid with named areas so the layout cleanly reflows below 1280px.
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
    <div className="min-h-screen w-full text-[var(--v2-text)] flex flex-col">
      <motion.div
        initial={reduced ? false : { opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      >
        {mission}
      </motion.div>

      <main className="flex-1 grid gap-3 p-3"
        style={{
          gridTemplateColumns: "minmax(280px, 320px) 1fr minmax(320px, 380px)",
          gridTemplateRows: "1fr minmax(170px, 200px)",
          gridTemplateAreas: `
            "left center right"
            "bottom bottom bottom"
          `,
          minHeight: "calc(100vh - 48px)",
        }}
      >
        <section style={{ gridArea: "left" }} className="min-h-0">
          {left}
        </section>
        <section style={{ gridArea: "center" }} className="min-h-0 flex flex-col gap-3">
          {center}
        </section>
        <section style={{ gridArea: "right" }} className="min-h-0">
          {right}
        </section>
        <section style={{ gridArea: "bottom" }} className="min-h-0">
          {bottom}
        </section>
      </main>
    </div>
  );
}
