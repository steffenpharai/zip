import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { docAnswer, docAnswerSchema, docAnswerOutputSchema } from "@/lib/tools/implementations/docs/answer";
import { checkRateLimit } from "@/lib/middleware/rate-limit";

// Force dynamic rendering (uses request for rate limiting and JSON parsing)
export const dynamic = "force-dynamic";

const requestSchema = z.object({
  question: z.string(),
  docId: z.string().optional(),
  maxChunks: z.number().int().positive().max(5).optional(),
});

export async function POST(request: NextRequest) {
  try {
    // Rate limiting
    const rateLimit = checkRateLimit(request, "doc_answer");
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Rate limit exceeded", resetAt: rateLimit.resetAt },
        { status: 429 }
      );
    }
    
    const body = await request.json();
    const validated = requestSchema.parse(body);
    
    const result = await docAnswer({
      question: validated.question,
      docId: validated.docId,
      maxChunks: validated.maxChunks || 3,
    });
    
    // Validate output
    const validatedOutput = docAnswerOutputSchema.parse(result);
    
    return NextResponse.json(validatedOutput);
  } catch (error) {
    console.error("Document answer API error:", error);
    
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

