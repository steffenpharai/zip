"use client";

import { useEffect, useRef, useState } from "react";

import type { OccupancyMsg, PoseMsg, ServerMessage } from "./types";

export interface MapState {
  pose: { x: number; y: number; theta: number } | null;
  cellM: number;
  occupied: [number, number][];
}

const EMPTY: MapState = { pose: null, cellM: 0.05, occupied: [] };

/**
 * Subscribe to the Phase 5.1 map streams (pose + occupancy) on the parallel
 * bus. Pose is throttled (it streams ~10 Hz); occupancy arrives ~1 Hz.
 */
export function useMap(
  registerMessageHook: (fn: (m: ServerMessage) => void) => () => void,
): MapState {
  const [state, setState] = useState<MapState>(EMPTY);
  const lastPose = useRef(0);

  useEffect(() => {
    const unsub = registerMessageHook((m) => {
      if (m.type === "pose") {
        const now = performance.now();
        if (now - lastPose.current < 100) return;
        lastPose.current = now;
        const p = m as PoseMsg;
        setState((s) => ({ ...s, pose: { x: p.x, y: p.y, theta: p.theta } }));
      } else if (m.type === "occupancy") {
        const o = m as OccupancyMsg;
        setState((s) => ({ ...s, cellM: o.cell_m, occupied: o.occupied }));
      }
    });
    return unsub;
  }, [registerMessageHook]);

  return state;
}
