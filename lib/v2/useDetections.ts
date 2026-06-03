"use client";

import { useEffect, useRef, useState } from "react";

import type { Detection, ServerMessage, SnapshotMsg } from "./types";

export interface DetectionFrame {
  detections: Detection[];
  frameW: number;
  frameH: number;
  seq: number;
  ts: number;
  inferMs: number;
  backend: string;
}

export interface SnapshotItem {
  id: string;
  label: string;
  confidence: number;
  ts: number;
  /** Resolved URL to the JPEG crop on the brain. */
  url: string;
}

const EMPTY: DetectionFrame = {
  detections: [],
  frameW: 0,
  frameH: 0,
  seq: 0,
  ts: 0,
  inferMs: 0,
  backend: "",
};

const SNAPSHOT_MAX = 60;
/** A detection frame older than this is considered stale (detector paused/off). */
const STALE_MS = 1500;

/**
 * Subscribe to perception messages on the side-channel bus.
 *
 *   - `frame` holds the most recent detections (boxes in detector-frame coords;
 *     the overlay scales them to display size).
 *   - `snapshots` is a bounded, newest-first list of captured object crops,
 *     backfilled once from `/perception/snapshots` and appended live.
 *
 * No new WebSocket — reuses the parallel bus that latency already rides.
 */
export function useDetections(
  registerMessageHook: (fn: (m: ServerMessage) => void) => () => void,
  httpBase: string,
) {
  const [frame, setFrame] = useState<DetectionFrame>(EMPTY);
  const [snapshots, setSnapshots] = useState<SnapshotItem[]>([]);
  const seenRef = useRef<Set<string>>(new Set());

  // Live subscription to detections + snapshot events.
  useEffect(() => {
    const unsub = registerMessageHook((m) => {
      if (m.type === "detections") {
        setFrame({
          detections: m.detections,
          frameW: m.frame_w,
          frameH: m.frame_h,
          seq: m.seq,
          ts: m.ts,
          inferMs: m.infer_ms,
          backend: m.backend,
        });
      } else if (m.type === "snapshot") {
        const snap = m as SnapshotMsg;
        if (seenRef.current.has(snap.id)) return;
        seenRef.current.add(snap.id);
        setSnapshots((prev) =>
          [
            {
              id: snap.id,
              label: snap.label,
              confidence: snap.confidence,
              ts: snap.ts,
              url: `${httpBase}/perception/snapshot/${snap.id}`,
            },
            ...prev,
          ].slice(0, SNAPSHOT_MAX),
        );
      }
    });
    return unsub;
  }, [registerMessageHook, httpBase]);

  // One-time backfill of existing snapshots (so a freshly-loaded HUD isn't empty).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${httpBase}/perception/snapshots`);
        if (!res.ok) return;
        const items: SnapshotMsg[] = await res.json();
        if (cancelled) return;
        const mapped = items
          .filter((s) => !seenRef.current.has(s.id))
          .map((s) => {
            seenRef.current.add(s.id);
            return {
              id: s.id,
              label: s.label,
              confidence: s.confidence,
              ts: s.ts,
              url: `${httpBase}/perception/snapshot/${s.id}`,
            };
          });
        if (mapped.length) {
          setSnapshots((prev) =>
            [...mapped, ...prev].sort((a, b) => b.ts - a.ts).slice(0, SNAPSHOT_MAX),
          );
        }
      } catch {
        /* brain not up yet — live events will fill in */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [httpBase]);

  // Expose a freshness flag so the overlay can fade when detection is paused.
  const [now, setNow] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, []);
  const fresh = frame.ts > 0 && now - frame.ts * 1000 < STALE_MS;

  return { frame, snapshots, fresh };
}
