"use client";

import { useState, useEffect } from "react";
import { useHudStore } from "@/lib/state/hudStore";
import { useProjector } from "@/lib/projector/projector-provider";
import { useEventBus } from "@/lib/events/hooks";
import type { ZipEvent, BrainActivityEvent } from "@/lib/events/types";
import { formatActivityMessage } from "@/lib/orchestrators/utils/activity-formatter";

const STATUS_MESSAGES: Record<string, string> = {
  IDLE: "hello",
  WAKE_LISTEN: "Listening for wake word…",
  LISTENING: "Listening…",
  THINKING: "Thinking…",
  TOOL_RUNNING: "Processing…",
  SPEAKING: "Speaking…",
  ERROR: "Error",
};

export default function CenterCore() {
  const { state } = useHudStore();
  const { isProjectorMode } = useProjector();
  const [activity, setActivity] = useState<BrainActivityEvent["activity"][]>([]);
  const [hasHadActivity, setHasHadActivity] = useState(false);

  useEventBus((event: ZipEvent) => {
    if (event.type === "brain.activity") {
      setHasHadActivity(true);
      setActivity((prev) => {
        const updated = [...prev, event.activity];
        // Keep last 10 activities
        return updated.slice(-10);
      });
    }
  });

  // Clear activity when mode changes to IDLE and reset hasHadActivity flag
  useEffect(() => {
    if (state.mode === "IDLE") {
      setActivity([]);
      // Reset hasHadActivity after a delay to allow showing "hello" again
      const timer = setTimeout(() => {
        setHasHadActivity(false);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [state.mode]);

  const currentActivity = activity[activity.length - 1];
  // Only show activity message if we've had activity and there's current activity
  // Otherwise show status message (which will be "hello" for IDLE on initial load)
  const statusMessage = hasHadActivity && currentActivity
    ? formatActivityMessage(currentActivity)
    : STATUS_MESSAGES[state.mode] || STATUS_MESSAGES.IDLE;

  return (
    <div className="h-full w-full flex flex-col items-center justify-center gap-4 relative overflow-hidden">
      <div className="flex flex-col items-center gap-3 w-full max-w-md px-4">
        <h2 className={`w-full text-text-primary font-semibold tracking-zip uppercase text-center ${isProjectorMode ? "text-[4.875rem]" : "text-[2.925rem]"}`}>ZIP</h2>
        <div className="w-full max-w-[min(320px,45vh)] aspect-square" />
        <p className={`w-full text-text-muted text-center ${isProjectorMode ? "text-sm" : "text-xs"}`}>{statusMessage}</p>
      </div>
      <footer className="absolute bottom-4 text-text-muted text-[10px] opacity-60 text-center">
        Developed by Phygital Engineering 2026 • MIT License •{" "}
        <a 
          href="https://github.com/phygital/zip" 
          target="_blank" 
          rel="noopener noreferrer"
          className="hover:opacity-100 transition-opacity underline"
        >
          GitHub
        </a>
      </footer>
    </div>
  );
}

