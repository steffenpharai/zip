"use client";

import { motion, useReducedMotion } from "framer-motion";
import type { CSSProperties, ReactNode } from "react";

/**
 * Panel chrome: hairline border, subtle interior gradient, corner brackets,
 * optional callsign label that sits across the top edge. The cockpit's
 * visual primitive — composed throughout to keep panels feeling like
 * instrument bezels, not browser cards.
 */
export function Bezel({
  callsign,
  meta,
  index,
  children,
  className = "",
  contentClassName = "",
  style,
  noCorners,
}: {
  /** e.g. "TLM // BATTERY" — gets uppercased + tracked */
  callsign?: string;
  /** Right-aligned subtitle e.g. units, range */
  meta?: ReactNode;
  /** For framer stagger on initial reveal */
  index?: number;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  style?: CSSProperties;
  noCorners?: boolean;
}) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      initial={reduced ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.55,
        delay: (index ?? 0) * 0.06,
        ease: [0.22, 1, 0.36, 1],
      }}
      className={`zip-bezel ${className}`}
      style={style}
    >
      {!noCorners && (
        <>
          <span className="zip-corner zip-corner-tl" />
          <span className="zip-corner zip-corner-tr" />
          <span className="zip-corner zip-corner-bl" />
          <span className="zip-corner zip-corner-br" />
        </>
      )}
      {callsign && (
        <div className="flex items-center justify-between px-3 pt-2 pb-1.5">
          <span className="zip-label text-[10px] text-[var(--v2-cyan)]/85">
            {callsign}
          </span>
          {meta && (
            <span className="zip-label text-[10px] text-[var(--v2-text-dim)]">
              {meta}
            </span>
          )}
        </div>
      )}
      <div className={`relative ${contentClassName}`}>{children}</div>
    </motion.div>
  );
}
