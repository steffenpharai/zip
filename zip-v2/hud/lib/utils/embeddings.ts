/**
 * Shared embedding utilities for semantic similarity
 * 
 * Used across document search, context filtering, and other semantic operations
 */

import OpenAI from "openai";

// Create OpenAI client lazily - ensure API key is available
// Use a function to get fresh client each time to ensure env vars are current
const getOpenAIClient = () => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set");
  }
  return new OpenAI({
    apiKey: apiKey,
  });
};

/**
 * Compute cosine similarity between two vectors
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  
  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) return 0;
  
  return dotProduct / denominator;
}

/**
 * Get the embedding model to use
 * Must use text-embedding-3-small as configured
 */
function getEmbeddingModel(): string {
  // Check both process.env and explicitly read from environment
  const model = process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small";
  
  // Log in development to debug
  if (process.env.NODE_ENV === "development") {
    console.log(`[EMBEDDINGS] getEmbeddingModel() called - model: ${model}`);
    console.log(`[EMBEDDINGS] process.env.OPENAI_EMBEDDING_MODEL: ${process.env.OPENAI_EMBEDDING_MODEL || "NOT SET"}`);
  }
  
  if (!model || model.trim() === "") {
    throw new Error("OPENAI_EMBEDDING_MODEL must be set to text-embedding-3-small");
  }
  return model;
}

/**
 * Generate embedding for text using OpenAI
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY not configured");
  }
  
  const model = getEmbeddingModel();
  
  // Debug logging in development
  if (process.env.NODE_ENV === "development") {
    console.log(`[EMBEDDINGS] Using model: ${model}, API Key: ${process.env.OPENAI_API_KEY ? "present" : "missing"}`);
  }
  
  // Create client fresh each time to ensure latest env vars
  const openai = getOpenAIClient();
  const response = await openai.embeddings.create({
    model,
    input: text.substring(0, 8000),
  });
  
  return response.data[0].embedding;
}

/**
 * Generate embeddings for multiple texts in batch
 */
export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY not configured");
  }
  
  if (texts.length === 0) return [];
  
  const model = getEmbeddingModel();
  
  // Debug logging in development
  if (process.env.NODE_ENV === "development") {
    console.log(`[EMBEDDINGS] Batch: Using model: ${model} for ${texts.length} texts`);
  }
  
  // Create client fresh each time to ensure latest env vars
  const openai = getOpenAIClient();
  // OpenAI embeddings API supports batch requests
  const response = await openai.embeddings.create({
    model,
    input: texts.map(text => text.substring(0, 8000)),
  });
  
  return response.data.map(item => item.embedding);
}

