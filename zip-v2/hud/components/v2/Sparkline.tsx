"use client";

/**
 * Streaming sparkline. SVG; cheap; supports optional autoranging.
 * The point at the rightmost edge gets a small blinking marker.
 */
export function Sparkline({
  series,
  width = 160,
  height = 32,
  stroke = "var(--v2-cyan)",
  fillOpacity = 0.12,
  min,
  max,
  className = "",
}: {
  series: number[];
  width?: number;
  height?: number;
  stroke?: string;
  fillOpacity?: number;
  min?: number;
  max?: number;
  className?: string;
}) {
  if (series.length === 0) {
    return (
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width={width}
        height={height}
        className={className}
        preserveAspectRatio="none"
      >
        <line
          x1={0}
          y1={height / 2}
          x2={width}
          y2={height / 2}
          stroke="var(--v2-hair)"
          strokeDasharray="2 4"
        />
      </svg>
    );
  }
  const lo = min ?? Math.min(...series);
  const hi = max ?? Math.max(...series);
  const span = Math.max(1e-9, hi - lo);
  const n = series.length;
  const stepX = n > 1 ? width / (n - 1) : 0;
  const pts = series.map((v, i) => {
    const x = i * stepX;
    const y = height - ((v - lo) / span) * height;
    return [x, y] as const;
  });
  const d = pts
    .map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`)
    .join(" ");
  const dFill = `${d} L${width},${height} L0,${height} Z`;
  const [lx, ly] = pts[pts.length - 1];

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      className={className}
      preserveAspectRatio="none"
    >
      <path d={dFill} fill={stroke} fillOpacity={fillOpacity} />
      <path d={d} stroke={stroke} strokeWidth={1.25} fill="none" />
      <circle
        cx={lx}
        cy={ly}
        r={2.4}
        fill={stroke}
        className="zip-blink"
      />
    </svg>
  );
}
