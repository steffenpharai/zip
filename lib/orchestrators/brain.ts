/**
 * AI Brain - Main orchestration graph
 * 
 * Unified entry point for all conversation requests.
 * Routes to appropriate sub-graphs or direct tool calling based on request type.
 * 
 * Uses LangGraph v1 StateGraph for stateful orchestration following 2026 best practices.
 */

import { StateGraph, Annotation } from "@langchain/langgraph";
import type { RouteDecision } from "./types";
import type { UserContext } from "@/lib/context/types";
import { parseMemoryCommand, addPinnedMemory, deletePinnedMemory, getAllPinned, formatPinnedMemoryForPrompt } from "@/lib/memory/memory-manager";
import { toolCallingNode } from "./nodes/tool-calling";
import { executeResearchGraph } from "./nodes/research-graph";
import { executeWorkflowGraph } from "./nodes/workflow-graph";
import { createTraceContext } from "@/lib/observability/tracer";
import type { BrainActivityEvent } from "@/lib/events/types";
import { ActivityTracker } from "./utils/activity-tracker";

/**
 * Define the state schema using LangGraph v1 Annotation pattern
 * This follows LangGraph 2026 best practices for state management
 */
const OrchestrationStateAnnotation = Annotation.Root({
  // Input fields
  userMessage: Annotation<string>(),
  conversationHistory: Annotation<Array<{ role: "user" | "assistant"; content: string }>>({
    reducer: (left, right) => right ?? left ?? [],
    default: () => [],
  }),
  contextData: Annotation<UserContext | undefined>(),
  
  // Memory fields
  pinnedMemory: Annotation<string | undefined>(),
  memoryCommand: Annotation<{
    type: "remember" | "forget" | "list";
    key?: string;
    value?: string;
  } | undefined>(),
  
  // Routing
  route: Annotation<RouteDecision | undefined>(),
  
  // Tool execution
  toolResults: Annotation<Array<{ tool: string; result: unknown }>>({
    reducer: (left, right) => right ?? left ?? [],
    default: () => [],
  }),
  requiresConfirmation: Annotation<{
    tool: string;
    input: unknown;
    message: string;
  } | undefined>(),
  
  // Response
  response: Annotation<string | undefined>(),
  
  // Observability
  requestId: Annotation<string>(),
  currentStep: Annotation<string | undefined>(),
  
  // Sub-graph results
  researchResult: Annotation<{
    summary: string;
    citations: Array<{ url: string; title: string; quote: string }>;
    sources: Array<{ title: string; url: string; snippet: string }>;
  } | undefined>(),
  workflowResult: Annotation<{
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
  } | undefined>(),
  
  // Internal state for sub-graphs
  _internal: Annotation<{
    searchResults?: unknown;
    fetchedContents?: unknown[];
  } | undefined>(),
  _workflowSteps: Annotation<Array<{
    stepNumber: number;
    description: string;
    toolName?: string;
    toolInput?: unknown;
    status: "pending" | "running" | "completed" | "failed";
    result?: unknown;
    error?: string;
  }> | undefined>(),
});

type OrchestrationState = typeof OrchestrationStateAnnotation.State;

/**
 * Orchestration callbacks for streaming and activity tracking
 */
export interface OrchestrationCallbacks {
  onTextDelta?: (delta: string) => void;
  onActivity?: (activity: BrainActivityEvent["activity"]) => void;
  onComplete?: () => void;
}

// Global activity tracker instance (will be set per request)
let currentActivityTracker: ActivityTracker | null = null;
let currentCallbacks: OrchestrationCallbacks | null = null;
let currentSkipConfirmation: boolean = false;

// Export getter for skipConfirmation so nodes can access it
export function getSkipConfirmation(): boolean {
  return currentSkipConfirmation;
}

/**
 * Input node - processes and validates input
 * LangGraph node function that takes state and returns partial state update
 */
