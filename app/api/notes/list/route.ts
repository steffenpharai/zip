import { NextRequest, NextResponse } from "next/server";
import { listNotes, listNotesOutputSchema } from "@/lib/tools/implementations/notes";
import { checkRateLimit } from "@/lib/middleware/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const rateLimit = checkRateLimit(request, "list_notes");
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Rate limit exceeded", resetAt: rateLimit.resetAt },
        { status: 429 }
      );
    }
    
    const result = await listNotes();
    const validatedOutput = listNotesOutputSchema.parse(result);
    
    return NextResponse.json(validatedOutput);
  } catch (error) {
    console.error("Note list API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

