import { getTool, requiresConfirmation as toolRequiresConfirmation } from "./registry";
import type { ToolDefinition, PermissionTier } from "./registry";
import { isMCPTool, executeMCPTool } from "./mcp-client";
import { queueAuditLog, type AuditEntry } from "@/lib/observability/audit-logger";
import { queueTrace, type TraceEntry } from "@/lib/observability/trace-writer";
import { generateStepId } from "@/lib/observability/tracer";

export interface ToolExecutionResult {
  success: boolean;
  result?: unknown;
  error?: string;
  errorCode?: string;
  timingMs?: number;
}

export interface ToolExecutionOptions {
  requestId?: string;
  stepId?: string;
  userInput?: string;
  skipPermissionCheck?: boolean;
  timeoutMs?: number;
  maxRetries?: number;
}

const DEFAULT_TIMEOUT_MS = 30000; // 30 seconds
const DEFAULT_MAX_RETRIES = 3;

/**
 * Sleep utility for retry backoff
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Execute tool with timeout
 */
async function executeWithTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number
): Promise<T> {
  return Promise.race([
    fn(),
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Tool execution timeout after ${timeoutMs}ms`)), timeoutMs)
    ),
  ]);
}

/**
 * Execute tool with retry logic
 */
async function executeWithRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number,
  toolName: string
): Promise<T> {
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      if (attempt < maxRetries) {
        // Exponential backoff: 100ms, 200ms, 400ms
        const backoffMs = 100 * Math.pow(2, attempt);
        console.warn(`Tool ${toolName} failed (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${backoffMs}ms...`);
        console.warn(`Error: ${lastError.message}`);
        await sleep(backoffMs);
      } else {
        // Log final error before throwing
        console.error(`Tool ${toolName} failed after ${maxRetries + 1} attempts. Final error:`, lastError);
      }
    }
  }
  
  throw lastError || new Error("Tool execution failed after retries");
}


/**
 * Execute a tool with enhanced features:
 * - Permission checking
 * - Audit logging
 * - Tracing
 * - Timeouts
 * - Retries with exponential backoff
 */
export async function executeTool(
  name: string,
  input: unknown,
  options: ToolExecutionOptions = {}
): Promise<ToolExecutionResult> {
  const startTime = Date.now();
  const requestId = options.requestId || `req_${Date.now()}`;
  const stepId = options.stepId || generateStepId();
  const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;
  const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
  
  const tool = getTool(name);

  if (!tool) {
    const error = `Tool "${name}" not found in registry`;
    const timingMs = Date.now() - startTime;
    
    // Log trace
    queueTrace({
      request_id: requestId,
      step_id: stepId,
      tool_name: name,
      input,
      error,
      timing_ms: timingMs,
      ts: Date.now(),
    });
    
    return {
      success: false,
      error,
      errorCode: "TOOL_NOT_FOUND",
      timingMs,
    };
  }

  // Permission check (unless skipped)
  if (!options.skipPermissionCheck && toolRequiresConfirmation(tool.permissionTier)) {
    // Note: Actual confirmation is handled in the agent route
    // This is just a check that the tool requires confirmation
  }

  try {
    // Validate input
    const validatedInput = tool.inputSchema.parse(input);

    // Route ROS 2 tools via MCP
    let executeFn: () => Promise<unknown>;
    if (isMCPTool(name)) {
      // Execute via MCP client
      executeFn = async () => {
        const result = await executeMCPTool(name, validatedInput);
        return result;
      };
    } else {
      // Execute local tool
      executeFn = async () => {
        const result = await tool.execute(validatedInput);
        return result;
      };
    }

    const result = await executeWithRetry(
      () => executeWithTimeout(executeFn, timeoutMs),
      maxRetries,
      name
    );

    // Validate output
    const validatedOutput = tool.outputSchema.parse(result);
    const timingMs = Date.now() - startTime;

    // Log audit
    queueAuditLog({
      request_id: requestId,
      tool_name: name,
      permission_tier: tool.permissionTier,
      user_input: options.userInput,
      tool_input: validatedInput,
      tool_output: validatedOutput,
      timing_ms: timingMs,
      ts: Date.now(),
    });

    // Log trace
    queueTrace({
      request_id: requestId,
      step_id: stepId,
      tool_name: name,
      input: validatedInput,
      output: validatedOutput,
      timing_ms: timingMs,
      ts: Date.now(),
    });

    return {
      success: true,
      result: validatedOutput,
      timingMs,
    };
  } catch (error) {
    const timingMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : "Unknown error during tool execution";
    const errorCode = error instanceof Error && "code" in error ? String(error.code) : "EXECUTION_ERROR";

    // Log audit (with error)
    queueAuditLog({
      request_id: requestId,
      tool_name: name,
      permission_tier: tool.permissionTier,
      user_input: options.userInput,
      tool_input: input,
      tool_output: { error: errorMessage },
      timing_ms: timingMs,
      error: errorMessage,
      ts: Date.now(),
    });

    // Log trace (with error)
    queueTrace({
      request_id: requestId,
      step_id: stepId,
      tool_name: name,
      input,
      error: errorMessage,
      timing_ms: timingMs,
      ts: Date.now(),
    });

    return {
      success: false,
      error: errorMessage,
      errorCode,
      timingMs,
    };
  }
}

