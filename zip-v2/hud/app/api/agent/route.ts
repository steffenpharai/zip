import { NextRequest, NextResponse } from "next/server";
import { orchestrateConversationWithBrain } from "@/lib/openai/responses";
import { z } from "zod";
import { createTraceContext } from "@/lib/observability/tracer";

// Force dynamic rendering (uses request.json() and dynamic data)
export const dynamic = "force-dynamic";

const contextDataSchema = z.object({
  location: z.object({
    lat: z.number(),
    lon: z.number(),
  }).optional(),
  weather: z.any().optional(), // Weather data structure is complex, use any for flexibility
  systemStats: z.object({
    cpuPercent: z.number(),
    ramUsedGb: z.number(),
    ramTotalGb: z.number(),
    diskUsedGb: z.number(),
    diskTotalGb: z.number(),
    cpuLabel: z.string(),
    memLabel: z.string(),
    diskLabel: z.string(),
  }).optional(),
  uptime: z.object({
    runningSeconds: z.number(),
    sessionCount: z.number(),
    commandsCount: z.number(),
    loadLabel: z.string(),
    loadPercent: z.number(),
    sessionTimeLabel: z.string(),
  }).optional(),
  cameraEnabled: z.boolean().optional(),
});

const requestSchema = z.object({
  message: z.string(),
  conversationHistory: z.array(
    z.object({
      role: z.enum(["user", "assistant"]),
      content: z.string(),
    })
  ),
  sessionState: z
    .object({
      sessionStartTime: z.number().optional(),
      commandsCount: z.number().optional(),
    })
    .optional(),
  confirmation: z
    .object({
      tool: z.string(),
      input: z.unknown(),
      confirmed: z.boolean(),
    })
    .optional(),
  contextData: contextDataSchema.optional(),
});

export async function POST(request: NextRequest) {
  const traceContext = createTraceContext();
  
  try {
    const body = await request.json();
    const validated = requestSchema.parse(body);

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        {
          response:
            "OpenAI API key not configured. Please set OPENAI_API_KEY in your environment.",
          error: "CONFIG_MISSING",
        },
        { status: 503 }
      );
    }

    // Create SSE stream
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const sendEvent = (type: string, data: unknown) => {
          try {
            const message = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
            controller.enqueue(encoder.encode(message));
          } catch (error) {
            console.error("Error sending SSE event:", error);
          }
        };

        try {
          // Handle confirmation
          if (validated.confirmation) {
            if (!validated.confirmation.confirmed) {
              sendEvent("text", { delta: "Action cancelled by user." });
              sendEvent("done", {});
              controller.close();
              return;
            }
            
            // Enhance conversation history to include tool call context
            // This helps the LLM understand it should execute the tool
            const enhancedHistory = [
              ...validated.conversationHistory,
              {
                role: "user" as const,
                content: `Please execute the ${validated.confirmation.tool} tool with the confirmed parameters.`,
              },
            ];
            
            console.log(`[agent] Confirmation re-run: tool=${validated.confirmation.tool}, skipConfirmation=true`);
            
            // Re-run with confirmation
            const result = await orchestrateConversationWithBrain(
              validated.message,
              enhancedHistory,
              {
                requestId: traceContext.requestId,
                skipConfirmation: true,
                contextData: validated.contextData,
                callbacks: {
                  onTextDelta: (delta) => sendEvent("text", { delta }),
                  onActivity: (activity) => sendEvent("activity", activity),
                  onComplete: () => {
                    // Completion signaled
                  },
                },
              }
            );

            // Send tool results if any
            if (result.toolResults && result.toolResults.length > 0) {
              sendEvent("toolResults", result.toolResults);
            }

            sendEvent("done", {});
            controller.close();
            return;
          }

          // Normal request - use AI Brain orchestration system
          const result = await orchestrateConversationWithBrain(
            validated.message,
            validated.conversationHistory,
            {
              requestId: traceContext.requestId,
              skipConfirmation: false,
              contextData: validated.contextData,
              callbacks: {
                onTextDelta: (delta) => sendEvent("text", { delta }),
                onActivity: (activity) => sendEvent("activity", activity),
                onComplete: () => {
                  // Completion is signaled, but we handle results after await
                },
              },
            }
          );

          // Handle confirmation requirement
          if (result.requiresConfirmation) {
            sendEvent("confirmation", result.requiresConfirmation);
          }

          // Send tool results if any
          if (result.toolResults && result.toolResults.length > 0) {
            console.log(`[agent] Sending ${result.toolResults.length} tool results:`, result.toolResults.map(r => r.tool));
            sendEvent("toolResults", result.toolResults);
          } else {
            console.log(`[agent] No tool results to send (toolResults: ${result.toolResults ? 'exists but empty' : 'undefined'})`);
          }

          // Signal completion
          sendEvent("done", {});
          controller.close();
        } catch (error) {
          console.error("Streaming error:", error);
          sendEvent("error", { 
            message: error instanceof Error ? error.message : "Internal server error" 
          });
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
    });
  } catch (error) {
    console.error("Agent API error:", error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid request", details: error.errors },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

