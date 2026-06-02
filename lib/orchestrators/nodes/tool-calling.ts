/**
 * Tool calling node for LangGraph orchestration
 * 
 * Handles direct LLM tool calling with multi-step loops
 */

import OpenAI from "openai";
import type { OrchestrationState } from "../types";
import { getAllTools, requiresConfirmation } from "@/lib/tools/registry";
import { executeTool } from "@/lib/tools/executor";
import { zodToJsonSchema } from "@/lib/utils/zod-to-json-schema";
import { getSystemPrompt } from "@/lib/openai/prompts";
import { generateStepId } from "@/lib/observability/tracer";
import { formatContextData } from "../utils/context-formatter";
import { filterConversationHistory } from "../utils/context-filter";
import type { ActivityTracker } from "../utils/activity-tracker";
import type { OrchestrationCallbacks } from "../brain";
import { getSkipConfirmation } from "../brain";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const MAX_ITERATIONS = 10;

/**
 * Tool calling node
 * Executes direct LLM tool calling with multi-step loops
 */
export async function toolCallingNode(
  state: OrchestrationState,
  activityTracker?: ActivityTracker | null,
  callbacks?: OrchestrationCallbacks | null
): Promise<Partial<OrchestrationState>> {
  const nodeStartTime = Date.now();
  const model = process.env.OPENAI_RESPONSES_MODEL || "gpt-4o";
  const tools = getAllTools();
  const skipConfirmation = getSkipConfirmation();

  console.log(`[LANGGRAPH] [${state.requestId}] [TOOL_CALLING] Starting tool calling node`);
  console.log(`[LANGGRAPH] [${state.requestId}] [TOOL_CALLING] Model: ${model}, Available tools: ${tools.length}, skipConfirmation: ${skipConfirmation}`);

  // Filter conversation history to include only relevant context
  // Skip filtering if skipConfirmation is true (confirmation requests need full context)
  const filteredHistory = skipConfirmation
    ? state.conversationHistory
    : await filterConversationHistory(
        state.userMessage,
        state.conversationHistory,
        state.requestId
      );

  // Build system prompt with memory and context
  const memoryContext = state.pinnedMemory || "";
  const contextString = formatContextData(state.contextData);
  const systemPrompt = getSystemPrompt("planner") + memoryContext + contextString;

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    {
      role: "system",
      content: systemPrompt,
    },
    ...filteredHistory.map((msg) => ({
      role: msg.role,
      content: msg.content,
    })),
    {
      role: "user",
      content: state.userMessage,
    },
  ];

  const toolDefinitions: OpenAI.Chat.Completions.ChatCompletionTool[] =
    tools.map((tool) => ({
      type: "function",
      function: {
        name: tool.name,
        description: tool.description,
        parameters: zodToJsonSchema(tool.inputSchema),
      },
    }));

  // Multi-step tool loop
  let iteration = 0;
  let finalResponse = "";
  const allToolResults: Array<{ tool: string; result: unknown }> = [];
  let currentMessages = messages;

  console.log(`[LANGGRAPH] [${state.requestId}] [TOOL_CALLING] Starting tool loop (max ${MAX_ITERATIONS} iterations)`);

  while (iteration < MAX_ITERATIONS) {
    const iterationStartTime = Date.now();
    console.log(`[LANGGRAPH] [${state.requestId}] [TOOL_CALLING] Iteration ${iteration + 1}/${MAX_ITERATIONS}`);
    
    // Emit LLM call activity
    if (activityTracker) {
      const promptPreview = systemPrompt.substring(0, 200) + "...";
      activityTracker.emitLLMCall(model, promptPreview, state.requestId);
    }

    // Use streaming API
    const stream = await openai.chat.completions.create({
      model,
      messages: currentMessages,
      tools: toolDefinitions.length > 0 ? toolDefinitions : undefined,
      tool_choice: "auto",
      stream: true,
    });

    // Process streaming response
    let assistantMessage: OpenAI.Chat.Completions.ChatCompletionMessage | null = null;
    let accumulatedContent = "";
    let toolCalls: OpenAI.Chat.Completions.ChatCompletionMessageToolCall[] = [];

    for await (const chunk of stream) {
      const choice = chunk.choices[0];
      if (!choice) continue;

      const delta = choice.delta;

      // Accumulate text content
      if (delta.content) {
        accumulatedContent += delta.content;
        // Stream text deltas to callback
        if (callbacks?.onTextDelta) {
          callbacks.onTextDelta(delta.content);
        }
      }

      // Accumulate tool calls
      if (delta.tool_calls) {
        for (const toolCallDelta of delta.tool_calls) {
          const index = toolCallDelta.index;
          if (index !== undefined) {
            if (!toolCalls[index]) {
              toolCalls[index] = {
                id: toolCallDelta.id || "",
                type: "function",
                function: {
                  name: toolCallDelta.function?.name || "",
                  arguments: toolCallDelta.function?.arguments || "",
                },
              };
            } else {
              if (toolCallDelta.function?.name) {
                toolCalls[index].function.name = toolCallDelta.function.name;
              }
              if (toolCallDelta.function?.arguments) {
                toolCalls[index].function.arguments += toolCallDelta.function.arguments;
              }
            }
          }
        }
      }

      // Build assistant message from final chunk
      if (choice.finish_reason) {
        assistantMessage = {
          role: "assistant",
          content: accumulatedContent || null,
          tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
          refusal: null,
        };
      }
    }

    if (!assistantMessage) {
      // Fallback: create message from accumulated content
      assistantMessage = {
        role: "assistant",
        content: accumulatedContent || null,
        tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
        refusal: null,
      };
    }

    // Add assistant message to conversation
    if (assistantMessage) {
      currentMessages.push(assistantMessage);
    }

    // If there's text content, we might be done
    if (assistantMessage && assistantMessage.content) {
      finalResponse = assistantMessage.content;
    }

    // Handle tool calls
    if (assistantMessage && assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
      const toolCallResults: Array<{ tool_call_id: string; role: "tool"; content: string }> = [];

      for (const toolCall of assistantMessage.tool_calls) {
        if (toolCall.type === "function") {
          const toolName = toolCall.function.name;
          let toolInput = {};

          try {
            toolInput = JSON.parse(toolCall.function.arguments || "{}");
          } catch (error) {
            console.error(`[LANGGRAPH] [${state.requestId}] [TOOL_CALLING] Failed to parse tool arguments:`, error);
          }

          const toolStartTime = Date.now();
          console.log(`[LANGGRAPH] [${state.requestId}] [TOOL_CALLING] Executing tool: ${toolName}`, JSON.stringify(toolInput).substring(0, 200));

          // Emit tool start activity
          if (activityTracker) {
            activityTracker.emitToolStart(toolName, toolInput, state.requestId);
          }

          // Check if tool requires confirmation
          const tool = tools.find((t) => t.name === toolName);
          console.log(`[LANGGRAPH] [${state.requestId}] [TOOL_CALLING] Tool ${toolName} requires confirmation: ${tool ? requiresConfirmation(tool.permissionTier) : 'unknown'}, skipConfirmation: ${skipConfirmation}`);
          if (tool && requiresConfirmation(tool.permissionTier) && !skipConfirmation) {
            if (activityTracker) {
              activityTracker.emitToolComplete(toolName, { requiresConfirmation: true }, state.requestId);
            }

            // Add tool result indicating confirmation is needed
            const confirmationToolResult: Array<{ tool_call_id: string; role: "tool"; content: string }> = [
              {
                tool_call_id: toolCall.id,
                role: "tool",
                content: JSON.stringify({ requiresConfirmation: true, tool: toolName, input: toolInput }),
              },
            ];

            // Add tool results to messages for context
            const messagesWithToolCall = [...currentMessages, ...confirmationToolResult];

            // Generate a response explaining what action is pending confirmation
            console.log(`[LANGGRAPH] [${state.requestId}] [TOOL_CALLING] Generating response for tool requiring confirmation: ${toolName}`);
            
            const responseStream = await openai.chat.completions.create({
              model,
              messages: messagesWithToolCall,
              tools: undefined, // Don't allow more tool calls, just generate a response
              tool_choice: undefined,
              stream: true,
            });

            let confirmationResponse = "";
            for await (const chunk of responseStream) {
              const choice = chunk.choices[0];
              if (!choice) continue;

              const delta = choice.delta;
              if (delta.content) {
                confirmationResponse += delta.content;
                // Stream text deltas to callback
                if (callbacks?.onTextDelta) {
                  callbacks.onTextDelta(delta.content);
                }
              }
            }

            console.log(`[LANGGRAPH] [${state.requestId}] [TOOL_CALLING] Generated confirmation response (${confirmationResponse.length} chars)`);

            return {
              response: confirmationResponse || `I'll execute ${toolName} for you. Please confirm to proceed.`,
              requiresConfirmation: {
                tool: toolName,
                input: toolInput,
                message: `Confirm: do you want me to execute ${toolName}?`,
              },
            };
          }

          // Execute tool
          console.log(`[LANGGRAPH] [${state.requestId}] [TOOL_CALLING] Executing tool ${toolName} (skipConfirmation: ${skipConfirmation})`);
          const result = await executeTool(
            toolName,
            toolInput,
            {
              requestId: state.requestId,
              stepId: generateStepId(),
              userInput: state.userMessage,
            }
          );
          console.log(`[LANGGRAPH] [${state.requestId}] [TOOL_CALLING] Tool ${toolName} execution result: success=${result.success}`);

          const toolDuration = Date.now() - toolStartTime;
          const toolResult = result.success ? result.result : { error: result.error };
          allToolResults.push({
            tool: toolName,
            result: toolResult,
          });

          console.log(`[LANGGRAPH] [${state.requestId}] [TOOL_CALLING] Tool ${toolName} completed (${toolDuration}ms, success: ${result.success})`);

          // Emit tool complete activity
          if (activityTracker) {
            activityTracker.emitToolComplete(toolName, toolResult, state.requestId);
          }

          // Add tool result to messages
          toolCallResults.push({
            tool_call_id: toolCall.id,
            role: "tool",
            content: JSON.stringify(toolResult),
          });
        }
      }

      // Add tool results to messages and continue loop
      currentMessages.push(...toolCallResults);
      iteration++;
      continue;
    }

    // No more tool calls, we're done
    const iterationDuration = Date.now() - iterationStartTime;
    console.log(`[LANGGRAPH] [${state.requestId}] [TOOL_CALLING] Iteration ${iteration + 1} completed (${iterationDuration}ms, no tool calls)`);
    break;
  }

  const nodeDuration = Date.now() - nodeStartTime;
  console.log(`[LANGGRAPH] [${state.requestId}] [TOOL_CALLING] Tool calling completed (${nodeDuration}ms, ${allToolResults.length} tools executed, ${finalResponse.length} char response)`);

  return {
    response: finalResponse,
    toolResults: allToolResults,
  };
}

