"use client";

import { rangeTier } from "@/lib/v2/formats";
import { Sparkline } from "./Sparkline";

/**
 * Horizontal ranging bar — zoned phosphor (red/amber/green) with a
 * floating chevron indicator showing live distance. Inspired by sonar/lidar
 * range displays.
 */
export function UltrasonicRange({
  cm,
  series,
  max = 200,
}: {
  cm: number | null;
  series: number[];
  /** Right-edge of the display in cm. Default 200cm = 2m. */
  max?: number;
}) {
  const tier = rangeTier(cm);
  const tierColor =
    tier === "ok"
      ? "var(--v2-green)"
      : tier === "caution"
        ? "var(--v2-amber)"
        : tier === "critical"
          ? "var(--v2-rose)"
          : "var(--v2-text-dim)";

  const pct = cm == null ? 0 : Math.min(1, cm / max);
  const cmStr = cm == null ? "—" : `${cm}`;

  return (
    <div className="px-3 pb-3 pt-1">
      <div className="flex items-baseline justify-between">
        <span className="zip-num text-[28px] font-bold text-[var(--v2-text)] tracking-tight">
          {cmStr}
          <span className="zip-label text-[10px] text-[var(--v2-text-dim)] ml-1">
            CM
          </span>
        </span>
        <span
          className="zip-label text-[10px]"
          style={{ color: tierColor }}
        >
          {tier === "unknown" ? "NO SIGNAL" : tier === "ok" ? "CLEAR" : tier === "caution" ? "NEARFIELD" : "CRITICAL"}
        </span>
      </div>

      {/* Range bar */}
      <div className="mt-2 relative h-7">
        {/* base + zones */}
        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-2 zip-track rounded-sm" />

        {/* tick rail */}
        <div className="absolute inset-x-0 top-0 h-3 zip-tick-rail" />
        {/* labels under ticks */}
        <div className="absolute inset-x-0 bottom-0 h-3 flex justify-between zip-num text-[9px] text-[var(--v2-text-mute)]">
          <span>0</span>
          <span>{Math.round(max / 4)}</span>
          <span>{Math.round(max / 2)}</span>
          <span>{Math.round((3 * max) / 4)}</span>
          <span>{max}</span>
        </div>

        {/* Indicator chevron */}
        {cm != null && (
          <div
            className="absolute top-1/2 -translate-y-1/2"
            style={{
              left: `${(pct * 100).toFixed(2)}%`,
              transition: "left 180ms ease-out",
            }}
          >
            <svg width="16" height="20" viewBox="0 0 16 20" style={{ transform: "translate(-50%, 0)" }}>
              <polygon
                points="8,2 14,10 8,18 2,10"
                fill={tierColor}
                stroke={tierColor}
                strokeWidth="1"
                opacity="0.95"
              />
              <polygon
                points="8,4 12,10 8,16 4,10"
                fill="var(--v2-bg-rim)"
              />
            </svg>
          </div>
        )}
      </div>

      <div className="mt-2 flex items-center justify-between">
        <span className="zip-label text-[9px] text-[var(--v2-text-mute)]">
          Trend
        </span>
        <Sparkline
          series={series}
          width={140}
          height={22}
          stroke={tierColor}
          fillOpacity={0.18}
          min={0}
          max={max}
        />
      </div>
    </div>
  );
}
