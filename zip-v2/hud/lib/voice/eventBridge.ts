/**
 * Event Bridge - Converts orchestrator results to event bus events
 * 
 * Maps tool results to panel.update and tool.card events for the UI
 */

import type { ZipEvent } from "@/lib/events/types";

export function convertToEvents(
  toolResults: Array<{ tool: string; result: unknown }>,
  requestId: string
): ZipEvent[] {
  const events: ZipEvent[] = [];

  for (const toolResult of toolResults) {
    const { tool, result } = toolResult;

    // Map tool results to panel updates
    if (tool === "get_system_stats") {
      events.push({
        type: "panel.update",
        panel: "system",
        payload: result,
        ts: Date.now(),
      });
    } else if (tool === "get_weather") {
      events.push({
        type: "panel.update",
        panel: "weather",
        payload: result,
        ts: Date.now(),
      });
    } else if (tool === "get_uptime") {
      events.push({
        type: "panel.update",
        panel: "uptime",
        payload: result,
        ts: Date.now(),
      });
    } else if (tool === "research") {
      // Research results as tool card
      const researchResult = result as {
        summary?: string;
        citations?: Array<{ url: string; title: string; quote: string }>;
        sources?: Array<{ title: string; url: string; snippet: string }>;
      };
      events.push({
        type: "tool.card",
        toolType: "research",
        payload: {
          type: "research",
          query: "", // Query not available in result, but required by type
          summary: researchResult.summary || "",
          citations: researchResult.citations || [],
          sources: researchResult.sources || [],
        },
        ts: Date.now(),
      });
    } else if (tool === "workflow") {
      // Workflow results as tool card
      events.push({
        type: "tool.card",
        toolType: "workflow",
        payload: {
          type: "workflow",
          success: (result as { success?: boolean })?.success || false,
          steps: (result as { steps?: unknown[] })?.steps || [],
          summary: (result as { summary?: string })?.summary || "",
        },
        ts: Date.now(),
      });
    } else {
      // Generic tool card for other tools
      events.push({
        type: "tool.card",
        toolType: tool,
        payload: {
          type: tool,
          result,
        },
        ts: Date.now(),
      });
    }
  }

  return events;
}

