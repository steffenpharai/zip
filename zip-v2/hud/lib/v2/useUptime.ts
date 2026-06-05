"use client";
import { useEffect, useState } from "react";

/** Seconds since mount. Ticks once per second. */
export function useUptime(): number {
  const [s, setS] = useState(0);
  useEffect(() => {
    const start = performance.now();
    const id = setInterval(() => {
      setS((performance.now() - start) / 1000);
    }, 1000);
    return () => clearInterval(id);
  }, []);
  return s;
}
