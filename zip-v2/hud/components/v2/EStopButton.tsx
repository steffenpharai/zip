"use client";

import { motion } from "framer-motion";

/**
 * Rose octagon E-stop. Geometry conveys "stop" without needing a label.
 * Hover pulses, click flashes, long-press could escalate to ARM mode later.
 */
export function EStopButton({ onStop }: { onStop: () => void }) {
  return (
    <motion.button
      type="button"
      onClick={onStop}
      whileHover={{ scale: 1.025 }}
      whileTap={{ scale: 0.96 }}
      className="relative group block w-full"
      aria-label="Emergency stop"
    >
      <div className="relative aspect-[2.4/1] w-full">
        {/* Octagon outline (stop sign geometry) */}
        <svg
          viewBox="0 0 240 100"
          preserveAspectRatio="xMidYMid meet"
          className="absolute inset-0 w-full h-full"
        >
          <defs>
            <radialGradient id="zest-fill" cx="50%" cy="35%" r="80%">
              <stop offset="0%" stopColor="#FB7185" stopOpacity="0.6" />
              <stop offset="55%" stopColor="#E11D48" stopOpacity="0.65" />
              <stop offset="100%" stopColor="#7F1D1D" stopOpacity="0.55" />
            </radialGradient>
            <linearGradient id="zest-rim" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#FB7185" />
              <stop offset="100%" stopColor="#9F1239" />
            </linearGradient>
            <filter id="zest-blur" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="4" />
            </filter>
          </defs>
          {/* Soft outer halo, pulses on hover via group-hover */}
          <polygon
            points="50,2 190,2 238,30 238,70 190,98 50,98 2,70 2,30"
            fill="#FB7185"
            opacity="0.15"
            filter="url(#zest-blur)"
            className="group-hover:opacity-50 transition-opacity"
          />
          <polygon
            points="50,2 190,2 238,30 238,70 190,98 50,98 2,70 2,30"
            fill="url(#zest-fill)"
            stroke="url(#zest-rim)"
            strokeWidth="2"
          />
          {/* Inner glass bevel */}
          <polygon
            points="58,10 182,10 222,32 222,68 182,90 58,90 18,68 18,32"
            fill="none"
            stroke="rgba(255,255,255,0.18)"
            strokeWidth="1"
          />
          {/* Tick marks on the rim */}
          {[12, 36, 60, 84, 156, 180, 204, 228].map((x) => (
            <line key={x} x1={x} y1="0" x2={x} y2="6" stroke="rgba(255,255,255,0.5)" strokeWidth="0.6" />
          ))}
        </svg>

        {/* Label */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="text-center">
            <div className="zip-label text-[10px] text-rose-100/70 tracking-[0.35em]">
              EMERGENCY
            </div>
            <div className="zip-num font-extrabold text-2xl text-white tracking-[0.3em] zip-glow-rose">
              STOP
            </div>
            <div className="zip-label text-[9px] text-rose-100/55 tracking-[0.3em] mt-0.5">
              ⌧ SPACE
            </div>
          </div>
        </div>
      </div>
    </motion.button>
  );
}
