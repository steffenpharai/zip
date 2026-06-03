"use client";

import type { ScanPoint } from "@/lib/v2/types";
import { Bezel } from "./Bezel";

const MAX_CM = 200; // HC-SR04 usable indoor range
const CX = 100;
const CY = 104;
const MAX_R = 92;

/**
 * Forward-arc radar: the servo-swept ultrasonic plotted in the robot frame
 * (forward = up, servo 90° = straight ahead), plus the IMU heading readout.
 * This is the Phase 5.0 "poor-man's lidar" view.
 */
export function RadarPanel({
  scan,
  yawDeg,
  scanning,
  onToggleScan,
}: {
  scan: ScanPoint[];
  yawDeg: number | null;
  scanning: boolean;
  onToggleScan: (on: boolean) => void;
}) {
  const pts = scan
    .filter((p) => p.distance_cm > 0 && p.distance_cm <= MAX_CM)
    .map((p) => {
      const beta = ((p.angle - 90) * Math.PI) / 180; // + = right of forward
      const r = (p.distance_cm / MAX_CM) * MAX_R;
      return { x: CX + r * Math.sin(beta), y: CY - r * Math.cos(beta), ...p };
    });
  const poly = pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const hdg = yawDeg == null ? null : ((Math.round(yawDeg) % 360) + 360) % 360;

  return (
    <Bezel callsign="NAV // RADAR" meta={`HDG ${hdg == null ? "—" : `${hdg}°`}`} index={5}>
      <div className="p-2.5">
        <svg viewBox="0 0 200 120" className="w-full">
          {/* range rings (50/100/150/200 cm) */}
          {[0.25, 0.5, 0.75, 1].map((f) => (
            <path
              key={f}
              d={arc(CX, CY, MAX_R * f, -90, 90)}
              fill="none"
              stroke="var(--v2-panel-edge)"
              strokeWidth={0.6}
            />
          ))}
          {/* radial spokes every 45° of the forward arc */}
          {[-90, -45, 0, 45, 90].map((deg) => {
            const a = (deg * Math.PI) / 180;
            return (
              <line
                key={deg}
                x1={CX}
                y1={CY}
                x2={CX + MAX_R * Math.sin(a)}
                y2={CY - MAX_R * Math.cos(a)}
                stroke="var(--v2-panel-edge)"
                strokeWidth={0.5}
              />
            );
          })}
          {/* swept profile */}
          {poly && (
            <polyline
              points={poly}
              fill="none"
              stroke="var(--v2-cyan)"
              strokeWidth={1}
              opacity={0.65}
            />
          )}
          {pts.map((p, i) => (
            <circle key={i} cx={p.x} cy={p.y} r={1.8} fill="var(--v2-cyan-bright)" />
          ))}
          {/* robot marker (forward = up) */}
          <polygon
            points={`${CX},${CY - 6} ${CX - 4},${CY + 4} ${CX + 4},${CY + 4}`}
            fill="var(--v2-amber)"
          />
          {/* heading tick: small needle rotated by yaw, top-left */}
          <g transform={`translate(20,20) rotate(${hdg ?? 0})`}>
            <circle r={11} fill="none" stroke="var(--v2-panel-edge)" strokeWidth={0.6} />
            <line x1={0} y1={0} x2={0} y2={-9} stroke="var(--v2-amber)" strokeWidth={1.2} />
          </g>
          <text x={20} y={38} textAnchor="middle" fontSize={5.5} fill="var(--v2-text-mute)" className="zip-label">
            N
          </text>
        </svg>
        <button
          type="button"
          onClick={() => onToggleScan(!scanning)}
          className={`mt-1 w-full zip-label text-[10px] py-1.5 rounded-sm border ${
            scanning
              ? "border-[var(--v2-cyan)] text-[var(--v2-cyan-bright)] bg-[rgba(39,180,205,0.12)]"
              : "border-[var(--v2-panel-edge)] text-[var(--v2-text-dim)] bg-[rgba(8,18,26,0.6)]"
          }`}
        >
          {scanning ? "◉ SWEEPING" : "○ START SWEEP"}
        </button>
      </div>
    </Bezel>
  );
}

// SVG arc path from start to end angle (deg, 0 = up, + = clockwise/right).
function arc(cx: number, cy: number, r: number, a0: number, a1: number): string {
  const p = (deg: number) => {
    const a = (deg * Math.PI) / 180;
    return [cx + r * Math.sin(a), cy - r * Math.cos(a)];
  };
  const [x0, y0] = p(a0);
  const [x1, y1] = p(a1);
  return `M ${x0.toFixed(1)} ${y0.toFixed(1)} A ${r} ${r} 0 0 1 ${x1.toFixed(1)} ${y1.toFixed(1)}`;
}
