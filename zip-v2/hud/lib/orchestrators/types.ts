/**
 * LangGraph v1 orchestration state types
 * 
 * Defines the state structure for the AI Brain orchestration system
 * Compatible with LangGraph v1 StateGraph state management (2026)
 */

import type { UserContext } from "@/lib/context/types";

export type RouteDecision = "direct" | "research" | "workflow" | "memory";

/**
 * Orchestration state interface compatible with LangGraph v1 StateGraph
 * All fields are optional in the state schema to allow partial updates
 * Matches the Annotation.Root schema defined in brain.ts
 */
export interface OrchestrationState {
  // Input
  userMessage: string;
  conversationHistory: Array<{ role: "user" | "assistant"; content: string }>;
  contextData?: UserContext;
  
  // Memory
  pinnedMemory?: string;
  memoryCommand?: {
    type: "remember" | "forget" | "list";
    key?: string;
    value?: string;
  };
  
  // Routing
  route?: RouteDecision;
  
  // Tool execution
  toolResults: Array<{ tool: string; result: unknown }>;
  requiresConfirmation?: {
    tool: string;
    input: unknown;
    message: string;
  };
  
  // Response
  response?: string;
  
  // Observability
  requestId: string;
  currentStep?: string;
  
  // Sub-graph results
  researchResult?: {
    summary: string;
    citations: Array<{ url: string; title: string; quote: string }>;
    sources: Array<{ title: string; url: string; snippet: string }>;
  };
  workflowResult?: {
    success: boolean;
    steps: Array<{
      stepNumber: number;
      description: string;
      status: "pending" | "running" | "completed" | "failed";
      result?: unknown;
      error?: string;
    }>;
    summary: string;
    finalResult?: unknown;
  };
  
  // Internal state for sub-graphs (not part of final output)
  _internal?: {
    searchResults?: unknown;
    fetchedContents?: unknown[];
  };
  _workflowSteps?: Array<{
    stepNumber: number;
    description: string;
    toolName?: string;
    toolInput?: unknown;
    status: "pending" | "running" | "completed" | "failed";
    result?: unknown;
    error?: string;
  }>;
}

