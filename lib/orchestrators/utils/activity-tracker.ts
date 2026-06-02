/**
 * Activity Tracker Utility
 * 
 * Tracks and emits activity events throughout orchestration
 */

import type { BrainActivityEvent } from "@/lib/events/types";

export interface ActivityCallback {
  (activity: BrainActivityEvent["activity"]): void;
}

export class ActivityTracker {
  private callbacks: ActivityCallback[] = [];

  /**
   * Register a callback for activity events
   */
  onActivity(callback: ActivityCallback): void {
    this.callbacks.push(callback);
  }

  /**
   * Remove a callback
   */
  removeCallback(callback: ActivityCallback): void {
    const index = this.callbacks.indexOf(callback);
    if (index > -1) {
      this.callbacks.splice(index, 1);
    }
  }

  /**
   * Emit node entry activity
   */
  emitNodeEnter(node: string, requestId: string): void {
    this.emit({
      node,
      action: "node.enter",
      timestamp: Date.now(),
      requestId,
    });
  }

  /**
   * Emit node exit activity
   */
  emitNodeExit(node: string, requestId: string): void {
    this.emit({
      node,
      action: "node.exit",
      timestamp: Date.now(),
      requestId,
    });
  }

  /**
   * Emit tool start activity
   */
  emitToolStart(tool: string, input: unknown, requestId: string): void {
    this.emit({
      action: "tool.start",
      tool,
      toolInput: input,
      timestamp: Date.now(),
      requestId,
    });
  }

  /**
   * Emit tool complete activity
   */
  emitToolComplete(tool: string, output: unknown, requestId: string): void {
    this.emit({
      action: "tool.complete",
      tool,
      toolOutput: output,
      timestamp: Date.now(),
      requestId,
    });
  }

  /**
   * Emit LLM call activity
   */
  emitLLMCall(model: string, prompt: string, requestId: string): void {
    this.emit({
      action: "llm.call",
      llmModel: model,
      llmPrompt: prompt.substring(0, 200) + (prompt.length > 200 ? "..." : ""), // Truncate for display
      timestamp: Date.now(),
      requestId,
    });
  }

  /**
   * Emit state update activity
   */
  emitStateUpdate(field: string, value: unknown, requestId: string): void {
    this.emit({
      action: "state.update",
      stateChange: { field, value },
      timestamp: Date.now(),
      requestId,
    });
  }

  /**
   * Internal emit method
   */
  private emit(activity: BrainActivityEvent["activity"]): void {
    this.callbacks.forEach((callback) => {
      try {
        callback(activity);
      } catch (error) {
        console.error("Error in activity callback:", error);
      }
    });
  }
}

