/**
 * Workflow sub-graph for LangGraph orchestration
 * 
 * Handles multi-step mission/workflow requests: planner → executor → narrator
 */

import OpenAI from "openai";
import type { OrchestrationState } from "../types";
import { getAllTools, requiresConfirmation } from "@/lib/tools/registry";
import { executeTool } from "@/lib/tools/executor";
import { getSystemPrompt } from "@/lib/openai/prompts";
import { generateStepId } from "@/lib/observability/tracer";
import type { ActivityTracker } from "../utils/activity-tracker";
import type { OrchestrationCallbacks } from "../brain";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export interface WorkflowStep {
  stepNumber: number;
  description: string;
  toolName?: string;
  toolInput?: unknown;
  status: "pending" | "running" | "completed" | "failed";
  result?: unknown;
  error?: string;
}

/**
 * Planner node - breaks mission into steps
 */
export async function plannerNode(
  state: OrchestrationState,
  activityTracker?: ActivityTracker | null
): Promise<Partial<OrchestrationState> & { _workflowSteps?: WorkflowStep[] }> {
  const nodeStartTime = Date.now();
  const model = process.env.OPENAI_RESPONSES_MODEL || "gpt-4o";
  const tools = getAllTools();
  const mission = state.userMessage;

  console.log(`[LANGGRAPH] [${state.requestId}] [WORKFLOW] [PLANNER] Starting planner node`);
  console.log(`[LANGGRAPH] [${state.requestId}] [WORKFLOW] [PLANNER] Mission: ${mission.substring(0, 150)}`);

  if (activityTracker) {
    activityTracker.emitLLMCall(model, `Planning workflow for: ${mission.substring(0, 100)}`, state.requestId);
  }

  const plannerPrompt = `Break down the following mission into clear, executable steps with tool calls:

Mission: ${mission}

Available tools: ${tools.map((t) => t.name).join(", ")}

Return a JSON array of steps, each with:
- stepNumber: number
- description: string
- toolName: string (optional, if tool needed)
- toolInput: object (optional, if tool needed)

Example:
[
  {
    "stepNumber": 1,
    "description": "Search for information about X",
    "toolName": "web_search",
    "toolInput": { "query": "X" }
  },
  {
    "stepNumber": 2,
    "description": "Summarize the results",
    "toolName": "summarize_sources",
    "toolInput": { "sources": [...] }
  }
]`;

  const plannerResponse = await openai.chat.completions.create({
    model,
    messages: [
      {
        role: "system",
        content: getSystemPrompt("planner"),
      },
      {
        role: "user",
        content: plannerPrompt,
      },
    ],
    response_format: { type: "json_object" },
    max_tokens: 2000,
  });

  const plannerContent = plannerResponse.choices[0]?.message?.content || "{}";
  const plannerData = JSON.parse(plannerContent);
  const steps: WorkflowStep[] = Array.isArray(plannerData.steps)
    ? plannerData.steps
    : Array.isArray(plannerData)
    ? plannerData
    : [];

  const nodeDuration = Date.now() - nodeStartTime;
  console.log(`[LANGGRAPH] [${state.requestId}] [WORKFLOW] [PLANNER] Planning completed (${nodeDuration}ms, ${steps.length} steps planned)`);

  return {
    _workflowSteps: steps,
  };
}

/**
 * Executor node - runs steps sequentially
 */
