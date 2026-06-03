"use client";

import type { SnapshotItem } from "@/lib/v2/useDetections";
import { Bezel } from "./Bezel";

/**
 * Gallery of captured object crops. The brain snapshots a confident detection
 * (per-label cooldown) and streams its metadata; the image is fetched lazily
 * from /perception/snapshot/{id}. Newest first.
 */
export function SnapshotGallery({ snapshots }: { snapshots: SnapshotItem[] }) {
  return (
    <Bezel callsign="OBJ // CAPTURES" meta={`N=${snapshots.length}`} index={4}>
      <div className="p-2.5">
        {snapshots.length === 0 ? (
          <div className="px-1 py-4 zip-label text-[10px] text-[var(--v2-text-mute)]">
            No objects captured yet…
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-1.5 max-h-44 overflow-y-auto">
            {snapshots.map((s) => (
              <div
                key={s.id}
                className="relative aspect-square rounded-sm overflow-hidden border border-[var(--v2-panel-edge)] bg-[rgba(5,11,17,0.9)] group"
                title={`${s.label} · ${Math.round(s.confidence * 100)}% · ${rel(s.ts)}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={s.url}
                  alt={s.label}
                  loading="lazy"
                  className="absolute inset-0 w-full h-full object-cover"
                />
                <div className="absolute bottom-0 inset-x-0 px-1 py-0.5 bg-[rgba(4,12,18,0.82)] flex items-center justify-between">
                  <span className="zip-label text-[8px] text-[var(--v2-cyan-bright)] truncate">
                    {s.label}
                  </span>
                  <span className="zip-num text-[8px] text-[var(--v2-text-mute)]">
                    {Math.round(s.confidence * 100)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Bezel>
  );
}

function rel(ts: number): string {
  const dt = Math.max(0, Math.floor(Date.now() / 1000 - ts));
  if (dt < 60) return `${dt}s ago`;
  if (dt < 3600) return `${Math.floor(dt / 60)}m ago`;
  return `${Math.floor(dt / 3600)}h ago`;
}
