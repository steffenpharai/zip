/**
 * OpenAI Responses API Integration
 * 
 * Provides wrapper function for the LangGraph-based orchestration system.
 * All conversation logic is handled by orchestrateConversation in brain.ts.
 */

import { orchestrateConversation, type OrchestrationCallbacks } from "@/lib/orchestrators/brain";
import type { UserContext } from "@/lib/context/types";

export interface ChatWithToolsOptions {
  requestId?: string;
  pinnedMemory?: string;
  skipConfirmation?: boolean;
  maxIterations?: number;
  contextData?: UserContext;
  callbacks?: OrchestrationCallbacks;
}

export interface ChatWithToolsResult {
  response: string;
  toolResults?: Array<{ tool: string; result: unknown }>;
  requiresConfirmation?: {
    tool: string;
    input: unknown;
    message: string;
  };
}

/**
 * Orchestrate conversation using the AI Brain orchestration system
 * 
 * This is the new unified entry point that routes all requests through
 * the langgraph-based orchestration system.
 * 
 * @param message - User message
 * @param conversationHistory - Conversation history
 * @param options - Orchestration options
 * @returns Chat result with response, tool results, and confirmation requirements
 */
export async function orchestrateConversationWithBrain(
  message: string,
  conversationHistory: Array<{ role: "user" | "assistant"; content: string }>,
  options: ChatWithToolsOptions = {}
): Promise<ChatWithToolsResult> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY not configured");
  }

  return await orchestrateConversation(message, conversationHistory, {
    requestId: options.requestId,
    contextData: options.contextData,
    skipConfirmation: options.skipConfirmation,
    callbacks: options.callbacks,
  });
}

