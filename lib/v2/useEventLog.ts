"use client";

import { useCallback, useRef, useState } from "react";

export type CockpitEvent = {
  ts: number; // ms since epoch
  kind: "info" | "warn" | "crit" | "cmd" | "link";
  text: string;
};

export function useEventLog(maxEvents = 24) {
  const eventsRef = useRef<CockpitEvent[]>([]);
  const [tick, setTick] = useState(0);

  const log = useCallback(
    (kind: CockpitEvent["kind"], text: string) => {
      const e: CockpitEvent = { ts: Date.now(), kind, text };
      const arr = eventsRef.current;
      arr.push(e);
      if (arr.length > maxEvents) arr.splice(0, arr.length - maxEvents);
      setTick((t) => (t + 1) & 0xffff);
    },
    [maxEvents],
  );

  return { events: eventsRef.current, log, tick };
}
