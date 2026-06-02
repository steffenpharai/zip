import { NextRequest, NextResponse } from "next/server";
import { setMemory } from "@/lib/memory/memory-store";
import { z } from "zod";

// Force dynamic rendering (uses request.json())
export const dynamic = "force-dynamic";

const requestSchema = z.object({
  key: z.string().min(1),
  value: z.string().min(1),
  pinned: z.boolean().default(true),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validated = requestSchema.parse(body);
    
    setMemory(validated.key, validated.value, validated.pinned);
    
    return NextResponse.json({
      success: true,
      key: validated.key,
      value: validated.value,
      pinned: validated.pinned,
    });
  } catch (error) {
    console.error("Memory add API error:", error);
    
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

