import { NextRequest, NextResponse } from "next/server";
import { transcribeAudio } from "@/lib/openai/stt";
import { checkRateLimit } from "@/lib/middleware/rate-limit";

// Force dynamic rendering (uses request for rate limiting and form data)
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    // Rate limiting
    const rateLimit = checkRateLimit(request, "voice_transcribe", 60, 60 * 1000);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Rate limit exceeded", resetAt: rateLimit.resetAt },
        { status: 429 }
      );
    }

    // Check if fallback is enabled
    const fallbackEnabled = process.env.ZIP_VOICE_FALLBACK_ENABLED !== "false";
    if (!fallbackEnabled) {
      return NextResponse.json(
        { error: "Voice fallback is disabled" },
        { status: 503 }
      );
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "OPENAI_API_KEY not configured" },
        { status: 503 }
      );
    }

    // Get audio file from form data
    const formData = await request.formData();
    const audioFile = formData.get("audio") as File | null;

    if (!audioFile) {
      return NextResponse.json(
        { error: "No audio file provided" },
        { status: 400 }
      );
    }

    // Check if audio file is empty
    if (audioFile.size === 0) {
      return NextResponse.json(
        { error: "Audio file is empty" },
        { status: 400 }
      );
    }

    // Transcribe audio
    const result = await transcribeAudio(audioFile);

    return NextResponse.json({
      transcript: result.transcript,
      language: result.language,
    });
  } catch (error) {
    console.error("Voice transcribe error:", error);

    if (error instanceof Error) {
      if (error.message.includes("not configured")) {
        return NextResponse.json(
          { error: "OpenAI API key not configured" },
          { status: 503 }
        );
      }
    }

    return NextResponse.json(
      { error: "Failed to transcribe audio" },
      { status: 500 }
    );
  }
}

