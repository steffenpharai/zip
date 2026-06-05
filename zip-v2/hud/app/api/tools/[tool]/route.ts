import { NextRequest, NextResponse } from "next/server";
import { executeTool } from "@/lib/tools/executor";
import { generateRequestId, generateStepId } from "@/lib/observability/tracer";

// Force dynamic rendering (uses request.headers and request.text())
export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tool: string }> }
) {
  // Generate telemetry context for proper tracing
  const requestId = generateRequestId();
  const stepId = generateStepId();
  
  // Check if this is a panel update request (from usePanelUpdates hook)
  // Panel updates typically don't have a user input context
  const isPanelUpdate = !request.headers.get("x-user-input");
  
  try {
    let body = {};
    try {
      const text = await request.text();
      if (text) {
        body = JSON.parse(text);
      }
    } catch (e) {
      // Empty body is fine, use empty object
    }
    // In Next.js 16, params is a Promise
    const { tool } = await params;
    const toolName = tool;

    // Execute tool with proper telemetry context
    const result = await executeTool(toolName, body, {
      requestId,
      stepId,
      userInput: isPanelUpdate ? "Panel update request" : undefined,
    });

    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: 400 }
      );
    }

    return NextResponse.json({ result: result.result });
  } catch (error) {
    console.error("Tool execution error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

