"use client";

/**
 * Twin-rail motor power visualization: two vertical bars with center
 * baseline = 0; positive = up = forward, negative = down = reverse. Phase 2
 * derives this from current setpoint; real motor feedback comes Phase 4+.
 */
export function MotorPair({ vAxis, wAxis }: { vAxis: number; wAxis: number }) {
  // Differential mixing — matches the UNO firmware's `left = v - k*w`, `right = v + k*w`
  const left = clamp(vAxis - wAxis, -1, 1);
  const right = clamp(vAxis + wAxis, -1, 1);
  return (
    <div className="px-3 pb-3 pt-1 flex gap-4 items-center">
      <Rail label="L" v={left} />
      <Rail label="R" v={right} />
      <div className="flex-1">
        <Row label="V" value={vAxis} />
        <Row label="ω" value={wAxis} />
      </div>
    </div>
  );
}

function Rail({ label, v }: { label: string; v: number }) {
  // Map -1..1 → percent of 80% bar height, centered
  const fill = Math.abs(v) * 50;
  const isFwd = v >= 0;
  const color = v === 0 ? "var(--v2-text-mute)" : "var(--v2-cyan)";
  return (
    <div className="flex flex-col items-center gap-1">
      <span className="zip-label text-[9px] text-[var(--v2-text-dim)]">{label}</span>
      <div className="relative h-24 w-3 rounded-sm bg-[rgba(8,18,26,0.85)] border border-[var(--v2-panel-edge)]">
        {/* centerline */}
        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-px bg-[var(--v2-hair)]" />
        {/* fill */}
        <div
          className="absolute left-0.5 right-0.5"
          style={{
            top: isFwd ? `${50 - fill}%` : "50%",
            height: `${fill}%`,
            background: `linear-gradient(${isFwd ? "0deg" : "180deg"}, ${color} 0%, transparent 100%)`,
            transition: "top 120ms ease-out, height 120ms ease-out",
          }}
        />
      </div>
      <span className="zip-num text-[10px] text-[var(--v2-text)]">
        {(v * 100).toFixed(0).padStart(3, " ")}
      </span>
    </div>
  );
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between border-b border-[var(--v2-hair)] py-1.5">
      <span className="zip-label text-[10px] text-[var(--v2-text-dim)]">{label}</span>
      <span className="zip-num text-sm text-[var(--v2-text)]">
        {(value * 100).toFixed(0).padStart(4, " ")}
        <span className="text-[9px] text-[var(--v2-text-mute)] ml-1">%</span>
      </span>
    </div>
  );
}

function clamp(n: number, lo: number, hi: number) {
  return n < lo ? lo : n > hi ? hi : n;
}