function inputNode(state: OrchestrationState): Partial<OrchestrationState> {
  const nodeStartTime = Date.now();
  const requestId = state.requestId || createTraceContext().requestId;
  
  console.log(`[LANGGRAPH] [${requestId}] [INPUT] Entering input node`);
  console.log(`[LANGGRAPH] [${requestId}] [INPUT] User message: ${state.userMessage.substring(0, 100)}${state.userMessage.length > 100 ? '...' : ''}`);
  
  if (currentActivityTracker) {
    currentActivityTracker.emitNodeEnter("input", requestId);
  }

  const updates: Partial<OrchestrationState> = {};
  
  // Ensure requestId is set
  if (!state.requestId) {
    updates.requestId = requestId;
  }

  // Format pinned memory if not already formatted
  if (!state.pinnedMemory) {
    updates.pinnedMemory = formatPinnedMemoryForPrompt();
  }

  const nodeDuration = Date.now() - nodeStartTime;
  console.log(`[LANGGRAPH] [${requestId}] [INPUT] Exiting input node (${nodeDuration}ms)`);

  if (currentActivityTracker) {
    currentActivityTracker.emitNodeExit("input", requestId);
  }

  return updates;
}

/**
 * Memory command node - handles memory commands
 * LangGraph node function that processes memory operations
 */
async function memoryCommandNode(
  state: OrchestrationState
): Promise<Partial<OrchestrationState>> {
  const nodeStartTime = Date.now();
  console.log(`[LANGGRAPH] [${state.requestId}] [MEMORY] Entering memory command node`);

  if (currentActivityTracker) {
    currentActivityTracker.emitNodeEnter("memory", state.requestId);
  }

  const memoryCommand = parseMemoryCommand(state.userMessage);

  if (!memoryCommand) {
    const nodeDuration = Date.now() - nodeStartTime;
    console.log(`[LANGGRAPH] [${state.requestId}] [MEMORY] No memory command detected (${nodeDuration}ms)`);
    if (currentActivityTracker) {
      currentActivityTracker.emitNodeExit("memory", state.requestId);
    }
    return {};
  }

  console.log(`[LANGGRAPH] [${state.requestId}] [MEMORY] Processing memory command: ${memoryCommand.type}${memoryCommand.key ? ` (key: ${memoryCommand.key})` : ''}`);

  let result: Partial<OrchestrationState>;

  if (memoryCommand.type === "remember" && memoryCommand.key && memoryCommand.value) {
    addPinnedMemory(memoryCommand.key, memoryCommand.value);
    console.log(`[LANGGRAPH] [${state.requestId}] [MEMORY] Added memory: ${memoryCommand.key}`);
    result = {
      response: `I've remembered: ${memoryCommand.key}`,
      memoryCommand: {
        type: "remember",
        key: memoryCommand.key,
        value: memoryCommand.value,
      },
      route: "memory" as RouteDecision,
    };
  } else if (memoryCommand.type === "forget" && memoryCommand.key) {
    const deleted = deletePinnedMemory(memoryCommand.key);
    console.log(`[LANGGRAPH] [${state.requestId}] [MEMORY] Deleted memory: ${memoryCommand.key} (${deleted ? 'success' : 'not found'})`);
    result = {
      response: deleted
        ? `I've forgotten: ${memoryCommand.key}`
        : `I don't have any memory of: ${memoryCommand.key}`,
      memoryCommand: {
        type: "forget",
        key: memoryCommand.key,
      },
      route: "memory" as RouteDecision,
    };
  } else if (memoryCommand.type === "list") {
    const memories = getAllPinned();
    console.log(`[LANGGRAPH] [${state.requestId}] [MEMORY] Listing memories (${memories.length} found)`);
    if (memories.length === 0) {
      result = {
        response: "I don't have any pinned memories.",
        memoryCommand: {
          type: "list",
        },
        route: "memory" as RouteDecision,
      };
    } else {
      const memoryList = memories.map((m) => `- ${m.key}: ${m.value}`).join("\n");
      result = {
        response: `Here's what I remember:\n${memoryList}`,
        memoryCommand: {
          type: "list",
        },
        route: "memory" as RouteDecision,
      };
    }
  } else {
    result = {};
  }

  const nodeDuration = Date.now() - nodeStartTime;
  console.log(`[LANGGRAPH] [${state.requestId}] [MEMORY] Exiting memory command node (${nodeDuration}ms)`);

  if (currentActivityTracker) {
    currentActivityTracker.emitNodeExit("memory", state.requestId);
  }

  return result;
}

/**
 * Route node - analyzes request and decides routing
 * LangGraph node function that determines the execution path
 */
