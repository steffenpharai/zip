import { NextRequest, NextResponse } from "next/server";
import { deleteMemory } from "@/lib/memory/memory-store";
import { z } from "zod";

// Force dynamic rendering (uses request.json())
export const dynamic = "force-dynamic";

const requestSchema = z.object({
  key: z.string().min(1),
});

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const key = searchParams.get("key");
    
    if (!key) {
      return NextResponse.json(
        { error: "Key parameter required" },
        { status: 400 }
      );
    }
    
    const deleted = deleteMemory(key);
    
    if (!deleted) {
      return NextResponse.json(
        { error: "Memory not found" },
        { status: 404 }
      );
    }
    
    return NextResponse.json({
      success: true,
      key,
    });
  } catch (error) {
    console.error("Memory delete API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

