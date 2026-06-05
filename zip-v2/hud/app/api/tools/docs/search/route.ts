import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { docSearch, docSearchSchema, docSearchOutputSchema } from "@/lib/tools/implementations/docs/search";
import { checkRateLimit } from "@/lib/middleware/rate-limit";

// Force dynamic rendering (uses request for rate limiting and JSON parsing)
export const dynamic = "force-dynamic";

const requestSchema = z.object({
  query: z.string(),
  maxResults: z.number().int().positive().max(10).optional(),
  docId: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    // Rate limiting
    const rateLimit = checkRateLimit(request, "doc_search");
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Rate limit exceeded", resetAt: rateLimit.resetAt },
        { status: 429 }
      );
    }
    
    const body = await request.json();
    const validated = requestSchema.parse(body);
    
    const result = await docSearch({
      query: validated.query,
      docId: validated.docId,
      maxResults: validated.maxResults || 5,
    });
    
    // Validate output
    const validatedOutput = docSearchOutputSchema.parse(result);
    
    return NextResponse.json(validatedOutput);
  } catch (error) {
    console.error("Document search API error:", error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid request", details: error.errors },
        { status: 400 }
      );
    }
    
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}

