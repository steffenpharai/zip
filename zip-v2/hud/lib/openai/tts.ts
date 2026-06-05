/**
 * Text-to-Speech (TTS) using OpenAI TTS API
 * 
 * Provides fallback speech synthesis when Realtime WebRTC is unavailable
 */

import OpenAI from "openai";
import { getVoicePersona } from "@/lib/voice/voicePersona";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export interface TTSOptions {
  voice?: "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer" | "cedar" | "marin";
  speed?: number; // 0.25 to 4.0
  responseFormat?: "mp3" | "opus" | "aac" | "flac" | "wav";
  instructions?: string; // New field for gpt-4o-mini-tts models
}

export interface TTSResult {
  audio: Buffer;
  format: string;
}

/**
 * Synthesize speech from text using OpenAI TTS API
 * 
 * @param text - Text to synthesize
 * @param options - Optional TTS settings
 * @returns Audio buffer
 */
export async function synthesizeSpeech(
  text: string,
  options: TTSOptions = {}
): Promise<TTSResult> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY not configured");
  }

  const model = process.env.OPENAI_TTS_MODEL || "gpt-4o-mini-tts-2025-12-15";
  const voicePersona = getVoicePersona();
  
  // Use voice persona settings if not overridden
  const voice = options.voice || voicePersona.ttsVoice;
  const speed = options.speed ?? voicePersona.ttsSpeed;
  const responseFormat = options.responseFormat || "wav";
  
  // Get instructions from options or voice persona
  const instructions = options.instructions ?? voicePersona.ttsInstructions;

  // Build request parameters
  const requestParams: any = {
    model,
    voice,
    input: text,
    speed,
    response_format: responseFormat,
  };

  // Add instructions only for gpt-4o-mini-tts models
  if (model.startsWith("gpt-4o-mini-tts") && instructions) {
    requestParams.instructions = instructions;
  }

  const response = await openai.audio.speech.create(requestParams);

  // Convert response to buffer
  const arrayBuffer = await response.arrayBuffer();
  const audio = Buffer.from(arrayBuffer);

  return {
    audio,
    format: responseFormat,
  };
}

