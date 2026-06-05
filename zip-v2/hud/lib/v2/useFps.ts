"use client";
import { useEffect, useRef, useState } from "react";

/**
 * Live FPS sampled via requestAnimationFrame. Updates ~once/sec so the readout
 * is readable instead of jittery. Pauses on tab hidden.
 */
export function useFps(): number {
  const [fps, setFps] = useState(0);
  const framesRef = useRef(0);
  const lastRef = useRef(performance.now());
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const loop = () => {
      framesRef.current += 1;
      const now = performance.now();
      const dt = now - lastRef.current;
      if (dt >= 1000) {
        setFps((framesRef.current * 1000) / dt);
        framesRef.current = 0;
        lastRef.current = now;
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    const onVis = () => {
      lastRef.current = performance.now();
      framesRef.current = 0;
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  return fps;
}
