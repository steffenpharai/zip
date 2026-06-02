import { type ZipEvent, type EventHandler } from "./types";

class EventBus {
  private handlers: Map<string, Set<EventHandler>> = new Map();

  subscribe(handler: EventHandler): () => void {
    const id = Math.random().toString(36).substring(7);
    if (!this.handlers.has(id)) {
      this.handlers.set(id, new Set());
    }
    this.handlers.get(id)!.add(handler);

    return () => {
      const handlers = this.handlers.get(id);
      if (handlers) {
        handlers.delete(handler);
        if (handlers.size === 0) {
          this.handlers.delete(id);
        }
      }
    };
  }

  emit(event: ZipEvent): void {
    for (const handlers of this.handlers.values()) {
      for (const handler of handlers) {
        try {
          handler(event);
        } catch (error) {
          console.error("Error in event handler:", error);
        }
      }
    }
  }

  clear(): void {
    this.handlers.clear();
  }
}

export const eventBus = new EventBus();

