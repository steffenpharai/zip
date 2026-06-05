/**
 * Workflow/Mission orchestrator
 * 
 * @deprecated This wrapper is no longer used. All workflow functionality
 * is now handled directly by executeWorkflowGraph in nodes/workflow-graph.ts
 * through the main LangGraph orchestration system in brain.ts.
 * 
 * This file is kept for backward compatibility but should not be used in new code.
 * Use orchestrateConversation in brain.ts instead, which automatically routes
 * workflow requests to the workflow sub-graph.
 */

import { executeWorkflowGraph } from "./nodes/workflow-graph";

export interface WorkflowStep {
  stepNumber: number;
  description: string;
  toolName?: string;
  toolInput?: unknown;
  status: "pending" | "running" | "completed" | "failed";
  result?: unknown;
  error?: string;
}

export interface WorkflowResult {
  success: boolean;
  steps: WorkflowStep[];
  summary: string;
  finalResult?: unknown;
}

/**
 * Execute a workflow (mission)
 * 
 * @deprecated Use orchestrateConversation in brain.ts instead
 * 
 * Delegates to the langgraph-based workflow graph implementation
 */
export async function executeWorkflow(
  mission: string,
  requestId?: string
): Promise<WorkflowResult> {
  return await executeWorkflowGraph(mission, requestId);
}

