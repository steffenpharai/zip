"use client";

import { batteryPercent } from "@/lib/v2/formats";
import { Sparkline } from "./Sparkline";

/**
 * 180° phosphor arc gauge. Custom SVG — feels analog/instrumental, the
 * needle settles toward target without a giant easing curve (cockpit
 * instruments don't bounce).
 *
 * The arc is split into three colored zones (rose, amber, green) representing
 * battery health, and the needle is a triangle drawn from the center pivot.
 */
export function BatteryGauge({
  mv,
  series,
  width = 248,
}: {
  mv: number | null;
  series: number[];
  width?: number;
}) {
  const height = Math.round(width * 0.66);
  const cx = width / 2;
  const cy = height - 8;
  const r = (width - 32) / 2;
  const pct = batteryPercent(mv) ?? 0;

  // Arc geometry: 180° arc from west (-180°) to east (0°).
  const arcWidth = 14;
  const inner = r - arcWidth;

  // Needle angle: pct 0..100 → -180° (left) .. 0° (right)
  const angleDeg = -180 + (pct / 100) * 180;
  const angleRad = (angleDeg * Math.PI) / 180;
  const nx = cx + r * 0.92 * Math.cos(angleRad);
  const ny = cy + r * 0.92 * Math.sin(angleRad);

  const volts = mv != null ? (mv / 1000).toFixed(2) : "—";
  const pctText = mv != null ? Math.round(pct).toString() : "—";

  const tier = pct >= 35 ? "ok" : pct >= 15 ? "caution" : "critical";
  const tierColor =
    tier === "ok"
      ? "var(--v2-green)"
      : tier === "caution"
        ? "var(--v2-amber)"
        : "var(--v2-rose)";

  return (
    <div className="px-3 pb-3 pt-1">
      <svg viewBox={`0 0 ${width} ${height + 8}`} width="100%" height={height + 8}>
        <defs>
          <linearGradient id="zbg-track" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="var(--v2-rose)" stopOpacity="0.6" />
            <stop offset="35%" stopColor="var(--v2-amber)" stopOpacity="0.5" />
            <stop offset="70%" stopColor="var(--v2-green)" stopOpacity="0.55" />
          </linearGradient>
          <linearGradient id="zbg-glow" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={tierColor} stopOpacity="0.95" />
            <stop offset="100%" stopColor={tierColor} stopOpacity="0.4" />
          </linearGradient>
          <filter id="zbg-blur" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2.2" />
          </filter>
        </defs>

        {/* outer hairline arc */}
        <path
          d={arcPath(cx, cy, r + 1, -180, 0)}
          stroke="rgba(60, 180, 220, 0.18)"
          strokeWidth={1}
          fill="none"
        />

        {/* zone arc */}
        <path
          d={arcPath(cx, cy, r - arcWidth / 2, -180, 0)}
          stroke="url(#zbg-track)"
          strokeWidth={arcWidth}
          fill="none"
          strokeLinecap="butt"
          opacity={0.55}
        />

        {/* active fill — from start to current percent */}
        <path
          d={arcPath(cx, cy, r - arcWidth / 2, -180, angleDeg)}
          stroke="url(#zbg-glow)"
          strokeWidth={arcWidth}
          fill="none"
          strokeLinecap="butt"
          filter="url(#zbg-blur)"
          opacity={0.85}
        />
        <path
          d={arcPath(cx, cy, r - arcWidth / 2, -180, angleDeg)}
          stroke={tierColor}
          strokeWidth={arcWidth}
          fill="none"
          strokeLinecap="butt"
          opacity={0.9}
        />

        {/* tick marks every 10% */}
        {Array.from({ length: 11 }).map((_, i) => {
          const ang = (-180 + (i / 10) * 180) * (Math.PI / 180);
          const x1 = cx + (inner - 2) * Math.cos(ang);
          const y1 = cy + (inner - 2) * Math.sin(ang);
          const x2 = cx + (inner - 6) * Math.cos(ang);
          const y2 = cy + (inner - 6) * Math.sin(ang);
          return (
            <line
              key={i}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke="rgba(60, 180, 220, 0.5)"
              strokeWidth={i % 5 === 0 ? 1.6 : 0.8}
            />
          );
        })}

        {/* needle */}
        <g
          style={{
            transition: "transform 220ms cubic-bezier(0.22,1,0.36,1)",
            transformOrigin: `${cx}px ${cy}px`,
          }}
        >
          <line
            x1={cx}
            y1={cy}
            x2={nx}
            y2={ny}
            stroke={tierColor}
            strokeWidth={2}
            strokeLinecap="round"
          />
          <line
            x1={cx}
            y1={cy}
            x2={nx}
            y2={ny}
            stroke={tierColor}
            strokeWidth={6}
            strokeLinecap="round"
            opacity={0.25}
            filter="url(#zbg-blur)"
          />
          <circle cx={cx} cy={cy} r={5} fill="var(--v2-bg-rim)" stroke={tierColor} />
          <circle cx={cx} cy={cy} r={2.2} fill={tierColor} />
        </g>

        {/* center numeric */}
        <text
          x={cx}
          y={cy - r * 0.55}
          textAnchor="middle"
          className="zip-num"
          fontSize="22"
          fontWeight="700"
          fill="var(--v2-text)"
        >
          {volts}
          <tspan fontSize="11" fill="var(--v2-text-dim)" dx="2">V</tspan>
        </text>
        <text
          x={cx}
          y={cy - r * 0.55 + 14}
          textAnchor="middle"
          className="zip-num"
          fontSize="10"
          fill="var(--v2-text-dim)"
        >
          {pctText}% · {tier.toUpperCase()}
        </text>
      </svg>

      <div className="mt-2 flex items-center justify-between">
        <span className="zip-label text-[9px] text-[var(--v2-text-mute)]">
          Trend · 32 s
        </span>
        <Sparkline series={series} width={120} height={24} stroke={tierColor} fillOpacity={0.18} />
      </div>
    </div>
  );
}

/** Polar arc path (SVG) — angles in degrees. */
function arcPath(cx: number, cy: number, r: number, a0: number, a1: number) {
  const rad = Math.PI / 180;
  const x0 = cx + r * Math.cos(a0 * rad);
  const y0 = cy + r * Math.sin(a0 * rad);
  const x1 = cx + r * Math.cos(a1 * rad);
  const y1 = cy + r * Math.sin(a1 * rad);
  const large = Math.abs(a1 - a0) > 180 ? 1 : 0;
  const sweep = a1 > a0 ? 1 : 0;
  return `M${x0.toFixed(2)},${y0.toFixed(2)} A${r.toFixed(2)},${r.toFixed(2)} 0 ${large} ${sweep} ${x1.toFixed(2)},${y1.toFixed(2)}`;
}
