/**
 * Intelligent conversation context filtering
 * 
 * Uses semantic similarity to determine which conversation history messages
 * are relevant to the current query, preventing inclusion of irrelevant context.
 */

import type { OrchestrationState } from "../types";
import { generateEmbedding, generateEmbeddings, cosineSimilarity } from "@/lib/utils/embeddings";

/**
 * Configuration for context filtering
 */
const MIN_RELEVANCE_THRESHOLD = 0.5; // Minimum cosine similarity to include a message
const MAX_HISTORY_MESSAGES = 20; // Maximum total messages to include
const SHORT_CONVERSATION_THRESHOLD = 5; // If conversation is shorter than this, include all messages
const MIN_RECENT_MESSAGES = 3; // Minimum recent messages to always include

/**
 * Pronouns and references that indicate a follow-up question
 */
const PRONOUN_PATTERNS = /\b(it|that|this|these|those|the arm|the head|the avatar|them|they)\b/i;

/**
 * Filter conversation history to include only relevant messages
 * 
 * @param userMessage Current user message
 * @param conversationHistory Full conversation history
 * @param requestId Request ID for logging
 * @returns Filtered conversation history
 */
export async function filterConversationHistory(
  userMessage: string,
  conversationHistory: Array<{ role: "user" | "assistant"; content: string }>,
  requestId: string
): Promise<Array<{ role: "user" | "assistant"; content: string }>> {
  // Fast path: empty conversations
  if (conversationHistory.length === 0) {
    return [];
  }
  
  const filterStartTime = Date.now();
  console.log(`[LANGGRAPH] [${requestId}] [CONTEXT_FILTER] Filtering ${conversationHistory.length} messages by relevance`);
  
  try {
    // Generate embeddings: query separately, then batch for ALL messages
    const [queryEmbedding, messageEmbeddingsArray] = await Promise.all([
      generateEmbedding(userMessage),
      generateEmbeddings(conversationHistory.map(msg => msg.content)),
    ]);
    const messageEmbeddings = messageEmbeddingsArray;
    
    // Compute relevance scores for ALL messages
    const messagesWithScores = conversationHistory.map((msg, index) => ({
      message: msg,
      relevance: cosineSimilarity(queryEmbedding, messageEmbeddings[index]),
      originalIndex: index,
    }));
    
    // Filter messages above threshold and sort by original index to maintain order
    const relevantItems = messagesWithScores
      .filter(item => item.relevance >= MIN_RELEVANCE_THRESHOLD)
      .sort((a, b) => a.originalIndex - b.originalIndex); // Sort by original position to maintain conversation flow
    
    // Limit to max messages (accounting for pairs we'll add)
    const maxRelevant = Math.min(relevantItems.length, Math.floor(MAX_HISTORY_MESSAGES / 2));
    const topRelevantItems = relevantItems.slice(0, maxRelevant);
    
    // If nothing is relevant, return empty (don't include irrelevant context)
    if (topRelevantItems.length === 0) {
      console.log(`[LANGGRAPH] [${requestId}] [CONTEXT_FILTER] No relevant messages found (threshold: ${MIN_RELEVANCE_THRESHOLD.toFixed(2)}), excluding all history`);
      return [];
    }
    
    // Ensure topic continuity: if a message is included, include its paired message
    // In conversations, messages alternate user/assistant, so we include the preceding message
    const includedIndices = new Set<number>();
    const finalMessages: Array<{ role: "user" | "assistant"; content: string }> = [];
    
    // Add relevant messages with their pairs, maintaining chronological order
    for (const item of topRelevantItems) {
      const index = item.originalIndex;
      
      if (!includedIndices.has(index)) {
        // Include the preceding message if it exists (the question/response pair)
        if (index > 0 && !includedIndices.has(index - 1)) {
          // Check if the preceding message is also relevant enough
          const precedingRelevance = messagesWithScores[index - 1].relevance;
          if (precedingRelevance >= MIN_RELEVANCE_THRESHOLD * 0.7) { // 70% of threshold for paired messages
            finalMessages.push(conversationHistory[index - 1]);
            includedIndices.add(index - 1);
          }
        }
        
        // Include the relevant message
        finalMessages.push(item.message);
        includedIndices.add(index);
      }
    }
    
    const filterDuration = Date.now() - filterStartTime;
    const filteredCount = conversationHistory.length - finalMessages.length;
    console.log(`[LANGGRAPH] [${requestId}] [CONTEXT_FILTER] Filtered ${filteredCount} messages (${finalMessages.length} remaining, ${filterDuration}ms)`);
    
    // Log relevance scores for debugging
    if (messagesWithScores.length > 0) {
      const avgRelevance = messagesWithScores.reduce((sum, item) => sum + item.relevance, 0) / messagesWithScores.length;
      const maxRelevance = Math.max(...messagesWithScores.map(item => item.relevance));
      const minRelevance = Math.min(...messagesWithScores.map(item => item.relevance));
      const includedRelevance = finalMessages.length > 0 
        ? finalMessages.map((msg) => {
            const score = messagesWithScores.find(s => s.message === msg);
            return score?.relevance || 0;
          }).reduce((sum, r) => sum + r, 0) / finalMessages.length
        : 0;
      console.log(`[LANGGRAPH] [${requestId}] [CONTEXT_FILTER] Relevance scores - avg: ${avgRelevance.toFixed(3)}, max: ${maxRelevance.toFixed(3)}, min: ${minRelevance.toFixed(3)}, included avg: ${includedRelevance.toFixed(3)}, threshold: ${MIN_RELEVANCE_THRESHOLD.toFixed(2)}`);
      
      // Log which messages were included and their relevance scores
      if (process.env.NODE_ENV === "development") {
        console.log(`[LANGGRAPH] [${requestId}] [CONTEXT_FILTER] Message relevance scores:`);
        messagesWithScores.forEach((item) => {
          const included = finalMessages.some(msg => msg === item.message);
          const marker = included ? "✓" : "✗";
          console.log(`[LANGGRAPH] [${requestId}] [CONTEXT_FILTER]   ${marker} [${item.relevance.toFixed(3)}] ${item.message.role}: ${item.message.content.substring(0, 60)}...`);
        });
      }
    }
    
    return finalMessages;
  } catch (error) {
    console.error(`[LANGGRAPH] [${requestId}] [CONTEXT_FILTER] Error filtering context:`, error);
    // Re-throw the error so it can be handled upstream
    // The embedding model must be available for context filtering to work
    throw error;
  }
}