export async function executorNode(
  state: OrchestrationState & { _workflowSteps?: WorkflowStep[] },
  activityTracker?: ActivityTracker | null
): Promise<Partial<OrchestrationState> & { _workflowSteps?: WorkflowStep[] }> {
  const nodeStartTime = Date.now();
  const steps = state._workflowSteps;
  if (!steps || steps.length === 0) {
    console.log(`[LANGGRAPH] [${state.requestId}] [WORKFLOW] [EXECUTOR] No steps to execute`);
    return {};
  }

  console.log(`[LANGGRAPH] [${state.requestId}] [WORKFLOW] [EXECUTOR] Starting executor node (${steps.length} steps)`);

  const tools = getAllTools();
  const executedSteps: WorkflowStep[] = [];

  for (const step of steps) {
    const stepStartTime = Date.now();
    const workflowStep: WorkflowStep = {
      ...step,
      status: "running",
    };

    console.log(`[LANGGRAPH] [${state.requestId}] [WORKFLOW] [EXECUTOR] Executing step ${step.stepNumber}: ${step.description}`);

    executedSteps.push(workflowStep);

    try {
      if (step.toolName && step.toolInput) {
        // Check if tool requires confirmation
        const tool = tools.find((t) => t.name === step.toolName);
        if (tool && requiresConfirmation(tool.permissionTier)) {
          // Skip ACT tools in workflow (they need user confirmation)
          workflowStep.status = "failed";
          workflowStep.error = "Tool requires user confirmation";
          console.log(`[LANGGRAPH] [${state.requestId}] [WORKFLOW] [EXECUTOR] Step ${step.stepNumber} skipped (requires confirmation)`);
          continue;
        }

        // Emit tool start activity
        if (activityTracker) {
          activityTracker.emitToolStart(step.toolName, step.toolInput, state.requestId);
        }

        // Execute tool
        const result = await executeTool(step.toolName, step.toolInput, {
          requestId: state.requestId,
          stepId: generateStepId(),
        });

        const stepDuration = Date.now() - stepStartTime;

        // Emit tool complete activity
        if (activityTracker) {
          activityTracker.emitToolComplete(step.toolName, result.success ? result.result : { error: result.error }, state.requestId);
        }

        if (result.success) {
          workflowStep.status = "completed";
          workflowStep.result = result.result;
          console.log(`[LANGGRAPH] [${state.requestId}] [WORKFLOW] [EXECUTOR] Step ${step.stepNumber} completed (${stepDuration}ms)`);
        } else {
          workflowStep.status = "failed";
          workflowStep.error = result.error;
          console.log(`[LANGGRAPH] [${state.requestId}] [WORKFLOW] [EXECUTOR] Step ${step.stepNumber} failed (${stepDuration}ms): ${result.error}`);
        }
      } else {
        // No tool needed, mark as completed
        workflowStep.status = "completed";
        const stepDuration = Date.now() - stepStartTime;
        console.log(`[LANGGRAPH] [${state.requestId}] [WORKFLOW] [EXECUTOR] Step ${step.stepNumber} completed (no tool, ${stepDuration}ms)`);
      }
    } catch (error) {
      const stepDuration = Date.now() - stepStartTime;
      workflowStep.status = "failed";
      workflowStep.error = error instanceof Error ? error.message : "Unknown error";
      console.error(`[LANGGRAPH] [${state.requestId}] [WORKFLOW] [EXECUTOR] Step ${step.stepNumber} error (${stepDuration}ms):`, error);
    }
  }

  const nodeDuration = Date.now() - nodeStartTime;
  const successCount = executedSteps.filter(s => s.status === 'completed').length;
  const failCount = executedSteps.filter(s => s.status === 'failed').length;
  console.log(`[LANGGRAPH] [${state.requestId}] [WORKFLOW] [EXECUTOR] Executor completed (${nodeDuration}ms, ${successCount} succeeded, ${failCount} failed)`);

  return {
    _workflowSteps: executedSteps,
  };
}

/**
 * Narrator node - summarizes results
 */
