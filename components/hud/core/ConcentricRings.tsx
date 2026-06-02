"use client";

import { motion } from "framer-motion";
import { ZIP_MODES, type ZipMode } from "@/lib/constants";

interface ConcentricRingsProps {
  mode: ZipMode;
}

const ringConfigs = [
  { radius: 120, strokeWidth: 2, opacity: 0.3 },
  { radius: 100, strokeWidth: 1.5, opacity: 0.4 },
  { radius: 80, strokeWidth: 1, opacity: 0.5 },
];

export default function ConcentricRings({ mode }: ConcentricRingsProps) {
  const getAnimationProps = () => {
    switch (mode) {
      case ZIP_MODES.IDLE:
        return {
          animate: { scale: [1, 1.02, 1] },
          transition: { duration: 3, repeat: Infinity, ease: "easeInOut" },
        };
      case ZIP_MODES.WAKE_LISTEN:
        return {
          animate: { rotate: [0, 360] },
          transition: { duration: 20, repeat: Infinity, ease: "linear" },
        };
      case ZIP_MODES.LISTENING:
        return {
          animate: { scale: [1, 1.05, 1] },
          transition: { duration: 1.5, repeat: Infinity, ease: "easeInOut" },
        };
      case ZIP_MODES.THINKING:
        return {
          animate: { rotate: [0, 360] },
          transition: { duration: 8, repeat: Infinity, ease: "linear" },
        };
      case ZIP_MODES.TOOL_RUNNING:
        return {
          animate: { scale: [1, 1.03, 1] },
          transition: { duration: 1, repeat: Infinity, ease: "easeInOut" },
        };
      case ZIP_MODES.SPEAKING:
        return {
          animate: { scale: [1, 1.04, 1] },
          transition: { duration: 0.8, repeat: Infinity, ease: "easeInOut" },
        };
      case ZIP_MODES.ERROR:
        return {
          animate: { scale: [1, 1.02, 1], opacity: [0.5, 0.8, 0.5] },
          transition: { duration: 1, repeat: Infinity, ease: "easeInOut" },
        };
      default:
        return {};
    }
  };

  const isError = mode === ZIP_MODES.ERROR;
  const ringColor = isError ? "#ef4444" : "#27B4CD";

  return (
    <div className="relative w-64 h-64">
      <svg
        className="absolute inset-0 w-full h-full"
        viewBox="0 0 240 240"
        style={{ filter: "drop-shadow(0 0 8px rgba(39, 180, 205, 0.3))" }}
      >
        {ringConfigs.map((config, index) => (
          <motion.circle
            key={index}
            cx="120"
            cy="120"
            r={config.radius}
            fill="none"
            stroke={ringColor}
            strokeWidth={config.strokeWidth}
            opacity={config.opacity}
            {...getAnimationProps()}
            style={{
              transformOrigin: "120px 120px",
            }}
          />
        ))}
      </svg>
    </div>
  );
}