/**
 * Filter conversation history synchronously (for cases where async is not possible)
 * Uses a simpler heuristic-based approach
 */
export function filterConversationHistorySync(
  userMessage: string,
  conversationHistory: Array<{ role: "user" | "assistant"; content: string }>,
  requestId: string
): Array<{ role: "user" | "assistant"; content: string }> {
  // Fast path: empty or very short conversations
  if (conversationHistory.length === 0) {
    return [];
  }
  
  if (conversationHistory.length < SHORT_CONVERSATION_THRESHOLD) {
    return conversationHistory;
  }
  
  // Check for pronoun/reference in current message
  const hasPronoun = PRONOUN_PATTERNS.test(userMessage);
  const alwaysIncludeCount = hasPronoun ? MIN_RECENT_MESSAGES + 1 : MIN_RECENT_MESSAGES;
  
  // Simple heuristic: include recent messages and limit total
  const recentMessages = conversationHistory.slice(-alwaysIncludeCount);
  const olderMessages = conversationHistory.slice(0, -alwaysIncludeCount);
  
  // Include a limited number of older messages (most recent first)
  const includedOlder = olderMessages.slice(-(MAX_HISTORY_MESSAGES - alwaysIncludeCount));
  
  return [...includedOlder, ...recentMessages];
}

