import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { fetchUrl, fetchUrlSchema, fetchUrlOutputSchema } from "@/lib/tools/implementations/web-fetch";
import { checkRateLimit } from "@/lib/middleware/rate-limit";

// Force dynamic rendering (uses request for rate limiting and JSON parsing)
export const dynamic = "force-dynamic";

const requestSchema = z.object({
  url: z.string().url(),
  maxSize: z.number().int().positive().max(1048576).optional(),
});

export async function POST(request: NextRequest) {
  try {
    // Rate limiting
    const rateLimit = checkRateLimit(request, "fetch_url");
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Rate limit exceeded", resetAt: rateLimit.resetAt },
        { status: 429 }
      );
    }
    
    const body = await request.json();
    const validated = requestSchema.parse(body);
    
    const result = await fetchUrl({
      url: validated.url,
      maxSize: validated.maxSize || 1048576,
    });
    
    // Validate output
    const validatedOutput = fetchUrlOutputSchema.parse(result);
    
    return NextResponse.json(validatedOutput);
  } catch (error) {
    console.error("Fetch URL API error:", error);
    
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

