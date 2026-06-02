import { NextRequest, NextResponse } from "next/server";
import { createNote, createNoteSchema, createNoteOutputSchema } from "@/lib/tools/implementations/notes";
import { checkRateLimit } from "@/lib/middleware/rate-limit";
import { z } from "zod";

// Force dynamic rendering (uses request for rate limiting and JSON parsing)
export const dynamic = "force-dynamic";

const requestSchema = z.object({
  title: z.string().min(1).max(200),
  body: z.string().min(1).max(10000),
});

export async function POST(request: NextRequest) {
  try {
    const rateLimit = checkRateLimit(request, "create_note");
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Rate limit exceeded", resetAt: rateLimit.resetAt },
        { status: 429 }
      );
    }
    
    const body = await request.json();
    const validated = requestSchema.parse(body);
    
    const result = await createNote(validated);
    const validatedOutput = createNoteOutputSchema.parse(result);
    
    return NextResponse.json(validatedOutput);
  } catch (error) {
    console.error("Note create API error:", error);
    
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

