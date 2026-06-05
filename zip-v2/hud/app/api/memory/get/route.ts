import { NextRequest, NextResponse } from "next/server";
import { getAllPinnedMemory, getMemory } from "@/lib/memory/memory-store";
import { z } from "zod";

export const dynamic = "force-dynamic";

const requestSchema = z.object({
  key: z.string().optional(),
});

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const key = searchParams.get("key");
    
    if (key) {
      const memory = getMemory(key);
      if (!memory) {
        return NextResponse.json({ error: "Memory not found" }, { status: 404 });
      }
      return NextResponse.json(memory);
    }
    
    const allMemory = getAllPinnedMemory();
    return NextResponse.json({ memories: allMemory });
  } catch (error) {
    console.error("Memory get API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