function routeNode(state: OrchestrationState): Partial<OrchestrationState> {
  const nodeStartTime = Date.now();
  console.log(`[LANGGRAPH] [${state.requestId}] [ROUTER] Entering route node`);

  if (currentActivityTracker) {
    currentActivityTracker.emitNodeEnter("router", state.requestId);
  }

  let result: Partial<OrchestrationState>;

  // If memory command was handled, no routing needed
  if (state.memoryCommand) {
    result = {
      route: "memory" as RouteDecision,
    };
    console.log(`[LANGGRAPH] [${state.requestId}] [ROUTER] Route decision: memory (memory command detected)`);
  } else {
    // Check for research requests
    const isResearchRequest = /(current|recent|latest|today|now|what's happening|search for|find information about)/i.test(
      state.userMessage
    );

    if (isResearchRequest) {
      result = {
        route: "research" as RouteDecision,
      };
      console.log(`[LANGGRAPH] [${state.requestId}] [ROUTER] Route decision: research (research keywords detected)`);
    } else {
      // Check for workflow/mission requests
      const isWorkflowRequest = /(plan|mission|workflow|break down|steps to|how to accomplish)/i.test(
        state.userMessage
      );

      if (isWorkflowRequest) {
        result = {
          route: "workflow" as RouteDecision,
        };
        console.log(`[LANGGRAPH] [${state.requestId}] [ROUTER] Route decision: workflow (workflow keywords detected)`);
      } else {
        // Default to direct tool calling
        result = {
          route: "direct" as RouteDecision,
        };
        console.log(`[LANGGRAPH] [${state.requestId}] [ROUTER] Route decision: direct (default)`);
      }
    }
  }

  const nodeDuration = Date.now() - nodeStartTime;
  console.log(`[LANGGRAPH] [${state.requestId}] [ROUTER] Exiting route node (${nodeDuration}ms)`);

  if (currentActivityTracker) {
    currentActivityTracker.emitNodeExit("router", state.requestId);
    if (result.route) {
      currentActivityTracker.emitStateUpdate("route", result.route, state.requestId);
    }
  }

  return result;
}

/**
 * Direct tool calling node
 */
async function directToolNode(
  state: OrchestrationState
): Promise<Partial<OrchestrationState>> {
  const nodeStartTime = Date.now();
  console.log(`[LANGGRAPH] [${state.requestId}] [DIRECT] Entering direct tool calling node`);

  if (currentActivityTracker) {
    currentActivityTracker.emitNodeEnter("direct", state.requestId);
  }

  const result = await toolCallingNode(state, currentActivityTracker, currentCallbacks);

  const nodeDuration = Date.now() - nodeStartTime;
  const toolCount = result.toolResults?.length || 0;
  console.log(`[LANGGRAPH] [${state.requestId}] [DIRECT] Exiting direct tool calling node (${nodeDuration}ms, ${toolCount} tools executed)`);

  if (currentActivityTracker) {
    currentActivityTracker.emitNodeExit("direct", state.requestId);
  }

  return result;
}

/**
 * Research sub-graph node
 */
async function researchSubGraphNode(
  state: OrchestrationState
): Promise<Partial<OrchestrationState>> {
  const nodeStartTime = Date.now();
  console.log(`[LANGGRAPH] [${state.requestId}] [RESEARCH] Entering research sub-graph node`);

  if (currentActivityTracker) {
    currentActivityTracker.emitNodeEnter("research", state.requestId);
  }

  try {
    const researchResult = await executeResearchGraph(
      state.userMessage,
      state.requestId,
      currentActivityTracker,
      currentCallbacks
    );
    const result = {
      researchResult,
      response: `${researchResult.summary}\n\nSources:\n${researchResult.citations
        .map((c) => `- [${c.title}](${c.url}): "${c.quote}"`)
        .join("\n")}`,
      toolResults: [
        {
          tool: "research",
          result: researchResult,
        },
      ],
    };

    const nodeDuration = Date.now() - nodeStartTime;
    console.log(`[LANGGRAPH] [${state.requestId}] [RESEARCH] Research completed (${nodeDuration}ms, ${researchResult.sources.length} sources, ${researchResult.citations.length} citations)`);

    if (currentActivityTracker) {
      currentActivityTracker.emitNodeExit("research", state.requestId);
    }

    return result;
  } catch (error) {
    const nodeDuration = Date.now() - nodeStartTime;
    console.error(`[LANGGRAPH] [${state.requestId}] [RESEARCH] Research error after ${nodeDuration}ms:`, error);
    if (currentActivityTracker) {
      currentActivityTracker.emitNodeExit("research", state.requestId);
    }
    // Fall through to direct tool calling
    console.log(`[LANGGRAPH] [${state.requestId}] [RESEARCH] Falling back to direct tool calling`);
    return await directToolNode(state);
  }
}

