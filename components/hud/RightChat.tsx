"use client";

import { useState, useEffect } from "react";
import { LAYOUT, PROJECTOR_LAYOUT } from "@/lib/constants";
import { useProjector } from "@/lib/projector/projector-provider";
import { useEventBus, useEmitEvent } from "@/lib/events/hooks";
import { useHudStore } from "@/lib/state/hudStore";
import { extractConversation, downloadTranscript } from "@/lib/utils/transcript";
import type { ZipEvent } from "@/lib/events/types";
import ChatStream from "./chat/ChatStream";

export default function RightChat() {
  const [events, setEvents] = useState<ZipEvent[]>([]);
  const { resetSession } = useHudStore();
  const emit = useEmitEvent();
  const { isProjectorMode } = useProjector();
  const railWidth = isProjectorMode ? PROJECTOR_LAYOUT.RIGHT_RAIL_WIDTH : LAYOUT.RIGHT_RAIL_WIDTH;

  useEventBus((event: ZipEvent) => {
    if (event.type === "chat.message") {
      setEvents((prev) => [...prev, event]);
    }
  });

  const handleClear = () => {
    setEvents([]);
    resetSession();
    // Emit clear event so ChatStream can clear its messages
    emit({
      type: "chat.clear",
      ts: Date.now(),
    });
  };

  const handleExtract = () => {
    const { json, text } = extractConversation(events);
    downloadTranscript(json, text);
  };

  return (
    <div
      className="bg-panel-surface border-l border-border flex flex-col h-full"
      style={{ width: `${railWidth}px` }}
    >
      <div className="p-2 sm:p-3 md:p-4 border-b border-border flex items-center justify-between gap-2 sm:gap-3 md:gap-4 min-w-0">
        <h3 className="text-text-primary text-[10px] sm:text-xs md:text-sm font-semibold uppercase tracking-wide whitespace-nowrap flex-shrink-0">
          Conversation
        </h3>
        <div className="flex gap-1 sm:gap-2 min-w-0 flex-shrink">
          <button
            onClick={handleClear}
            className="px-2 sm:px-2.5 md:px-3 py-1 sm:py-1.5 text-[10px] sm:text-xs text-text-muted hover:text-text-primary border border-border rounded-md bg-panel-surface-2 hover:bg-panel-surface transition-colors whitespace-nowrap flex-shrink-0"
            aria-label="Clear conversation"
          >
            Clear
          </button>
          <button
            onClick={handleExtract}
            className="px-2 sm:px-2.5 md:px-3 py-1 sm:py-1.5 text-[10px] sm:text-xs text-text-muted hover:text-text-primary border border-border rounded-md bg-panel-surface-2 hover:bg-panel-surface transition-colors whitespace-nowrap flex-shrink-0"
            aria-label="Extract conversation"
          >
            Extract Conversation
          </button>
        </div>
      </div>
      <ChatStream />
    </div>
  );
}

