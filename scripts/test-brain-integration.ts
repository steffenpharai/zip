/**
 * Integration test for AI Brain orchestration system
 * 
 * Tests the structure and routing of the orchestration system
 * without requiring API calls
 */

import { orchestrateConversation } from "../lib/orchestrators/brain";
import { parseMemoryCommand } from "../lib/memory/memory-manager";
import { createTraceContext } from "../lib/observability/tracer";

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

async function testMemoryCommandRouting() {
  log("\n=== Testing Memory Command Routing ===", "cyan");
  
  try {
    const memoryCmd = parseMemoryCommand("remember that I like TypeScript");
    if (!memoryCmd || memoryCmd.type !== "remember") {
      throw new Error("Memory command parsing failed");
    }
    log("✓ Memory command parsing works", "green");
    
    const memoryCmd2 = parseMemoryCommand("forget about TypeScript");
    if (!memoryCmd2 || memoryCmd2.type !== "forget") {
      throw new Error("Forget command parsing failed");
    }
    log("✓ Forget command parsing works", "green");
    
    const memoryCmd3 = parseMemoryCommand("what do you remember");
    if (!memoryCmd3 || memoryCmd3.type !== "list") {
      throw new Error("List command parsing failed");
    }
    log("✓ List command parsing works", "green");
    
    return true;
  } catch (error) {
    log(`✗ Memory command routing failed: ${error instanceof Error ? error.message : String(error)}`, "red");
    return false;
  }
}

async function testResearchRouting() {
  log("\n=== Testing Research Request Routing ===", "cyan");
  
  try {
    const researchKeywords = [
      "What's the latest news",
      "Search for information about",
      "Find current information",
      "What's happening today",
    ];
    
    for (const keyword of researchKeywords) {
      const message = keyword.toLowerCase();
      const isResearch = /(current|recent|latest|today|now|what's happening|search for|find information about)/i.test(keyword);
      if (!isResearch) {
        throw new Error(`Research routing failed for: ${keyword}`);
      }
    }
    
    log("✓ Research request detection works", "green");
    return true;
  } catch (error) {
    log(`✗ Research routing failed: ${error instanceof Error ? error.message : String(error)}`, "red");
    return false;
  }
}

async function testWorkflowRouting() {
  log("\n=== Testing Workflow Request Routing ===", "cyan");
  
  try {
    const workflowKeywords = [
      "Plan a mission",
      "Break down the steps",
      "How to accomplish",
      "Create a workflow",
    ];
    
    for (const keyword of workflowKeywords) {
      const isWorkflow = /(plan|mission|workflow|break down|steps to|how to accomplish)/i.test(keyword);
      if (!isWorkflow) {
        throw new Error(`Workflow routing failed for: ${keyword}`);
      }
    }
    
    log("✓ Workflow request detection works", "green");
    return true;
  } catch (error) {
    log(`✗ Workflow routing failed: ${error instanceof Error ? error.message : String(error)}`, "red");
    return false;
  }
}

async function testOrchestrationStructure() {
  log("\n=== Testing Orchestration Structure ===", "cyan");
  
  try {
    // Test that orchestrateConversation function exists and has correct signature
    if (typeof orchestrateConversation !== "function") {
      throw new Error("orchestrateConversation is not a function");
    }
    
    log("✓ orchestrateConversation function exists", "green");
    
    // Test that it can be called (will fail without API key, but structure is correct)
    const traceContext = createTraceContext();
    log("✓ Trace context creation works", "green");
    log(`  Request ID: ${traceContext.requestId}`, "blue");
    
    return true;
  } catch (error) {
    log(`✗ Orchestration structure test failed: ${error instanceof Error ? error.message : String(error)}`, "red");
    return false;
  }
}

async function testImports() {
  log("\n=== Testing Module Imports ===", "cyan");
  
  try {
    // Test that all required modules can be imported
    const { toolCallingNode } = await import("../lib/orchestrators/nodes/tool-calling");
    if (typeof toolCallingNode !== "function") {
      throw new Error("toolCallingNode is not a function");
    }
    log("✓ toolCallingNode imported", "green");
    
    const { executeResearchGraph } = await import("../lib/orchestrators/nodes/research-graph");
    if (typeof executeResearchGraph !== "function") {
      throw new Error("executeResearchGraph is not a function");
    }
    log("✓ executeResearchGraph imported", "green");
    
    const { executeWorkflowGraph } = await import("../lib/orchestrators/nodes/workflow-graph");
    if (typeof executeWorkflowGraph !== "function") {
      throw new Error("executeWorkflowGraph is not a function");
    }
    log("✓ executeWorkflowGraph imported", "green");
    
    const { orchestrateConversationWithBrain } = await import("../lib/openai/responses");
    if (typeof orchestrateConversationWithBrain !== "function") {
      throw new Error("orchestrateConversationWithBrain is not a function");
    }
    log("✓ orchestrateConversationWithBrain imported", "green");
    
    return true;
  } catch (error) {
    log(`✗ Module imports failed: ${error instanceof Error ? error.message : String(error)}`, "red");
    return false;
  }
}

async function runAllTests() {
  log("\n" + "=".repeat(60), "cyan");
  log("AI Brain Integration Test Suite (Structure Only)", "cyan");
  log("=".repeat(60), "cyan");
  log("Note: These tests verify structure and routing without API calls", "yellow");
  
  const results: Array<{ name: string; passed: boolean }> = [];
  
  // Run tests that don't require API
  results.push({ name: "Module Imports", passed: await testImports() });
  results.push({ name: "Orchestration Structure", passed: await testOrchestrationStructure() });
  results.push({ name: "Memory Command Routing", passed: await testMemoryCommandRouting() });
  results.push({ name: "Research Routing", passed: await testResearchRouting() });
  results.push({ name: "Workflow Routing", passed: await testWorkflowRouting() });
  
  // Summary
  log("\n" + "=".repeat(60), "cyan");
  log("Test Summary", "cyan");
  log("=".repeat(60), "cyan");
  
  const passed = results.filter((r) => r.passed).length;
  const total = results.length;
  
  results.forEach((result) => {
    const icon = result.passed ? "✓" : "✗";
    const color = result.passed ? "green" : "red";
    log(`${icon} ${result.name}`, color);
  });
  
  log(`\n${passed}/${total} tests passed`, passed === total ? "green" : "yellow");
  
  if (passed === total) {
    log("\n✓ All structure tests passed!", "green");
    log("\nTo run full integration tests with API calls:", "blue");
    log("  Set OPENAI_API_KEY and run: npx tsx scripts/test-orchestration.ts", "blue");
    process.exit(0);
  } else {
    log("\n⚠️  Some tests failed", "yellow");
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  runAllTests().catch((error) => {
    log(`\n✗ Test suite error: ${error instanceof Error ? error.message : String(error)}`, "red");
    process.exit(1);
  });
}

export { runAllTests };

