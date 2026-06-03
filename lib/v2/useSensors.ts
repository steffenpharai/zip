"use client";

import { useEffect, useRef, useState } from "react";

import type { ScanPoint, ServerMessage } from "./types";

export interface SensorsState {
  /** Latest fused yaw in degrees, or null if no IMU sample yet. */
  yawDeg: number | null;
  yawTs: number;
  /** Latest servo-swept radar points. */
  scan: ScanPoint[];
  scanTs: number;
  /** Wheel-motion safety lock (true = motors can't be commanded). */
  wheelsLocked: boolean;
}

const EMPTY: SensorsState = { yawDeg: null, yawTs: 0, scan: [], scanTs: 0, wheelsLocked: false };

/**
 * Subscribe to Phase 5 sensor streams (IMU heading + servo-swept radar) on the
 * side-channel bus. No new socket — rides the parallel WS like useDetections.
 */
export function useSensors(
  registerMessageHook: (fn: (m: ServerMessage) => void) => () => void,
) {
  const [state, setState] = useState<SensorsState>(EMPTY);
  // Throttle IMU-driven re-renders: heading streams ~10 Hz, but the compass
  // only needs ~smooth updates. Coalesce via a ref + rAF-ish setState guard.
  const lastYawRender = useRef(0);

  useEffect(() => {
    const unsub = registerMessageHook((m) => {
      if (m.type === "imu") {
        const now = performance.now();
        if (now - lastYawRender.current < 80) return; // ~12.5 fps cap
        lastYawRender.current = now;
        setState((s) => ({ ...s, yawDeg: m.yaw_deg, yawTs: m.ts }));
      } else if (m.type === "scan") {
        setState((s) => ({ ...s, scan: m.points, scanTs: m.ts }));
      } else if (m.type === "motion_lock") {
        setState((s) => ({ ...s, wheelsLocked: !!m.locked }));
      }
    });
    return unsub;
  }, [registerMessageHook]);

  return state;
}
