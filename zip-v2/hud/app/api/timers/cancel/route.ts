import { NextRequest, NextResponse } from "next/server";
import { cancelTimer, cancelTimerSchema, cancelTimerOutputSchema } from "@/lib/tools/implementations/timers";
import { checkRateLimit } from "@/lib/middleware/rate-limit";

// Force dynamic rendering (uses request for rate limiting)
export const dynamic = "force-dynamic";

export async function DELETE(request: NextRequest) {
  try {
    const rateLimit = checkRateLimit(request, "cancel_timer");
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Rate limit exceeded", resetAt: rateLimit.resetAt },
        { status: 429 }
      );
    }
    
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    
    if (!id) {
      return NextResponse.json(
        { error: "ID parameter required" },
        { status: 400 }
      );
    }
    
    const result = await cancelTimer({ id });
    const validatedOutput = cancelTimerOutputSchema.parse(result);
    
    return NextResponse.json(validatedOutput);
  } catch (error) {
    console.error("Timer cancel API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

