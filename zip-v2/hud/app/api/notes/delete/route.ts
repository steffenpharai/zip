import { NextRequest, NextResponse } from "next/server";
import { deleteNote, deleteNoteSchema, deleteNoteOutputSchema } from "@/lib/tools/implementations/notes";
import { checkRateLimit } from "@/lib/middleware/rate-limit";
import { z } from "zod";

// Force dynamic rendering (uses request for rate limiting and JSON parsing)
export const dynamic = "force-dynamic";

const requestSchema = z.object({
  id: z.number().int().positive(),
});

export async function DELETE(request: NextRequest) {
  try {
    const rateLimit = checkRateLimit(request, "delete_note");
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Rate limit exceeded", resetAt: rateLimit.resetAt },
        { status: 429 }
      );
    }
    
    const { searchParams } = new URL(request.url);
    const idParam = searchParams.get("id");
    
    if (!idParam) {
      return NextResponse.json(
        { error: "ID parameter required" },
        { status: 400 }
      );
    }
    
    const id = parseInt(idParam, 10);
    if (isNaN(id)) {
      return NextResponse.json(
        { error: "Invalid ID" },
        { status: 400 }
      );
    }
    
    const result = await deleteNote({ id });
    const validatedOutput = deleteNoteOutputSchema.parse(result);
    
    return NextResponse.json(validatedOutput);
  } catch (error) {
    console.error("Note delete API error:", error);
    
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

