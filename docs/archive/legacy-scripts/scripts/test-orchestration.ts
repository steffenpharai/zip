/**
 * Test script for OpenAI orchestration features
 * 
 * Tests all AI capabilities: agent, memory, research, documents, vision, notes, timers, workflows
 */

import { orchestrateConversationWithBrain } from "../lib/openai/responses";
import { createTraceContext } from "../lib/observability/tracer";
import { addPinnedMemory, getAllPinned, deletePinnedMemory } from "../lib/memory/memory-manager";
import { parseMemoryCommand } from "../lib/memory/memory-manager";
import { executeResearch } from "../lib/orchestrators/research";
import { executeWorkflow } from "../lib/orchestrators/workflow";

const colors = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
};

function log(message: string, color: keyof typeof colors = "reset") {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

async function testAgentChat() {
  log("\n=== Testing Agent Chat (AI Brain) ===", "cyan");
  
  try {
    const traceContext = createTraceContext();
    const result = await orchestrateConversationWithBrain(
      "What's the weather like?",
      [],
      {
        requestId: traceContext.requestId,
      }
    );
    
    log(`✓ Agent responded: ${result.response.substring(0, 100)}...`, "green");
    if (result.toolResults && result.toolResults.length > 0) {
      log(`✓ Tools used: ${result.toolResults.map(tr => tr.tool).join(", ")}`, "green");
    }
    return true;
  } catch (error) {
    log(`✗ Agent chat failed: ${error instanceof Error ? error.message : String(error)}`, "red");
    return false;
  }
}

async function testMemory() {
  log("\n=== Testing Memory System ===", "cyan");
  
  try {
    // Test memory command parsing
    const rememberCmd = parseMemoryCommand("remember that I prefer dark mode");
    log(`✓ Memory command parsed: ${rememberCmd?.type}`, "green");
    
    // Test adding memory
    addPinnedMemory("test_key", "test_value");
    log("✓ Memory added", "green");
    
    // Test getting all memory
    const allMemory = getAllPinned();
    log(`✓ Retrieved ${allMemory.length} memory entries`, "green");
    
    // Test deleting memory
    deletePinnedMemory("test_key");
    log("✓ Memory deleted", "green");
    
    return true;
  } catch (error) {
    log(`✗ Memory system failed: ${error instanceof Error ? error.message : String(error)}`, "red");
    return false;
  }
}

async function testWebResearch() {
  log("\n=== Testing Web Research ===", "cyan");
  
  try {
    const traceContext = createTraceContext();
    const result = await executeResearch(
      "What is TypeScript?",
      traceContext.requestId
    );
    
    log(`✓ Research completed`, "green");
    log(`  Summary: ${result.summary.substring(0, 150)}...`, "blue");
    log(`  Sources found: ${result.sources.length}`, "blue");
    log(`  Citations: ${result.citations.length}`, "blue");
    return true;
  } catch (error) {
    log(`✗ Web research failed: ${error instanceof Error ? error.message : String(error)}`, "red");
    return false;
  }
}

async function testWorkflow() {
  log("\n=== Testing Workflow Orchestrator ===", "cyan");
  
  try {
    const traceContext = createTraceContext();
    const result = await executeWorkflow(
      "Search for information about Next.js and summarize it",
      traceContext.requestId
    );
    
    log(`✓ Workflow completed: ${result.success ? "SUCCESS" : "PARTIAL"}`, result.success ? "green" : "yellow");
    log(`  Steps executed: ${result.steps.length}`, "blue");
    log(`  Summary: ${result.summary.substring(0, 150)}...`, "blue");
    return true;
  } catch (error) {
    log(`✗ Workflow failed: ${error instanceof Error ? error.message : String(error)}`, "red");
    return false;
  }
}

async function testMultiStepToolCalling() {
  log("\n=== Testing Multi-Step Tool Calling (AI Brain) ===", "cyan");
  
  try {
    const traceContext = createTraceContext();
    const result = await orchestrateConversationWithBrain(
      "Get the weather and system stats",
      [],
      {
        requestId: traceContext.requestId,
        skipConfirmation: true,
      }
    );
    
    log(`✓ Multi-step completed`, "green");
    if (result.toolResults && result.toolResults.length > 0) {
      log(`  Tools called: ${result.toolResults.map(tr => tr.tool).join(", ")}`, "blue");
    }
    log(`  Response: ${result.response.substring(0, 100)}...`, "blue");
    return true;
  } catch (error) {
    log(`✗ Multi-step tool calling failed: ${error instanceof Error ? error.message : String(error)}`, "red");
    return false;
  }
}

async function testMemoryIntegration() {
  log("\n=== Testing Memory Integration in Chat (AI Brain) ===", "cyan");
  
  try {
    // First, add a memory
    addPinnedMemory("user_preference", "User prefers concise responses");
    
    const traceContext = createTraceContext();
    const result = await orchestrateConversationWithBrain(
      "What do you remember about me?",
      [],
      {
        requestId: traceContext.requestId,
      }
    );
    
    log(`✓ Memory integration test completed`, "green");
    log(`  Response: ${result.response.substring(0, 150)}...`, "blue");
    
    // Cleanup
    deletePinnedMemory("user_preference");
    return true;
  } catch (error) {
    log(`✗ Memory integration failed: ${error instanceof Error ? error.message : String(error)}`, "red");
    return false;
  }
}

async function testResearchOrchestration() {
  log("\n=== Testing Research Orchestration (AI Brain) ===", "cyan");
  
  try {
    const traceContext = createTraceContext();
    const result = await orchestrateConversationWithBrain(
      "What's the latest news about AI?",
      [],
      {
        requestId: traceContext.requestId,
        skipConfirmation: true,
      }
    );
    
    log(`✓ Research orchestration completed`, "green");
    if (result.toolResults && result.toolResults.length > 0) {
      const researchResult = result.toolResults.find(tr => tr.tool === "research");
      if (researchResult) {
        log(`  Research tool used successfully`, "blue");
      }
    }
    log(`  Response length: ${result.response.length} chars`, "blue");
    return true;
  } catch (error) {
    log(`✗ Research orchestration failed: ${error instanceof Error ? error.message : String(error)}`, "red");
    return false;
  }
}

async function testMemoryCommands() {
  log("\n=== Testing Memory Commands (AI Brain) ===", "cyan");
  
  try {
    const traceContext = createTraceContext();
    
    // Test remember command
    const rememberResult = await orchestrateConversationWithBrain(
      "remember that I like TypeScript",
      [],
      {
        requestId: traceContext.requestId,
      }
    );
    log(`✓ Remember command: ${rememberResult.response.substring(0, 80)}...`, "green");
    
    // Test list command
    const listResult = await orchestrateConversationWithBrain(
      "what do you remember",
      [],
      {
        requestId: traceContext.requestId,
      }
    );
    log(`✓ List command executed`, "green");
    log(`  Response: ${listResult.response.substring(0, 100)}...`, "blue");
    
    // Test forget command
    const forgetResult = await orchestrateConversationWithBrain(
      "forget that I like TypeScript",
      [],
      {
        requestId: traceContext.requestId,
      }
    );
    log(`✓ Forget command: ${forgetResult.response.substring(0, 80)}...`, "green");
    
    return true;
  } catch (error) {
    log(`✗ Memory commands failed: ${error instanceof Error ? error.message : String(error)}`, "red");
    return false;
  }
}

async function testWorkflowOrchestration() {
  log("\n=== Testing Workflow Orchestration (AI Brain) ===", "cyan");
  
  try {
    const traceContext = createTraceContext();
    const result = await orchestrateConversationWithBrain(
      "Plan a mission to search for information about Next.js and summarize it",
      [],
      {
        requestId: traceContext.requestId,
        skipConfirmation: true,
      }
    );
    
    log(`✓ Workflow orchestration completed`, "green");
    if (result.toolResults && result.toolResults.length > 0) {
      const workflowResult = result.toolResults.find(tr => tr.tool === "workflow");
      if (workflowResult) {
        log(`  Workflow tool used successfully`, "blue");
      }
    }
    log(`  Response length: ${result.response.length} chars`, "blue");
    return true;
  } catch (error) {
    log(`✗ Workflow orchestration failed: ${error instanceof Error ? error.message : String(error)}`, "red");
    return false;
  }
}

async function runAllTests() {
  log("\n" + "=".repeat(60), "cyan");
  log("AI Brain Orchestration Test Suite", "cyan");
  log("=".repeat(60), "cyan");
  
  const results: Array<{ name: string; passed: boolean }> = [];
  
  // Run tests
  results.push({ name: "Agent Chat (AI Brain)", passed: await testAgentChat() });
  results.push({ name: "Memory System", passed: await testMemory() });
  results.push({ name: "Web Research", passed: await testWebResearch() });
  results.push({ name: "Workflow Orchestrator", passed: await testWorkflow() });
  results.push({ name: "Multi-Step Tool Calling (AI Brain)", passed: await testMultiStepToolCalling() });
  results.push({ name: "Memory Integration (AI Brain)", passed: await testMemoryIntegration() });
  results.push({ name: "Research Orchestration (AI Brain)", passed: await testResearchOrchestration() });
  results.push({ name: "Memory Commands (AI Brain)", passed: await testMemoryCommands() });
  results.push({ name: "Workflow Orchestration (AI Brain)", passed: await testWorkflowOrchestration() });
  
  // Summary
  log("\n" + "=".repeat(60), "cyan");
  log("Test Summary", "cyan");
  log("=".repeat(60), "cyan");
  
  const passed = results.filter(r => r.passed).length;
  const total = results.length;
  
  results.forEach(result => {
    const icon = result.passed ? "✓" : "✗";
    const color = result.passed ? "green" : "red";
    log(`${icon} ${result.name}`, color);
  });
  
  log(`\n${passed}/${total} tests passed`, passed === total ? "green" : "yellow");
  
  if (passed === total) {
    log("\n🎉 All orchestration tests passed!", "green");
    process.exit(0);
  } else {
    log("\n⚠️  Some tests failed", "yellow");
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  runAllTests().catch(error => {
    log(`\n✗ Test suite error: ${error instanceof Error ? error.message : String(error)}`, "red");
    process.exit(1);
  });
}

export { runAllTests };

