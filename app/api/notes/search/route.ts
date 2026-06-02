import { NextRequest, NextResponse } from "next/server";
import { searchNotes, searchNotesSchema, searchNotesOutputSchema } from "@/lib/tools/implementations/notes";
import { checkRateLimit } from "@/lib/middleware/rate-limit";
import { z } from "zod";

// Force dynamic rendering (uses request for rate limiting and JSON parsing)
export const dynamic = "force-dynamic";

const requestSchema = z.object({
  query: z.string().min(1),
});

export async function POST(request: NextRequest) {
  try {
    const rateLimit = checkRateLimit(request, "search_notes");
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Rate limit exceeded", resetAt: rateLimit.resetAt },
        { status: 429 }
      );
    }
    
    const body = await request.json();
    const validated = requestSchema.parse(body);
    
    const result = await searchNotes(validated);
    const validatedOutput = searchNotesOutputSchema.parse(result);
    
    return NextResponse.json(validatedOutput);
  } catch (error) {
    console.error("Note search API error:", error);
    
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

