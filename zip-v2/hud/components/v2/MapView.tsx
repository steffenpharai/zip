"use client";

import type { MapState } from "@/lib/v2/useMap";

const W = 1000;
const H = 700;
const PAD = 50;

/**
 * Top-down occupancy map (Phase 5.1): occupied cells from the servo-swept
 * ultrasonic, plus the dead-reckoned robot pose. Auto-fits to the mapped
 * extent. World frame is Y-up; SVG is Y-down, so we flip.
 *
 * This is the live "the room builds as you drive" view — the seed for the
 * trajectory planner (5.2). Dense/visual reconstruction comes in 5.3.
 */
export function MapView({
  map,
  path = [],
  goal = null,
  onPick,
}: {
  map: MapState;
  path?: [number, number][];
  goal?: [number, number] | null;
  /** Click-to-set-goal: called with world (x,y) metres. */
  onPick?: (x: number, y: number) => void;
}) {
  const { occupied, cellM, pose } = map;

  // World extent from occupied cells + robot, with padding; sane default if empty.
  let minX = pose ? pose.x : 0;
  let maxX = minX;
  let minY = pose ? pose.y : 0;
  let maxY = minY;
  for (const [cx, cy] of occupied) {
    const wx = cx * cellM;
    const wy = cy * cellM;
    if (wx < minX) minX = wx;
    if (wx > maxX) maxX = wx;
    if (wy < minY) minY = wy;
    if (wy > maxY) maxY = wy;
  }
  const m = 0.6; // metre margin
  minX -= m; maxX += m; minY -= m; maxY += m;
  const spanX = Math.max(0.5, maxX - minX);
  const spanY = Math.max(0.5, maxY - minY);
  const scale = Math.min((W - 2 * PAD) / spanX, (H - 2 * PAD) / spanY);

  const sx = (wx: number) => PAD + (wx - minX) * scale;
  const sy = (wy: number) => H - (PAD + (wy - minY) * scale); // flip Y
  const cellPx = Math.max(2, cellM * scale);

  const empty = occupied.length === 0 && !pose;

  const handleClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!onPick) return;
    const svg = e.currentTarget;
    const ctm = svg.getScreenCTM();
    if (!ctm) return;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const v = pt.matrixTransform(ctm.inverse()); // → viewBox coords
    onPick(minX + (v.x - PAD) / scale, minY + (H - v.y - PAD) / scale);
  };

  return (
    <div className="w-full h-full flex items-center justify-center bg-[#050B11]">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-full"
        preserveAspectRatio="xMidYMid meet"
        onClick={handleClick}
        style={{ cursor: onPick ? "crosshair" : "default" }}
      >
        {/* faint world grid every 0.5 m */}
        <Grid minX={minX} maxX={maxX} minY={minY} maxY={maxY} sx={sx} sy={sy} />

        {/* planned path */}
        {path.length > 1 && (
          <polyline
            points={path.map(([wx, wy]) => `${sx(wx).toFixed(1)},${sy(wy).toFixed(1)}`).join(" ")}
            fill="none"
            stroke="var(--v2-green)"
            strokeWidth={2}
            strokeDasharray="6 4"
            opacity={0.9}
          />
        )}
        {goal && (
          <g transform={`translate(${sx(goal[0])},${sy(goal[1])})`}>
            <circle r={7} fill="none" stroke="var(--v2-green)" strokeWidth={1.5} />
            <line x1={-9} y1={0} x2={9} y2={0} stroke="var(--v2-green)" strokeWidth={1} />
            <line x1={0} y1={-9} x2={0} y2={9} stroke="var(--v2-green)" strokeWidth={1} />
          </g>
        )}

        {/* occupied cells */}
        {occupied.map(([cx, cy], i) => (
          <rect
            key={i}
            x={sx((cx + 0.5) * cellM) - cellPx / 2}
            y={sy((cy + 0.5) * cellM) - cellPx / 2}
            width={cellPx}
            height={cellPx}
            fill="var(--v2-cyan)"
            opacity={0.85}
          />
        ))}

        {/* origin crosshair */}
        <g stroke="var(--v2-text-mute)" strokeWidth={0.8} opacity={0.5}>
          <line x1={sx(0) - 6} y1={sy(0)} x2={sx(0) + 6} y2={sy(0)} />
          <line x1={sx(0)} y1={sy(0) - 6} x2={sx(0)} y2={sy(0) + 6} />
        </g>

        {/* robot pose */}
        {pose && (
          <g transform={`translate(${sx(pose.x)},${sy(pose.y)}) rotate(${(-pose.theta * 180) / Math.PI})`}>
            <circle r={Math.max(6, 0.12 * scale)} fill="rgba(245,158,11,0.18)" stroke="var(--v2-amber)" strokeWidth={1} />
            {/* heading wedge (up = forward in robot frame; rotated by -theta for screen) */}
            <polygon
              points={`0,${-Math.max(10, 0.18 * scale)} ${-6},6 6,6`}
              fill="var(--v2-amber)"
            />
          </g>
        )}

        {empty && (
          <text x={W / 2} y={H / 2} textAnchor="middle" fontSize={16} fill="var(--v2-text-mute)" className="zip-label">
            AWAITING POSE + SWEEP — enable RADAR sweep + drive to map
          </text>
        )}

        {/* scale bar */}
        <g>
          <line x1={PAD} y1={H - 18} x2={PAD + scale * 0.5} y2={H - 18} stroke="var(--v2-text-dim)" strokeWidth={1.5} />
          <text x={PAD} y={H - 24} fontSize={11} fill="var(--v2-text-mute)" className="zip-num">
            0.5 m
          </text>
        </g>
      </svg>
    </div>
  );
}

function Grid({
  minX, maxX, minY, maxY, sx, sy,
}: {
  minX: number; maxX: number; minY: number; maxY: number;
  sx: (w: number) => number; sy: (w: number) => number;
}) {
  const lines: React.ReactNode[] = [];
  const step = 0.5;
  const x0 = Math.ceil(minX / step) * step;
  for (let x = x0; x <= maxX; x += step) {
    lines.push(<line key={`vx${x}`} x1={sx(x)} y1={sy(minY)} x2={sx(x)} y2={sy(maxY)} stroke="var(--v2-panel-edge)" strokeWidth={0.4} opacity={0.4} />);
  }
  const y0 = Math.ceil(minY / step) * step;
  for (let y = y0; y <= maxY; y += step) {
    lines.push(<line key={`hy${y}`} x1={sx(minX)} y1={sy(y)} x2={sx(maxX)} y2={sy(y)} stroke="var(--v2-panel-edge)" strokeWidth={0.4} opacity={0.4} />);
  }
  return <>{lines}</>;
}
