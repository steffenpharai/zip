"use client";

import { useEffect, useRef, useState } from "react";

import { Bezel } from "./Bezel";

/**
 * Live MJPEG view. The browser renders `multipart/x-mixed-replace` natively
 * inside `<img>`. If the stream URL is undefined the panel shows a
 * "no signal" placeholder.
 *
 * On stream error (TCP reset, brain restart, camera unplug) we bump a
 * cache-buster every second until the image re-loads. This is the simplest
 * reconnect strategy that works with `<img>`-style streaming.
 */
export function CameraFeed({
  callsign = "CAM // BOW",
  label = "C615 · 640×480 · MJPG",
  streamUrl,
  overlay,
}: {
  callsign?: string;
  label?: string;
  /** Undefined → "no signal" placeholder. */
  streamUrl?: string;
  /** Optional absolutely-positioned layer over the video (e.g. detection boxes). */
  overlay?: React.ReactNode;
}) {
  // `bust` is bumped ONLY on stream error. We deliberately do NOT bump it
  // when streamUrl first becomes defined or when the component re-renders:
  //   - React StrictMode double-invokes effects, so an "always bump on mount"
  //     pattern would produce two distinct URLs (?t=1 then ?t=2) and the
  //     browser would open two MJPEG connections per camera. On the brain
  //     side that means two GStreamer pipelines fighting over /dev/video0
  //     and both failing with "Device busy".
  //   - Deduplicating via stable URL lets the browser collapse StrictMode's
  //     double-invocations into a single HTTP request.
  const [bust, setBust] = useState(0);
  const [live, setLive] = useState(false);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset live indicator when URL changes; the URL itself does NOT include
  // the bust counter on initial mount (only on error).
  useEffect(() => {
    setLive(false);
    return () => {
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
    };
  }, [streamUrl]);

  const onError = () => {
    setLive(false);
    if (reconnectRef.current) clearTimeout(reconnectRef.current);
    reconnectRef.current = setTimeout(() => setBust((b) => b + 1), 1000);
  };
  const onLoad = () => {
    setLive(true);
  };

  // bust=0 produces the canonical URL — same across StrictMode double-mounts.
  const srcWithBust =
    streamUrl != null
      ? bust === 0
        ? streamUrl
        : `${streamUrl}?b=${bust}`
      : undefined;

  return (
    <Bezel
      callsign={callsign}
      meta={label}
      index={3}
      className="overflow-hidden h-full"
      contentClassName="h-full"
    >
      <div className="relative w-full h-full zip-v2-scanlines zip-v2-grain overflow-hidden bg-[#050B11]">
        {srcWithBust ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={srcWithBust}
            src={srcWithBust}
            alt={callsign}
            onLoad={onLoad}
            onError={onError}
            className="absolute inset-0 w-full h-full object-contain object-center"
            style={{
              filter: "saturate(1.05) contrast(1.04)",
            }}
          />
        ) : (
          <NoSignalSurface />
        )}

        {/* Detection overlay (or any caller-supplied layer) sits above the video. */}
        {streamUrl && overlay}

        {/* LIVE pip */}
        {streamUrl && (
          <div className="absolute top-2 left-2 flex items-center gap-1.5 zip-label text-[9px]">
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                live
                  ? "bg-[var(--v2-rose)] zip-pulse-dot"
                  : "bg-[var(--v2-text-mute)]"
              }`}
            />
            <span style={{ color: live ? "var(--v2-rose)" : "var(--v2-text-mute)" }}>
              {live ? "LIVE" : "BUFFERING"}
            </span>
          </div>
        )}
        {/* Resolution / format meta on right */}
        <div className="absolute top-2 right-2 zip-num text-[9px] text-[var(--v2-text-mute)]">
          {streamUrl ? label.split(" · ")[1] : "—"}
        </div>
      </div>
    </Bezel>
  );
}

function NoSignalSurface() {
  return (
    <div className="absolute inset-0 zip-hatch">
      <div className="absolute inset-0 flex">
        {["#0E1B25", "#0F2030", "#0A1822", "#101C28", "#0B1620", "#0D1E2A", "#091621"].map(
          (c, i) => (
            <div key={i} className="flex-1" style={{ background: c }} />
          ),
        )}
      </div>
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="text-center">
          <div className="zip-label text-[10px] text-[var(--v2-text-mute)] mb-1">
            NO VIDEO SIGNAL
          </div>
          <div className="zip-num text-[10px] text-[var(--v2-text-dim)]">
            CAMERA OFFLINE
          </div>
        </div>
      </div>
    </div>
  );
}
