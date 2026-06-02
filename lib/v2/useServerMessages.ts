"use client";

import { useCallback, useEffect, useRef } from "react";
import type { ServerMessage } from "./types";

/**
 * A side-channel for components/hooks that need to react to specific WS
 * messages (e.g. pongs for latency) without bloating `RobotState`.
 *
 * Patch `useZipBrain` lightly: it stores latest messages here, while still
 * driving the canonical `state`. We avoid altering the existing hook.
 *
 * Usage:
 *   const { register } = useServerMessageBus();
 *   useEffect(() => register((m) => { ... }), [register]);
 *
 * The page-level component is responsible for calling `feed(msg)` from a
 * lightweight WebSocket message subscription wired alongside `useZipBrain`.
 */
type Listener = (m: ServerMessage) => void;

export function useServerMessageBus() {
  const listeners = useRef<Set<Listener>>(new Set());

  const register = useCallback((fn: Listener) => {
    listeners.current.add(fn);
    return () => {
      listeners.current.delete(fn);
    };
  }, []);

  const feed = useCallback((m: ServerMessage) => {
    for (const fn of listeners.current) {
      try {
        fn(m);
      } catch {
        // Swallow — one bad listener shouldn't kill the chain.
      }
    }
  }, []);

  return { register, feed };
}

/**
 * Convenience: open a parallel WebSocket to the same URL just to pipe raw
 * messages into the bus. Cheaper than refactoring `useZipBrain`; we use it
 * only for low-rate side-channels (pong/ack) and ack-like info.
 *
 * IMPORTANT: This means the latency hook double-pings — the brain control
 * plane accepts multiple WS clients and treats each as an observer. Phase 2
 * scope is fine with this; we can fold it into the canonical hook later.
 */
export function useParallelWsBus(url: string) {
  const bus = useServerMessageBus();
  useEffect(() => {
    let ws: WebSocket | null = null;
    let killed = false;
    let backoff = 600;

    const open = () => {
      try {
        ws = new WebSocket(url);
      } catch {
        return;
      }
      ws.onmessage = (ev) => {
        try {
          bus.feed(JSON.parse(ev.data));
        } catch {
          /* ignore */
        }
      };
      ws.onclose = () => {
        if (killed) return;
        setTimeout(() => {
          backoff = Math.min(backoff * 2, 8000);
          open();
        }, backoff);
      };
      ws.onerror = () => {
        /* onclose follows */
      };
    };
    open();
    return () => {
      killed = true;
      try {
        ws?.close(1000, "unmount");
      } catch {
        /* ignore */
      }
    };
  }, [url, bus]);
  return bus;
}