export async function narratorNode(
  state: OrchestrationState & { _workflowSteps?: WorkflowStep[] },
  activityTracker?: ActivityTracker | null,
  callbacks?: OrchestrationCallbacks | null
): Promise<Partial<OrchestrationState>> {
  const nodeStartTime = Date.now();
  const steps = state._workflowSteps;
  if (!steps || steps.length === 0) {
    console.log(`[LANGGRAPH] [${state.requestId}] [WORKFLOW] [NARRATOR] No steps to summarize`);
    return {
      workflowResult: {
        success: false,
        steps: [],
        summary: "No steps to execute.",
      },
    };
  }

  console.log(`[LANGGRAPH] [${state.requestId}] [WORKFLOW] [NARRATOR] Starting narrator node (${steps.length} steps to summarize)`);

  const model = process.env.OPENAI_RESPONSES_MODEL || "gpt-4o";
  const mission = state.userMessage;

  if (activityTracker) {
    activityTracker.emitLLMCall(model, `Summarizing workflow results`, state.requestId);
  }

  const narratorPrompt = `Summarize the results of this workflow:

Mission: ${mission}

Steps executed:
${steps
  .map(
    (s) =>
      `${s.stepNumber}. ${s.description} - ${s.status}${s.error ? ` (Error: ${s.error})` : ""}`
  )
  .join("\n")}

Provide a concise summary (3-5 sentences) of what was accomplished.`;

  const narratorResponse = await openai.chat.completions.create({
    model,
    messages: [
      {
        role: "system",
        content: "You are a workflow narrator. Summarize workflow results concisely.",
      },
      {
        role: "user",
        content: narratorPrompt,
      },
    ],
    max_tokens: 500,
  });

  const summary = narratorResponse.choices[0]?.message?.content || "Workflow completed";

  const allCompleted = steps.every((s) => s.status === "completed" || s.status === "failed");
  const hasFailures = steps.some((s) => s.status === "failed");

  const nodeDuration = Date.now() - nodeStartTime;
  console.log(`[LANGGRAPH] [${state.requestId}] [WORKFLOW] [NARRATOR] Narrator completed (${nodeDuration}ms, success: ${allCompleted && !hasFailures})`);

  return {
    workflowResult: {
      success: allCompleted && !hasFailures,
      steps: steps.map((s) => ({
        stepNumber: s.stepNumber,
        description: s.description,
        status: s.status,
        result: s.result,
        error: s.error,
      })),
      summary,
      finalResult: steps[steps.length - 1]?.result,
    },
  };
}

/**
 * Execute workflow (maintains backward compatibility with existing interface)
 * This is a sequential execution that mimics the graph structure
 */
export async function executeWorkflowGraph(
  mission: string,
  requestId?: string,
  activityTracker?: ActivityTracker | null,
  callbacks?: OrchestrationCallbacks | null
): Promise<{
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
}> {
  const graphStartTime = Date.now();
  const reqId = requestId || `req_${Date.now()}`;
  
  console.log(`[LANGGRAPH] [${reqId}] [WORKFLOW] Starting workflow graph execution`);
  
  const initialState: OrchestrationState & { _workflowSteps?: WorkflowStep[] } = {
    userMessage: mission,
    conversationHistory: [],
    toolResults: [],
    requestId: reqId,
  };

  // Execute nodes sequentially (graph will be wired up in main orchestration)
  const step1 = await plannerNode(initialState, activityTracker);
  const state1 = { ...initialState, ...step1 };

  const step2 = await executorNode(state1, activityTracker);
  const state2 = { ...state1, ...step2 };

  const step3 = await narratorNode(state2, activityTracker, callbacks);
  
  const graphDuration = Date.now() - graphStartTime;
  console.log(`[LANGGRAPH] [${reqId}] [WORKFLOW] Workflow graph execution completed (${graphDuration}ms)`);

  const finalState = { ...state2, ...step3 };

  if (!finalState.workflowResult) {
    return {
      success: false,
      steps: [],
      summary: "Workflow execution failed.",
    };
  }

  return {
    success: finalState.workflowResult.success,
    steps: finalState.workflowResult.steps,
    summary: finalState.workflowResult.summary,
    finalResult: finalState.workflowResult.finalResult,
  };
}

