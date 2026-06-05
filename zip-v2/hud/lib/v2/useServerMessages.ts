"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import type { ServerMessage } from "./types";

/**
 * A side-channel for components/hooks that need to react to specific WS
 * messages (e.g. pongs for latency) without bloating `RobotState`.
 *
 * Patch `useZipBrain` lightly: it stores latest messages here, while still
 * driving the canonical `state`. We avoid altering the existing hook.
 *
 * IMPORTANT: the returned object's identity is STABLE across renders — both
 * `register` and `feed` are memoised. Otherwise effects that depend on the
 * bus would tear down and rebuild on every render, which (for the parallel
 * WS bus below) caused us to leak ~90 simultaneous WebSocket clients to the
 * Jetson and starve the camera proxies of asyncio cycles.
 */
type Listener = (m: ServerMessage) => void;

export interface ServerMessageBus {
  register: (fn: Listener) => () => void;
  feed: (m: ServerMessage) => void;
}

export function useServerMessageBus(): ServerMessageBus {
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

  // Memoise the bus object itself so any consumer that includes it in a
  // useEffect dep array doesn't tear down on every render.
  return useMemo(() => ({ register, feed }), [register, feed]);
}

/**
 * Open a parallel WebSocket to the same URL just to pipe raw messages into
 * the bus. Cheaper than refactoring `useZipBrain`; we use it only for
 * low-rate side-channels (pong/ack) and ack-like info.
 *
 * The effect intentionally depends ONLY on `url` so it isn't re-created
 * when the bus's identity changes between renders. We keep a ref to the
 * bus so the WS handler can still call into the freshest `feed`.
 */
export function useParallelWsBus(url: string): ServerMessageBus {
  const bus = useServerMessageBus();
  const busRef = useRef(bus);
  busRef.current = bus;

  useEffect(() => {
    let ws: WebSocket | null = null;
    let killed = false;
    let backoff = 600;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const open = () => {
      if (killed) return;
      try {
        ws = new WebSocket(url);
      } catch {
        return;
      }
      ws.onmessage = (ev) => {
        try {
          busRef.current.feed(JSON.parse(ev.data));
        } catch {
          /* ignore */
        }
      };
      ws.onclose = () => {
        if (killed) return;
        retryTimer = setTimeout(() => {
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
      if (retryTimer) clearTimeout(retryTimer);
      try {
        ws?.close(1000, "unmount");
      } catch {
        /* ignore */
      }
    };
    // Critical: depend ONLY on url. `bus` is read via ref so we don't
    // re-create the socket every render.
  }, [url]);

  return bus;
}
