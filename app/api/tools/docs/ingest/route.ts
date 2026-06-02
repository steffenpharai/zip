import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ingestDocument, ingestDocumentSchema, ingestDocumentOutputSchema } from "@/lib/tools/implementations/docs/ingest";
import { checkRateLimit } from "@/lib/middleware/rate-limit";

// Force dynamic rendering (uses request for rate limiting and JSON parsing)
export const dynamic = "force-dynamic";

const requestSchema = z.object({
  filename: z.string(),
  fileData: z.string(),
  fileType: z.enum(["pdf", "txt"]).optional(),
});

export async function POST(request: NextRequest) {
  try {
    // Rate limiting
    const rateLimit = checkRateLimit(request, "doc_ingest");
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Rate limit exceeded", resetAt: rateLimit.resetAt },
        { status: 429 }
      );
    }
    
    const body = await request.json();
    const validated = requestSchema.parse(body);
    
    const result = await ingestDocument({
      filename: validated.filename,
      fileData: validated.fileData,
      fileType: validated.fileType || "pdf",
    });
    
    // Validate output
    const validatedOutput = ingestDocumentOutputSchema.parse(result);
    
    return NextResponse.json(validatedOutput);
  } catch (error) {
    console.error("Document ingest API error:", error);
    
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

