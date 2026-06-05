import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { analyzeImage, analyzeImageSchema, analyzeImageOutputSchema } from "@/lib/tools/implementations/vision";
import { checkRateLimit } from "@/lib/middleware/rate-limit";

// Force dynamic rendering (uses request for rate limiting and JSON parsing)
export const dynamic = "force-dynamic";

const requestSchema = z.object({
  imageBase64: z.string().optional(),
  imageUrl: z.string().optional(),
  source: z.enum(["webcam", "upload"]).optional().default("webcam"),
  prompt: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    // Rate limiting
    const rateLimit = checkRateLimit(request, "vision");
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Rate limit exceeded", resetAt: rateLimit.resetAt },
        { status: 429 }
      );
    }
    
    const body = await request.json();
    const validated = requestSchema.parse(body);
    
    const result = await analyzeImage(validated);
    
    // Validate output
    const validatedOutput = analyzeImageOutputSchema.parse(result);
    
    return NextResponse.json(validatedOutput);
  } catch (error) {
    console.error("Vision API error:", error);
    
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

