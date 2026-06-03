"use client";

import { useCallback, useEffect, useState } from "react";
import { Bezel } from "./Bezel";

/**
 * Monocular depth view (Phase 5.3a). Fetches a colorized Depth-Anything-V2
 * depth map of the current BOW frame from /depth/frame, on demand — one GPU
 * inference per capture, so it doesn't fight perception for the GPU.
 */
export function DepthPanel({ httpBase }: { httpBase: string }) {
  const [src, setSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const capture = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch(`${httpBase}/depth/frame?t=${Date.now()}`);
      if (!res.ok) {
        setErr(res.status === 503 ? "model loading…" : `err ${res.status}`);
        return;
      }
      const blob = await res.blob();
      setSrc((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return URL.createObjectURL(blob);
      });
    } catch {
      setErr("fetch failed");
    } finally {
      setLoading(false);
    }
  }, [httpBase]);

  // Revoke the last object URL on unmount.
  useEffect(() => () => { if (src) URL.revokeObjectURL(src); }, [src]);

  return (
    <Bezel callsign="DPT // DEPTH" meta="DA-V2 · MONO" index={6}>
      <div className="p-2.5 flex flex-col gap-2">
        <div className="aspect-video rounded-sm overflow-hidden border border-[var(--v2-panel-edge)] bg-[rgba(5,11,17,0.9)] flex items-center justify-center">
          {src ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={src} alt="depth" className="w-full h-full object-cover" />
          ) : (
            <span className="zip-label text-[10px] text-[var(--v2-text-mute)]">
              {err ?? "capture a depth frame"}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={capture}
          disabled={loading}
          className="zip-label text-[10px] py-1.5 rounded-sm border border-[var(--v2-panel-edge)] text-[var(--v2-text-dim)] hover:border-[var(--v2-cyan)] hover:text-[var(--v2-cyan-bright)] disabled:opacity-50"
        >
          {loading ? "◌ ESTIMATING…" : "◉ CAPTURE DEPTH"}
        </button>
        {err && src && (
          <span className="zip-label text-[9px] text-[var(--v2-rose)]">{err}</span>
        )}
      </div>
    </Bezel>
  );
}
