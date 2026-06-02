/**
 * Research orchestrator
 * 
 * @deprecated This wrapper is no longer used. All research functionality
 * is now handled directly by executeResearchGraph in nodes/research-graph.ts
 * through the main LangGraph orchestration system in brain.ts.
 * 
 * This file is kept for backward compatibility but should not be used in new code.
 * Use orchestrateConversation in brain.ts instead, which automatically routes
 * research requests to the research sub-graph.
 */

import { executeResearchGraph } from "./nodes/research-graph";

export interface ResearchResult {
  summary: string;
  citations: Array<{ url: string; title: string; quote: string }>;
  sources: Array<{ title: string; url: string; snippet: string }>;
}

/**
 * Execute research workflow
 * 
 * @deprecated Use orchestrateConversation in brain.ts instead
 * 
 * Delegates to the langgraph-based research graph implementation
 */
export async function executeResearch(
  query: string,
  requestId?: string
): Promise<ResearchResult> {
  return await executeResearchGraph(query, requestId);
}

