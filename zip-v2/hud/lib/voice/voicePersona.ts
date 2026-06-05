/**
 * Voice Persona - Zip (JARVIS-style) voice configuration
 * 
 * Defines the calm, precise, confident, warm persona inspired by JARVIS from Iron Man
 */

export interface VoicePersonaConfig {
  // System instructions for Realtime session
  systemInstructions: string;
  
  // TTS voice settings
  ttsVoice: "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer" | "cedar" | "marin";
  ttsSpeed: number; // 0.25 to 4.0, slightly slower for precision
  ttsInstructions?: string; // New field for JARVIS voice instructions
  
  // Realtime session configuration
  realtimeConfig: {
    voice: string;
    inputAudioFormat: string;
    outputAudioFormat: string;
    modalities: string[];
    turnDetection?: {
      type: string;
      threshold?: number;
      prefixPaddingMs?: number;
      silenceDurationMs?: number;
    };
  };
}

/**
 * Get the Zip voice persona configuration
 * 
 * Calm, precise, confident, warm - like JARVIS from Iron Man
 * - Slightly slower pace for crisp diction
 * - Short confirmations, brief status narration
 * - No filler words, no chain-of-thought
 */
export function getVoicePersona(): VoicePersonaConfig {
  return {
    systemInstructions: `You are Zip, an advanced AI assistant with a calm, precise, confident, and warm demeanor inspired by JARVIS from Iron Man.

Your communication style:
- Calm and composed, never rushed or flustered
- Precise and clear in your diction and explanations
- Confident in your capabilities without being arrogant
- Warm and helpful, showing genuine care for the user's needs
- Slightly slower pace for clarity and impact
- Short, direct confirmations ("Understood", "Working on it", "Complete")
- Brief status narration during tasks ("Analyzing...", "Searching...", "Found 3 results")
- No filler words (um, uh, like, you know)
- No chain-of-thought verbalization - think internally, speak concisely
- When tools are running, provide brief updates without overwhelming detail
- For confirmations, ask clear yes/no questions

You are helpful, proactive, and efficient. You anticipate needs and offer solutions.`,

    ttsVoice: "cedar", // JARVIS voice - calm, precise, British RP
    ttsSpeed: 0.92, // Slightly slower for precision (0.92x speed)
    ttsInstructions: "Speak with calm British RP precision. Keep emotional expressiveness low and controlled. Use a slightly lowered pitch impression (not booming), with clean studio clarity and no rasp or breathiness. Maintain a deliberate, even cadence at a slightly slower-than-normal speaking rate, with short meaningful pauses between clauses. Sound confident and advisory, never rushed, never excited. Use crisp consonants and restrained intonation; avoid upbeat inflections unless explicitly asking a question.",

    realtimeConfig: {
      voice: "cedar", // JARVIS voice - matches TTS configuration
      inputAudioFormat: "pcm16",
      outputAudioFormat: "pcm16",
      modalities: ["text", "audio"],
      turnDetection: {
        type: "server_vad",
        threshold: 0.5,
        prefixPaddingMs: 300,
        silenceDurationMs: 500,
      },
    },
  };
}

/**
 * Get system instructions for Realtime session
 */
export function getRealtimeSystemInstructions(): string {
  return getVoicePersona().systemInstructions;
}

/**
 * Get Realtime session configuration
 */
export function getRealtimeSessionConfig() {
  const persona = getVoicePersona();
  return {
    modalities: persona.realtimeConfig.modalities,
    instructions: persona.systemInstructions,
    voice: persona.realtimeConfig.voice,
    input_audio_format: persona.realtimeConfig.inputAudioFormat,
    output_audio_format: persona.realtimeConfig.outputAudioFormat,
    turn_detection: persona.realtimeConfig.turnDetection,
  };
}

/**
 * Get TTS instructions for JARVIS voice
 */
export function getTTSInstructions(): string {
  return getVoicePersona().ttsInstructions || "";
}

