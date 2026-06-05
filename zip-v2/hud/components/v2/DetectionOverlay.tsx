"use client";

import type { DetectionFrame } from "@/lib/v2/useDetections";

/**
 * Bounding-box overlay for the BOW camera feed.
 *
 * The SVG viewBox is set to the detector's native frame size and uses
 * preserveAspectRatio="xMidYMid meet" — identical to the <img>'s
 * object-contain scaling — so boxes land on pixels without any manual
 * letterbox arithmetic, at any panel size.
 */
export function DetectionOverlay({
  frame,
  fresh,
}: {
  frame: DetectionFrame;
  fresh: boolean;
}) {
  if (!frame.frameW || !frame.frameH) return null;

  return (
    <svg
      viewBox={`0 0 ${frame.frameW} ${frame.frameH}`}
      preserveAspectRatio="xMidYMid meet"
      className="absolute inset-0 w-full h-full pointer-events-none"
      style={{ opacity: fresh ? 1 : 0.35, transition: "opacity 0.4s" }}
    >
      {frame.detections.map((d, i) => {
        const [x, y, w, h] = d.box;
        const hue = hueFor(d.class_id);
        const stroke = `hsl(${hue} 90% 62%)`;
        const labelW = Math.max(46, (d.label.length + 4) * 7.5);
        const labelH = 15;
        const ly = y > labelH ? y - labelH : y;
        return (
          <g key={`${frame.seq}-${i}`}>
            <rect
              x={x}
              y={y}
              width={w}
              height={h}
              fill={`hsl(${hue} 90% 60% / 0.06)`}
              stroke={stroke}
              strokeWidth={2}
              rx={2}
            />
            <rect x={x} y={ly} width={labelW} height={labelH} fill={stroke} rx={1.5} />
            <text
              x={x + 4}
              y={ly + 11}
              fontSize={11}
              fontFamily="ui-monospace, monospace"
              fontWeight={700}
              fill="#04121A"
            >
              {d.label} {Math.round(d.confidence * 100)}%
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// Stable, well-spread hue per COCO class so the same object keeps its color.
function hueFor(classId: number): number {
  return (classId * 47) % 360;
}
