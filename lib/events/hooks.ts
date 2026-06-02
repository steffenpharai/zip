"use client";

import { useEffect, useCallback } from "react";
import { eventBus } from "./bus";
import type { ZipEvent, EventHandler } from "./types";

export function useEventBus(handler: EventHandler): void {
  useEffect(() => {
    const unsubscribe = eventBus.subscribe(handler);
    return unsubscribe;
  }, [handler]);
}

export function useEmitEvent() {
  return useCallback((event: ZipEvent) => {
    eventBus.emit(event);
  }, []);
}

