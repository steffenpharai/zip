import { NextRequest, NextResponse } from "next/server";
import { synthesizeSpeech } from "@/lib/openai/tts";
import { checkRateLimit } from "@/lib/middleware/rate-limit";
import { getVoicePersona } from "@/lib/voice/voicePersona";
import { z } from "zod";

// Force dynamic rendering (uses request for rate limiting and JSON parsing)
export const dynamic = "force-dynamic";

const speakRequestSchema = z.object({
  text: z.string().min(1),
  voice: z.enum(["alloy", "echo", "fable", "onyx", "nova", "shimmer", "cedar", "marin"]).optional(),
  speed: z.number().min(0.25).max(4.0).optional(),
  responseFormat: z.enum(["mp3", "opus", "aac", "flac", "wav"]).optional(),
  instructions: z.string().optional(), // New field for JARVIS voice instructions
});

export async function POST(request: NextRequest) {
  try {
    // Rate limiting
    const rateLimit = checkRateLimit(request, "voice_speak", 60, 60 * 1000);
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

    // Validate request body
    const body = await request.json();
    const validated = speakRequestSchema.parse(body);

    // Get voice persona for default instructions
    const voicePersona = getVoicePersona();

    // Synthesize speech
    const result = await synthesizeSpeech(validated.text, {
      voice: validated.voice,
      speed: validated.speed,
      responseFormat: validated.responseFormat,
      instructions: validated.instructions || voicePersona.ttsInstructions, // Use persona instructions as default
    });

    // Return audio as base64 for easier client handling
    const base64Audio = result.audio.toString("base64");

    return NextResponse.json({
      audio: base64Audio,
      format: result.format,
    });
  } catch (error) {
    console.error("Voice speak error:", error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid request", details: error.errors },
        { status: 400 }
      );
    }

    if (error instanceof Error) {
      if (error.message.includes("not configured")) {
        return NextResponse.json(
          { error: "OpenAI API key not configured" },
          { status: 503 }
        );
      }
    }

    return NextResponse.json(
      { error: "Failed to synthesize speech" },
      { status: 500 }
    );
  }
}

