/** Tiny formatters. Tabular-num safe. */

export function fmtVolts(mv: number | null, digits = 2): string {
  if (mv == null) return "—";
  return (mv / 1000).toFixed(digits);
}

export function fmtCm(cm: number | null): string {
  if (cm == null) return "—";
  return `${cm}`;
}

export function fmtMs(ms: number | null): string {
  if (ms == null) return "—";
  if (ms < 10) return ms.toFixed(1);
  return `${Math.round(ms)}`;
}

export function fmtHMS(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600).toString().padStart(2, "0");
  const m = Math.floor((s % 3600) / 60).toString().padStart(2, "0");
  const sec = (s % 60).toString().padStart(2, "0");
  return `${h}:${m}:${sec}`;
}

export function fmtPct(n: number, digits = 0): string {
  return `${n.toFixed(digits)}%`;
}

/** Voltage → rough percent for a 2S Li-ion: 6.4V≈0%, 8.4V≈100%. */
export function batteryPercent(mv: number | null): number | null {
  if (mv == null) return null;
  const min = 6400;
  const max = 8400;
  const pct = ((mv - min) / (max - min)) * 100;
  return Math.max(0, Math.min(100, pct));
}

/** Map ultrasonic cm → severity tier */
export type RangeTier = "ok" | "caution" | "critical" | "unknown";
export function rangeTier(cm: number | null): RangeTier {
  if (cm == null) return "unknown";
  if (cm < 10) return "critical";
  if (cm < 30) return "caution";
  return "ok";
}
