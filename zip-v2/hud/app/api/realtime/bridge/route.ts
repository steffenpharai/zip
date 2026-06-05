import { NextRequest, NextResponse } from "next/server";
import { orchestrateConversation } from "@/lib/orchestrators/brain";
import { checkRateLimit } from "@/lib/middleware/rate-limit";
import { getSession } from "@/lib/voice/sessionStore";
import { createTraceContext } from "@/lib/observability/tracer";
import { convertToEvents } from "@/lib/voice/eventBridge";
import { z } from "zod";

// Force dynamic rendering (uses request for rate limiting and JSON parsing)
export const dynamic = "force-dynamic";

const bridgeRequestSchema = z.object({
  sessionId: z.string().uuid(),
  userTranscript: z.string().min(1),
  conversationSnapshot: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string(),
      })
    )
    .optional(),
  source: z.literal("voice"),
  confirmation: z
    .object({
      tool: z.string(),
      input: z.unknown(),
      confirmed: z.boolean(),
    })
    .optional(),
});

const BRIDGE_TIMEOUT_MS = 30000; // 30 seconds

export async function POST(request: NextRequest) {
  const traceContext = createTraceContext();

  try {
    // Rate limiting
    const rateLimit = checkRateLimit(request, "realtime_bridge", 100, 60 * 1000);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Rate limit exceeded", resetAt: rateLimit.resetAt },
        { status: 429 }
      );
    }

    // Validate request body
    const body = await request.json();
    const validated = bridgeRequestSchema.parse(body);

    // Verify session exists and is valid
    const session = getSession(validated.sessionId);
    if (!session) {
      return NextResponse.json(
        { error: "Invalid or expired session" },
        { status: 401 }
      );
    }

    if (session.expiresAt < Date.now()) {
      return NextResponse.json(
        { error: "Session expired" },
        { status: 401 }
      );
    }

    // Use conversation snapshot if provided, otherwise empty array
    const conversationHistory = validated.conversationSnapshot || [];

    // Handle confirmation
    if (validated.confirmation) {
      if (!validated.confirmation.confirmed) {
        return NextResponse.json({
          assistantText: "Action cancelled by user.",
          events: [
            {
              type: "chat.message",
              id: `msg-${Date.now()}`,
              role: "assistant",
              text: "Action cancelled by user.",
              ts: Date.now(),
            },
          ],
        });
      }
      
      // Re-run with confirmation (skipConfirmation=true)
      const orchestrationPromise = orchestrateConversation(
        validated.userTranscript,
        conversationHistory,
        {
          requestId: traceContext.requestId,
          skipConfirmation: true,
          contextData: undefined,
        }
      );

      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error("Orchestration timeout"));
        }, BRIDGE_TIMEOUT_MS);
      });

      const result = await Promise.race([
        orchestrationPromise,
        timeoutPromise,
      ]);

      // Convert tool results to events
      const events = convertToEvents(result.toolResults || [], traceContext.requestId);

      // Add assistant message event
      events.push({
        type: "chat.message",
        id: `msg-${Date.now()}`,
        role: "assistant",
        text: result.response,
        ts: Date.now(),
      });

      return NextResponse.json({
        assistantText: result.response,
        events,
      });
    }

    // Normal request - Call orchestration with timeout
    const orchestrationPromise = orchestrateConversation(
      validated.userTranscript,
      conversationHistory,
      {
        requestId: traceContext.requestId,
        skipConfirmation: false, // Voice confirmations will be handled via yes/no questions
        contextData: undefined, // Context can be added later if needed
      }
    );

    // Add timeout
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error("Orchestration timeout"));
      }, BRIDGE_TIMEOUT_MS);
    });

    const result = await Promise.race([
      orchestrationPromise,
      timeoutPromise,
    ]);

    // Handle confirmation requirement
    if (result.requiresConfirmation) {
      // Use the generated response (which explains what action is pending) 
      // and append confirmation prompt for voice interaction
      const confirmationText = result.response 
        ? `${result.response} Please say "yes" to confirm or "no" to cancel.`
        : `${result.requiresConfirmation.message} Please say "yes" to confirm or "no" to cancel.`;
      
      return NextResponse.json({
        assistantText: confirmationText,
        events: [
          {
            type: "chat.message",
            id: `msg-${Date.now()}`,
            role: "assistant",
            text: confirmationText,
            ts: Date.now(),
          },
          {
            type: "zip.state",
            mode: "THINKING",
            isOnline: true,
          },
        ],
        requiresConfirmation: result.requiresConfirmation,
      });
    }

    // Convert tool results to events
    const events = convertToEvents(result.toolResults || [], traceContext.requestId);

    // Add assistant message event
    events.push({
      type: "chat.message",
      id: `msg-${Date.now()}`,
      role: "assistant",
      text: result.response,
      ts: Date.now(),
    });

    // Audit logging (redact transcript if needed for privacy)
    // Note: In production, you might want to redact sensitive information
    console.log(`[Bridge] Session: ${validated.sessionId}, RequestId: ${traceContext.requestId}, Transcript length: ${validated.userTranscript.length}`);

    return NextResponse.json({
      assistantText: result.response,
      events,
    });
  } catch (error) {
    console.error("Realtime bridge error:", error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid request", details: error.errors },
        { status: 400 }
      );
    }

    if (error instanceof Error && error.message === "Orchestration timeout") {
      return NextResponse.json(
        { error: "Request timeout" },
        { status: 504 }
      );
    }

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

