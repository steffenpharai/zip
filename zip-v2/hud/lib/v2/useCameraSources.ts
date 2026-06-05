"use client";

import { useEffect, useState } from "react";
import { brainHttpBase } from "./brainUrl";

export type CameraKind = "v4l2" | "http";

export interface CameraSourceMeta {
  name: string;
  label: string;
  kind: CameraKind;
  width: number;
  height: number;
  fps: number;
  stream: string;
}

/**
 * Polls /cam/list once per `pollMs`. The brain's set of cameras only changes
 * when zip-brain restarts, so a slow poll is enough — it also serves as a
 * heartbeat so the HUD can flip "no signal" overlays when the brain dies.
 */
export function useCameraSources(wsUrl: string, pollMs: number = 5000) {
  const [sources, setSources] = useState<CameraSourceMeta[]>([]);
  const [ok, setOk] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const base = brainHttpBase(wsUrl);
    const tick = async () => {
      try {
        const r = await fetch(`${base}/cam/list`, { cache: "no-store" });
        if (!r.ok) throw new Error(`http ${r.status}`);
        const list = (await r.json()) as CameraSourceMeta[];
        if (!cancelled) {
          setSources(list);
          setOk(true);
        }
      } catch {
        if (!cancelled) setOk(false);
      }
    };
    tick();
    const id = setInterval(tick, pollMs);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [wsUrl, pollMs]);

  return { sources, ok };
}
