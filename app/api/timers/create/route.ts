import { NextRequest, NextResponse } from "next/server";
import { createTimer, createTimerSchema, createTimerOutputSchema } from "@/lib/tools/implementations/timers";
import { checkRateLimit } from "@/lib/middleware/rate-limit";
import { z } from "zod";

// Force dynamic rendering (uses request for rate limiting and JSON parsing)
export const dynamic = "force-dynamic";

const requestSchema = z.object({
  seconds: z.number().int().positive().max(3600),
  message: z.string().min(1).max(500),
});

export async function POST(request: NextRequest) {
  try {
    const rateLimit = checkRateLimit(request, "create_timer");
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Rate limit exceeded", resetAt: rateLimit.resetAt },
        { status: 429 }
      );
    }
    
    const body = await request.json();
    const validated = requestSchema.parse(body);
    
    const result = await createTimer(validated);
    const validatedOutput = createTimerOutputSchema.parse(result);
    
    return NextResponse.json(validatedOutput);
  } catch (error) {
    console.error("Timer create API error:", error);
    
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