/**
 * Workflow sub-graph node
 */
async function workflowSubGraphNode(
  state: OrchestrationState
): Promise<Partial<OrchestrationState>> {
  const nodeStartTime = Date.now();
  console.log(`[LANGGRAPH] [${state.requestId}] [WORKFLOW] Entering workflow sub-graph node`);

  if (currentActivityTracker) {
    currentActivityTracker.emitNodeEnter("workflow", state.requestId);
  }

  try {
    const workflowResult = await executeWorkflowGraph(
      state.userMessage,
      state.requestId,
      currentActivityTracker,
      currentCallbacks
    );
    const result = {
      workflowResult,
      response: workflowResult.summary,
      toolResults: [
        {
          tool: "workflow",
          result: workflowResult,
        },
      ],
    };

    const nodeDuration = Date.now() - nodeStartTime;
    const stepCount = workflowResult.steps.length;
    const successCount = workflowResult.steps.filter(s => s.status === 'completed').length;
    console.log(`[LANGGRAPH] [${state.requestId}] [WORKFLOW] Workflow completed (${nodeDuration}ms, ${successCount}/${stepCount} steps successful)`);

    if (currentActivityTracker) {
      currentActivityTracker.emitNodeExit("workflow", state.requestId);
    }

    return result;
  } catch (error) {
    const nodeDuration = Date.now() - nodeStartTime;
    console.error(`[LANGGRAPH] [${state.requestId}] [WORKFLOW] Workflow error after ${nodeDuration}ms:`, error);
    if (currentActivityTracker) {
      currentActivityTracker.emitNodeExit("workflow", state.requestId);
    }
    // Fall through to direct tool calling
    console.log(`[LANGGRAPH] [${state.requestId}] [WORKFLOW] Falling back to direct tool calling`);
    return await directToolNode(state);
  }
}

/**
 * Response node - formats final response
 */
function responseNode(state: OrchestrationState): Partial<OrchestrationState> {
  const nodeStartTime = Date.now();
  console.log(`[LANGGRAPH] [${state.requestId}] [FINALIZE] Entering finalize node`);
  
  if (currentActivityTracker) {
    currentActivityTracker.emitNodeEnter("finalize", state.requestId);
  }

  // Response is already set by previous nodes
  // This node can be used for final formatting if needed
  const responseLength = state.response?.length || 0;
  console.log(`[LANGGRAPH] [${state.requestId}] [FINALIZE] Response prepared (${responseLength} chars)`);

  const nodeDuration = Date.now() - nodeStartTime;
  console.log(`[LANGGRAPH] [${state.requestId}] [FINALIZE] Exiting finalize node (${nodeDuration}ms)`);

  if (currentActivityTracker) {
    currentActivityTracker.emitNodeExit("finalize", state.requestId);
  }

  return {};
}

/**
 * Conditional edge function for routing after route node
 */
function routeCondition(state: OrchestrationState): string {
  // If memory command was handled, go directly to finalize
  // Return "response" which maps to "finalize" node in conditional edges
  if (state.memoryCommand && state.response) {
    return "response";
  }
  
  if (state.route === "research") {
    return "research";
  }
  if (state.route === "workflow") {
    return "workflow";
  }
  return "direct";
}

// Create the LangGraph StateGraph - use any to avoid type conflicts with LangGraph's complex generics
let graph: any = null;

/**
 * Build the orchestration graph
 * Creates the LangGraph v1 StateGraph with all nodes and edges
 * Follows LangGraph 2026 best practices
 */
function buildGraph() {
  if (graph) {
    return graph;
  }

  // Define state schema with reducers for LangGraph
  // LangGraph uses a reducer pattern where each field has a reducer function
  // Create StateGraph using Annotation.Root pattern (LangGraph best practice)
  const workflow = new StateGraph(OrchestrationStateAnnotation);

  // Add all nodes first to help TypeScript infer node types
  // Note: "route" and "response" are state fields, so we use different node names to avoid conflicts
  const workflowWithNodes = workflow
    .addNode("input", inputNode)
    .addNode("memory", memoryCommandNode)
    .addNode("router", routeNode)
    .addNode("direct", directToolNode)
    .addNode("research", researchSubGraphNode)
    .addNode("workflow", workflowSubGraphNode)
    .addNode("finalize", responseNode);

  // Add edges after all nodes are added (TypeScript can now infer all node names)
  const workflowWithEdges = workflowWithNodes
    .addEdge("__start__", "input")
    .addEdge("input", "memory")
    .addEdge("memory", "router")
    .addConditionalEdges("router", routeCondition, {
      research: "research",
      workflow: "workflow",
      direct: "direct",
      response: "finalize",
    })
    .addEdge("direct", "finalize")
    .addEdge("research", "finalize")
    .addEdge("workflow", "finalize")
    .addEdge("finalize", "__end__");

  graph = workflowWithEdges.compile();
  return graph;
}

