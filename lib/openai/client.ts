/**
 * Lazy OpenAI client initialization
 * 
 * This ensures OpenAI clients are only created at runtime, not during build.
 * The API key from .env will be used when the client is actually needed.
 */

import OpenAI from "openai";

let _openaiClient: OpenAI | null = null;

/**
 * Get or create the OpenAI client instance
 * This is lazy-loaded to avoid build-time evaluation
 */
export function getOpenAIClient(): OpenAI {
  if (!_openaiClient) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY not configured. Please set it in your .env file.");
    }
    _openaiClient = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }
  return _openaiClient;
}

