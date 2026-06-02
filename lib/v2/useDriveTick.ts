"use client";

import { useEffect, useRef } from "react";
import type { ClientMessage } from "./types";
import type { DriveAxes } from "./useDriveInput";

const TICK_HZ = 20;
const TICK_MS = 1000 / TICK_HZ;
const TTL_MS = 250;

const SPEED_V = 150; // PWM units, see UNO protocol
const SPEED_W = 130;

/**
 * 20Hz drive loop. Reads axes via ref so the loop body sees the latest input
 * without re-creating the interval. Emits `drive` while non-zero, `stop` on
 * the transition to neutral (idempotent — the brain motion-gateway also
 * dead-mans).
 */
export function useDriveTick(
  axesRef: React.MutableRefObject<DriveAxes>,
  send: (m: ClientMessage) => void,
) {
  const wasNeutralRef = useRef(true);

  useEffect(() => {
    const id = setInterval(() => {
      const { v, w } = axesRef.current;
      const neutral = v === 0 && w === 0;
      if (neutral) {
        if (!wasNeutralRef.current) {
          send({ type: "stop" });
          wasNeutralRef.current = true;
        }
        return;
      }
      wasNeutralRef.current = false;
      send({
        type: "drive",
        v: Math.round(v * SPEED_V),
        w: Math.round(w * SPEED_W),
        ttl_ms: TTL_MS,
      });
    }, TICK_MS);
    return () => clearInterval(id);
  }, [axesRef, send]);
}

export const DRIVE_TTL_MS = TTL_MS;
export const DRIVE_SPEED_V = SPEED_V;
export const DRIVE_SPEED_W = SPEED_W;
