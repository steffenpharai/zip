/**
 * Speech-to-Text (STT) using OpenAI Whisper API
 * 
 * Provides fallback transcription when Realtime WebRTC is unavailable
 */

import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export interface STTOptions {
  language?: string;
  prompt?: string;
  temperature?: number;
}

export interface STTResult {
  transcript: string;
  language?: string;
}

/**
 * Transcribe audio using OpenAI Whisper API
 * 
 * @param audioFile - Audio file as Buffer, File, or Blob
 * @param options - Optional transcription settings
 * @returns Transcript text
 */
export async function transcribeAudio(
  audioFile: Buffer | File | Blob,
  options: STTOptions = {}
): Promise<STTResult> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY not configured");
  }

  const model = process.env.OPENAI_STT_MODEL || "whisper-1";

  // Convert Blob to File if needed
  let file: File;
  if (audioFile instanceof Blob && !(audioFile instanceof File)) {
    file = new File([audioFile], "audio.webm", { type: audioFile.type || "audio/webm" });
  } else if (Buffer.isBuffer(audioFile)) {
    // Convert Buffer to File - convert to Uint8Array first
    const uint8Array = new Uint8Array(audioFile);
    file = new File([uint8Array], "audio.webm", { type: "audio/webm" });
  } else {
    file = audioFile as File;
  }

  const transcription = await openai.audio.transcriptions.create({
    file,
    model,
    language: options.language,
    prompt: options.prompt,
    temperature: options.temperature,
  });

  return {
    transcript: transcription.text,
    // Note: language is not always available in transcription response
    language: undefined,
  };
}

