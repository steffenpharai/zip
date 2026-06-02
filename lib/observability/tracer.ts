/**
 * Request-scoped tracing infrastructure
 * 
 * Provides request_id, step_id, and parent_id tracking for observability
 */

let requestIdCounter = 0;
let stepIdCounter = 0;

export interface TraceContext {
  requestId: string;
  stepId: string;
  parentId?: string;
}

const contextStore = new Map<string, TraceContext>();

/**
 * Generate a new request ID
 */
export function generateRequestId(): string {
  requestIdCounter++;
  return `req_${Date.now()}_${requestIdCounter}`;
}

/**
 * Generate a new step ID
 */
export function generateStepId(): string {
  stepIdCounter++;
  return `step_${Date.now()}_${stepIdCounter}`;
}

/**
 * Create a new trace context for a request
 */
export function createTraceContext(requestId?: string): TraceContext {
  const id = requestId || generateRequestId();
  const context: TraceContext = {
    requestId: id,
    stepId: generateStepId(),
  };
  contextStore.set(id, context);
  return context;
}

/**
 * Get trace context for a request
 */
export function getTraceContext(requestId: string): TraceContext | undefined {
  return contextStore.get(requestId);
}

/**
 * Create a child step context
 */
export function createChildStep(requestId: string, parentStepId: string): TraceContext {
  const parent = contextStore.get(requestId);
  if (!parent) {
    throw new Error(`No trace context found for request ${requestId}`);
  }
  
  const child: TraceContext = {
    requestId,
    stepId: generateStepId(),
    parentId: parentStepId,
  };
  
  // Update context with new step
  contextStore.set(requestId, child);
  return child;
}

/**
 * Clear trace context (call after request completes)
 */
export function clearTraceContext(requestId: string): void {
  contextStore.delete(requestId);
}

/**
 * Get current step ID from context
 */
export function getCurrentStepId(requestId: string): string | undefined {
  return contextStore.get(requestId)?.stepId;
}

