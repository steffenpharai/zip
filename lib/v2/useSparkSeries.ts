"use client";

import { useCallback, useRef, useState } from "react";

/** Bounded ring of numeric samples (plus a tick to force re-renders). */
export function useSparkSeries(maxSamples = 64) {
  const seriesRef = useRef<number[]>([]);
  const [tick, setTick] = useState(0);

  const push = useCallback(
    (value: number) => {
      const s = seriesRef.current;
      s.push(value);
      if (s.length > maxSamples) s.splice(0, s.length - maxSamples);
      setTick((t) => (t + 1) & 0xffff);
    },
    [maxSamples],
  );

  return { series: seriesRef.current, push, tick };
}
