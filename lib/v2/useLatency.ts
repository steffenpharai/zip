"use client";
import { useEffect, useRef, useState } from "react";
import type { ClientMessage, ServerMessage } from "./types";

/**
 * Crude latency monitor: periodically issues a `ping` and times the matching
 * `pong`. Returns ms (smoothed EWMA). The brain currently responds with the
 * same `id` in its pong, so we correlate on that.
 *
 * Caveats: this is wall-clock not network RTT; OS / browser scheduling jitter
 * is included. For relative trend (and the cockpit aesthetic), good enough.
 */
export function useLatency(
  send: (m: ClientMessage) => void,
  /** Pass the same pong-emitting WS by registering a listener via this hook. */
  registerMessageHook: (
    fn: (m: ServerMessage) => void,
  ) => () => void,
  intervalMs: number = 1500,
): number | null {
  const [smoothed, setSmoothed] = useState<number | null>(null);
  const pendingRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    const unsub = registerMessageHook((m) => {
      if (m.type !== "pong" || !m.id) return;
      const sent = pendingRef.current.get(m.id);
      if (sent == null) return;
      pendingRef.current.delete(m.id);
      const dt = performance.now() - sent;
      setSmoothed((prev) => (prev == null ? dt : prev * 0.7 + dt * 0.3));
    });
    return unsub;
  }, [registerMessageHook]);

  useEffect(() => {
    const id = setInterval(() => {
      const pingId = `p_${Math.floor(performance.now())}`;
      pendingRef.current.set(pingId, performance.now());
      // Prune anything older than 5s — never expecting late pongs.
      const cutoff = performance.now() - 5000;
      for (const [k, v] of pendingRef.current) {
        if (v < cutoff) pendingRef.current.delete(k);
      }
      send({ type: "ping", id: pingId });
    }, intervalMs);
    return () => clearInterval(id);
  }, [send, intervalMs]);

  return smoothed;
}