/**
 * Main orchestration function
 * Executes the LangGraph StateGraph for conversation orchestration
 */
export async function orchestrateConversation(
  userMessage: string,
  conversationHistory: Array<{ role: "user" | "assistant"; content: string }>,
  options: {
    requestId?: string;
    contextData?: OrchestrationState["contextData"];
    skipConfirmation?: boolean;
    callbacks?: OrchestrationCallbacks;
  } = {}
): Promise<{
  response: string;
  toolResults?: Array<{ tool: string; result: unknown }>;
  requiresConfirmation?: {
    tool: string;
    input: unknown;
    message: string;
  };
}> {
  const orchestrationStartTime = Date.now();
  
  // Set up activity tracking
  const activityTracker = new ActivityTracker();
  if (options.callbacks?.onActivity) {
    activityTracker.onActivity(options.callbacks.onActivity);
  }

  // Store in global context for nodes to access
  const previousTracker = currentActivityTracker;
  const previousCallbacks = currentCallbacks;
  const previousSkipConfirmation = currentSkipConfirmation;
  currentActivityTracker = activityTracker;
  currentCallbacks = options.callbacks || null;
  currentSkipConfirmation = options.skipConfirmation || false;

  try {
    // Initialize state with required fields
    const requestId = options.requestId || createTraceContext().requestId;
    const initialState: Partial<OrchestrationState> = {
      userMessage,
      conversationHistory,
      contextData: options.contextData,
      toolResults: [],
      requestId,
    };

    console.log(`[LANGGRAPH] [${requestId}] [ORCHESTRATION] Starting orchestration`);
    console.log(`[LANGGRAPH] [${requestId}] [ORCHESTRATION] User message: ${userMessage.substring(0, 200)}${userMessage.length > 200 ? '...' : ''}`);
    console.log(`[LANGGRAPH] [${requestId}] [ORCHESTRATION] Conversation history: ${conversationHistory.length} messages`);
    console.log(`[LANGGRAPH] [${requestId}] [ORCHESTRATION] Context data: ${options.contextData ? 'present' : 'none'}`);

    // Build and execute graph
    const compiledGraph = buildGraph();
    const finalState = await compiledGraph.invoke(initialState);

    const orchestrationDuration = Date.now() - orchestrationStartTime;
    const toolCount = finalState.toolResults?.length || 0;
    const responseLength = finalState.response?.length || 0;
    
    console.log(`[LANGGRAPH] [${requestId}] [ORCHESTRATION] Orchestration completed (${orchestrationDuration}ms)`);
    console.log(`[LANGGRAPH] [${requestId}] [ORCHESTRATION] Results: ${toolCount} tools executed, ${responseLength} char response`);
    if (finalState.requiresConfirmation) {
      console.log(`[LANGGRAPH] [${requestId}] [ORCHESTRATION] Requires confirmation: ${finalState.requiresConfirmation.tool}`);
    }

    // Call onComplete callback
    if (options.callbacks?.onComplete) {
      options.callbacks.onComplete();
    }

    // Return formatted response
    return {
      response: finalState.response || "I'm sorry, I couldn't process that request.",
      toolResults: finalState.toolResults.length > 0 ? finalState.toolResults : undefined,
      requiresConfirmation: finalState.requiresConfirmation,
    };
  } catch (error) {
    const orchestrationDuration = Date.now() - orchestrationStartTime;
    const requestId = options.requestId || createTraceContext().requestId;
    console.error(`[LANGGRAPH] [${requestId}] [ORCHESTRATION] Orchestration failed after ${orchestrationDuration}ms:`, error);
    throw error;
  } finally {
    // Restore previous context
    currentActivityTracker = previousTracker;
    currentCallbacks = previousCallbacks;
    currentSkipConfirmation = previousSkipConfirmation;
  }
}

