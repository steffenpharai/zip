"use client";

import { useEffect, useRef } from "react";
import type { ClientMessage } from "./types";
import type { DriveAxes } from "./useDriveInput";

/**
 * Drive dispatcher.
 *
 * Two paths:
 *   1. Event-driven (immediate): on any axes transition we fire a setpoint
 *      RIGHT NOW. This is what makes "press W → motor moves" feel snappy.
 *      Without it, the worst case was the 50 ms interval gap (avg ~25 ms
 *      added latency).
 *   2. Periodic (re-send): a 30 Hz interval keeps the latest setpoint
 *      fresh on the wire so the UNO's deadman TTL never lapses while the
 *      operator holds the key. The Jetson motion-gateway also re-sends
 *      every 100 ms, so this is belt-and-braces.
 *
 * Stop frames are emitted on transition to neutral immediately (no tick
 * wait) and then suppressed until the next non-neutral input.
 */

const TICK_HZ = 30;
const TICK_MS = 1000 / TICK_HZ;
const TTL_MS = 250;

const SPEED_V = 150; // PWM units, see UNO protocol
const SPEED_W = 130;

/** Optional callback fired every time we DISPATCH a setpoint or stop. */
export type DriveDispatchCallback = (
  kind: "drive" | "stop",
  ts: number,
) => void;

export function useDriveTick(
  axesRef: React.MutableRefObject<DriveAxes>,
  send: (m: ClientMessage) => void,
  onDispatch?: DriveDispatchCallback,
) {
  // Last-sent state — used to suppress redundant identical re-sends from the
  // event path AND to detect neutral transitions cleanly.
  const lastSentRef = useRef<{ v: number; w: number; ts: number }>({
    v: 0,
    w: 0,
    ts: 0,
  });
  const wasNeutralRef = useRef(true);
  const sendRef = useRef(send);
  sendRef.current = send;
  const onDispatchRef = useRef(onDispatch);
  onDispatchRef.current = onDispatch;

  /* -------- Event-driven path: instant on any axes change -------- */
  // Subscribe to axesRef indirectly. Because axesRef is a ref, React won't
  // re-run effects when it changes. We poll on a tiny rAF to catch the
  // transitions — this is cheap (rAF runs at display refresh ~60 Hz, just a
  // ref comparison) and removes the worst-case 50 ms tick wait entirely.
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const { v, w } = axesRef.current;
      const last = lastSentRef.current;
      const neutral = v === 0 && w === 0;

      if (neutral) {
        if (!wasNeutralRef.current) {
          // Just transitioned to neutral — STOP immediately.
          const ts = performance.now();
          sendRef.current({ type: "stop" });
          onDispatchRef.current?.("stop", ts);
          wasNeutralRef.current = true;
          lastSentRef.current = { v: 0, w: 0, ts };
        }
      } else if (v !== last.v || w !== last.w) {
        // Active and changed — fire immediately.
        const ts = performance.now();
        sendRef.current({
          type: "drive",
          v: Math.round(v * SPEED_V),
          w: Math.round(w * SPEED_W),
          ttl_ms: TTL_MS,
        });
        onDispatchRef.current?.("drive", ts);
        wasNeutralRef.current = false;
        lastSentRef.current = { v, w, ts };
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [axesRef]);

  /* -------- Periodic re-send: keep TTL fresh while held -------- */
  useEffect(() => {
    const id = setInterval(() => {
      const { v, w } = axesRef.current;
      if (v === 0 && w === 0) return; // STOP already handled by event path
      const ts = performance.now();
      sendRef.current({
        type: "drive",
        v: Math.round(v * SPEED_V),
        w: Math.round(w * SPEED_W),
        ttl_ms: TTL_MS,
      });
      onDispatchRef.current?.("drive", ts);
      lastSentRef.current = { v, w, ts };
    }, TICK_MS);
    return () => clearInterval(id);
  }, [axesRef]);
}

export const DRIVE_TTL_MS = TTL_MS;
export const DRIVE_SPEED_V = SPEED_V;
export const DRIVE_SPEED_W = SPEED_W;
