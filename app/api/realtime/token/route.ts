import { NextResponse } from "next/server";
import OpenAI from "openai";
import { checkRateLimit } from "@/lib/middleware/rate-limit";
import { randomUUID } from "crypto";
import { getRealtimeSessionConfig } from "@/lib/voice/voicePersona";
import { setSession } from "@/lib/voice/sessionStore";

// Force dynamic rendering (uses request.headers for rate limiting)
export const dynamic = "force-dynamic";

// Lazy initialization to avoid build-time evaluation
function getOpenAIClient(): OpenAI {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY not configured");
  }
  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });
}

export async function GET(request: Request) {
  try {
    // Rate limiting
    const rateLimit = checkRateLimit(request, "realtime_token", 60, 60 * 1000);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Rate limit exceeded", resetAt: rateLimit.resetAt },
        { status: 429 }
      );
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "OPENAI_API_KEY not configured" },
        { status: 503 }
      );
    }

    // Check if Realtime is enabled
    const realtimeEnabled = process.env.ZIP_REALTIME_ENABLED !== "false";
    if (!realtimeEnabled) {
      return NextResponse.json(
        { error: "Realtime is disabled" },
        { status: 503 }
      );
    }

    // Generate server-side session ID
    const sessionId = randomUUID();
    const realtimeModel =
      process.env.OPENAI_REALTIME_MODEL || "gpt-4o-realtime-preview-2024-12-17";
    
    // Get session config from voice persona
    const sessionConfig = getRealtimeSessionConfig();

    // Create ephemeral session using OpenAI SDK
    const openai = getOpenAIClient();
    let clientSecret: string | undefined;
    try {
      const session = await openai.beta.realtime.sessions.create({
        model: realtimeModel as any,
        modalities: sessionConfig.modalities as ("text" | "audio")[],
        instructions: sessionConfig.instructions,
        voice: sessionConfig.voice as any,
        input_audio_format: sessionConfig.input_audio_format as "pcm16" | "g711_ulaw" | "g711_alaw",
        output_audio_format: sessionConfig.output_audio_format as "pcm16" | "g711_ulaw" | "g711_alaw",
      });
      
      // Extract client_secret if available (ephemeral token)
      clientSecret = (session as any).client_secret;
    } catch (error) {
      console.warn("Failed to create OpenAI Realtime session, using fallback:", error);
      // Continue without ephemeral token - client will use API key proxy
    }
    
    // Sessions expire after 1 hour
    const expiresAt = Date.now() + 60 * 60 * 1000;

    // Store session mapping
    setSession(sessionId, {
      createdAt: Date.now(),
      expiresAt,
      clientSecret,
    });

    // Return ephemeral token information for WebRTC connection
    return NextResponse.json({
      sessionId,
      realtimeModel,
      expiresAt,
      ephemeralKey: clientSecret, // Ephemeral token for client-side connection
    });
  } catch (error) {
    console.error("Realtime token error:", error);
    return NextResponse.json(
      { error: "Failed to create Realtime session" },
      { status: 500 }
    );
  }
}

