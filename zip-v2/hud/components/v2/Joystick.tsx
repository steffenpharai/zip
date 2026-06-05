"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Axes = { v: number; w: number };

/**
 * Pointer-driven virtual joystick. SVG; works with mouse + touch + stylus.
 * Outputs unit-normalized axes via `onChange`. The visual stick is a small
 * disc that can be dragged anywhere within an outer ring; the magnitude is
 * clamped to the ring radius. Releasing snaps the stick back and emits
 * `{v:0,w:0}`.
 *
 * Coordinate convention: `v` is forward (negative Y in screen = up = +v),
 * `w` is yaw rate (positive X = right = +w).
 */
export function Joystick({
  onChange,
  axes,
  size = 220,
}: {
  onChange: (a: Axes) => void;
  /** Current axes (so the stick reflects keyboard input too) */
  axes: Axes;
  size?: number;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const stickRadius = size * 0.18;
  const ringRadius = size / 2 - stickRadius - 4;

  const [dragging, setDragging] = useState(false);
  const draggingRef = useRef(false);
  draggingRef.current = dragging;

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const el = containerRef.current;
      if (!el) return;
      el.setPointerCapture(e.pointerId);
      setDragging(true);
      apply(e.clientX, e.clientY);
    },
    [],
  );
  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!draggingRef.current) return;
      apply(e.clientX, e.clientY);
    },
    [],
  );
  const onPointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const el = containerRef.current;
      try {
        el?.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      setDragging(false);
      onChange({ v: 0, w: 0 });
    },
    [onChange],
  );

  const applyRef = useRef<(x: number, y: number) => void>(() => {});
  applyRef.current = (clientX: number, clientY: number) => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = clientX - cx;
    const dy = clientY - cy;
    // Clamp into ring
    const mag = Math.hypot(dx, dy);
    const clamped = Math.min(1, mag / ringRadius);
    if (mag === 0) {
      onChange({ v: 0, w: 0 });
      return;
    }
    // SCREEN up = negative dy = forward
    const w = clamped * (dx / mag);
    const v = clamped * (-dy / mag);
    onChange({ v, w });
  };
  const apply = (x: number, y: number) => applyRef.current(x, y);

  // Map axes (-1..1) → on-ring pixel position
  const stickX = axes.w * ringRadius;
  const stickY = -axes.v * ringRadius;

  // Halo for active drag
  useEffect(() => {
    const onWinUp = () => {
      if (!draggingRef.current) return;
      setDragging(false);
      onChange({ v: 0, w: 0 });
    };
    window.addEventListener("pointercancel", onWinUp);
    return () => window.removeEventListener("pointercancel", onWinUp);
  }, [onChange]);

  return (
    <div
      ref={containerRef}
      role="application"
      aria-label="Virtual joystick"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      style={{
        width: size,
        height: size,
        touchAction: "none",
        userSelect: "none",
      }}
      className="relative"
    >
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size}>
        <defs>
          <radialGradient id="zj-floor" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(111,224,255,0.10)" />
            <stop offset="70%" stopColor="rgba(111,224,255,0.02)" />
            <stop offset="100%" stopColor="rgba(0,0,0,0)" />
          </radialGradient>
          <radialGradient id="zj-stick" cx="50%" cy="35%" r="60%">
            <stop offset="0%" stopColor="rgba(111,224,255,0.95)" />
            <stop offset="55%" stopColor="rgba(39,180,205,0.85)" />
            <stop offset="100%" stopColor="rgba(8,18,26,0.95)" />
          </radialGradient>
          <filter id="zj-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" />
          </filter>
        </defs>

        {/* base floor */}
        <circle cx={size / 2} cy={size / 2} r={size / 2 - 1} fill="url(#zj-floor)" />

        {/* outer ring */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={size / 2 - 2}
          stroke="var(--v2-panel-edge)"
          strokeWidth={1}
          fill="none"
        />

        {/* inner active ring */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={ringRadius}
          stroke="var(--v2-cyan)"
          strokeOpacity={0.35}
          strokeWidth={1}
          fill="none"
        />

        {/* cross hair */}
        <line
          x1={size / 2 - ringRadius - 4}
          y1={size / 2}
          x2={size / 2 + ringRadius + 4}
          y2={size / 2}
          stroke="var(--v2-hair)"
        />
        <line
          x1={size / 2}
          y1={size / 2 - ringRadius - 4}
          x2={size / 2}
          y2={size / 2 + ringRadius + 4}
          stroke="var(--v2-hair)"
        />

        {/* hash marks at quarter points */}
        {[-1, -0.5, 0.5, 1].map((p) => (
          <g key={p}>
            <line
              x1={size / 2 + p * ringRadius - 2}
              y1={size / 2 - 4}
              x2={size / 2 + p * ringRadius + 2}
              y2={size / 2 - 4}
              stroke="var(--v2-cyan)"
              opacity="0.45"
            />
            <line
              x1={size / 2 - 4}
              y1={size / 2 + p * ringRadius - 2}
              x2={size / 2 - 4}
              y2={size / 2 + p * ringRadius + 2}
              stroke="var(--v2-cyan)"
              opacity="0.45"
            />
          </g>
        ))}

        {/* vector arrow showing current setpoint */}
        {(axes.v !== 0 || axes.w !== 0) && (
          <g transform={`translate(${size / 2}, ${size / 2})`}>
            <line
              x1={0}
              y1={0}
              x2={stickX}
              y2={stickY}
              stroke="var(--v2-green)"
              strokeWidth={2}
              opacity="0.95"
              filter="url(#zj-glow)"
            />
            <line
              x1={0}
              y1={0}
              x2={stickX}
              y2={stickY}
              stroke="var(--v2-green)"
              strokeWidth={1.4}
              opacity="1"
            />
          </g>
        )}

        {/* stick */}
        <g
          style={{
            transform: `translate(${size / 2 + stickX}px, ${size / 2 + stickY}px)`,
            transition: dragging ? "none" : "transform 180ms cubic-bezier(0.22,1,0.36,1)",
          }}
        >
          <circle r={stickRadius + 6} fill="rgba(39,180,205,0.18)" filter="url(#zj-glow)" />
          <circle r={stickRadius} fill="url(#zj-stick)" stroke="var(--v2-cyan)" strokeOpacity="0.75" />
          <circle r={stickRadius / 3} fill="var(--v2-cyan-bright)" opacity="0.9" />
        </g>
      </svg>
    </div>
  );
}
