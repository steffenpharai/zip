/**
 * Eval harness script
 * 
 * Runs 20 scripted prompts to verify tool usage and schema validation
 */

import { orchestrateConversationWithBrain } from "../lib/openai/responses";
import { createTraceContext } from "../lib/observability/tracer";

interface TestCase {
  name: string;
  prompt: string;
  expectedTools?: string[];
  shouldUseTools: boolean;
}

const testCases: TestCase[] = [
  {
    name: "System stats query",
    prompt: "What's my CPU usage?",
    expectedTools: ["get_system_stats"],
    shouldUseTools: true,
  },
  {
    name: "Weather query",
    prompt: "What's the weather like?",
    expectedTools: ["get_weather"],
    shouldUseTools: true,
  },
  {
    name: "Web search request",
    prompt: "Search for information about TypeScript 5.0",
    expectedTools: ["web_search"],
    shouldUseTools: true,
  },
  {
    name: "Create note",
    prompt: "Create a note titled 'Meeting Notes' with body 'Discuss project timeline'",
    expectedTools: ["create_note"],
    shouldUseTools: true,
  },
  {
    name: "List notes",
    prompt: "Show me all my notes",
    expectedTools: ["list_notes"],
    shouldUseTools: true,
  },
  {
    name: "Create timer",
    prompt: "Set a timer for 5 minutes",
    expectedTools: ["create_timer"],
    shouldUseTools: true,
  },
  {
    name: "Memory command - remember",
    prompt: "Remember that I prefer dark mode",
    shouldUseTools: false,
  },
  {
    name: "Memory command - list",
    prompt: "What do you remember?",
    shouldUseTools: false,
  },
  {
    name: "Research request",
    prompt: "What's the latest news about AI?",
    expectedTools: ["web_search", "fetch_url", "summarize_sources"],
    shouldUseTools: true,
  },
  {
    name: "Simple question (no tools)",
    prompt: "What is 2 + 2?",
    shouldUseTools: false,
  },
  {
    name: "URL fetch",
    prompt: "Fetch content from https://example.com",
    expectedTools: ["fetch_url"],
    shouldUseTools: true,
  },
  {
    name: "Document search",
    prompt: "Search my documents for information about React",
    expectedTools: ["doc_search"],
    shouldUseTools: true,
  },
  {
    name: "Document Q&A",
    prompt: "Answer this question using my documents: What is the main topic?",
    expectedTools: ["doc_answer"],
    shouldUseTools: true,
  },
  {
    name: "Workflow request",
    prompt: "Plan a trip to Paris",
    expectedTools: ["web_search"],
    shouldUseTools: true,
  },
  {
    name: "Camera control",
    prompt: "Enable the camera",
    expectedTools: ["set_camera_enabled"],
    shouldUseTools: true,
  },
  {
    name: "Uptime query",
    prompt: "How long has the system been running?",
    expectedTools: ["get_uptime"],
    shouldUseTools: true,
  },
  {
    name: "Search notes",
    prompt: "Search my notes for 'meeting'",
    expectedTools: ["search_notes"],
    shouldUseTools: true,
  },
  {
    name: "Open URL (requires confirmation)",
    prompt: "Open https://example.com",
    expectedTools: ["open_url"],
    shouldUseTools: true,
  },
  {
    name: "Multiple tool usage",
    prompt: "Get the weather and system stats",
    expectedTools: ["get_weather", "get_system_stats"],
    shouldUseTools: true,
  },
  {
    name: "Conversational (no tools needed)",
    prompt: "Hello, how are you?",
    shouldUseTools: false,
  },
];

async function runEval() {
  console.log("Running eval harness...\n");
  
  let passed = 0;
  let failed = 0;
  const failures: Array<{ name: string; error: string }> = [];

  for (const testCase of testCases) {
    try {
      const traceContext = createTraceContext();
      const result = await orchestrateConversationWithBrain(
        testCase.prompt,
        [],
        {
          requestId: traceContext.requestId,
          skipConfirmation: true, // Skip confirmations for eval
        }
      );

      const toolsUsed = result.toolResults?.map(tr => tr.tool) || [];
      const usedTools = testCase.shouldUseTools && toolsUsed.length > 0;
      const noToolsWhenNotNeeded = !testCase.shouldUseTools && toolsUsed.length === 0;
      const expectedToolsMatch = testCase.expectedTools
        ? testCase.expectedTools.every(tool => toolsUsed.includes(tool))
        : true;

      if ((usedTools || noToolsWhenNotNeeded) && expectedToolsMatch) {
        console.log(`✓ ${testCase.name}`);
        passed++;
      } else {
        console.log(`✗ ${testCase.name}`);
        console.log(`  Expected tools: ${testCase.expectedTools?.join(", ") || "none"}`);
        console.log(`  Tools used: ${toolsUsed.join(", ") || "none"}`);
        failed++;
        failures.push({
          name: testCase.name,
          error: `Tool usage mismatch. Expected: ${testCase.expectedTools?.join(", ") || "none"}, Got: ${toolsUsed.join(", ") || "none"}`,
        });
      }
    } catch (error) {
      console.log(`✗ ${testCase.name} - ERROR`);
      console.log(`  ${error instanceof Error ? error.message : String(error)}`);
      failed++;
      failures.push({
        name: testCase.name,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  console.log(`\n=== Results ===`);
  console.log(`Passed: ${passed}/${testCases.length}`);
  console.log(`Failed: ${failed}/${testCases.length}`);

  if (failures.length > 0) {
    console.log(`\n=== Failures ===`);
    failures.forEach(f => {
      console.log(`${f.name}: ${f.error}`);
    });
    process.exit(1);
  } else {
    console.log("\nAll tests passed!");
    process.exit(0);
  }
}

// Run if executed directly
if (require.main === module) {
  runEval().catch(error => {
    console.error("Eval harness error:", error);
    process.exit(1);
  });
}

export { runEval };

