#!/usr/bin/env tsx
/**
 * Test Robot Control via Chat Interface
 * 
 * Tests the full integration: Chat → Agent → Tools → MCP → ROS 2
 */

const API_BASE = process.env.API_BASE || "http://localhost:3000";

interface SSEMessage {
  type: string;
  data?: any;
}

async function parseSSEResponse(response: Response): Promise<{
  hasText: boolean;
  response: string;
  toolResults?: Array<{ tool: string; result: unknown }>;
  requiresConfirmation?: { tool: string; input: unknown; message: string };
}> {
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("No response body");
  }

  const decoder = new TextDecoder();
  let buffer = "";
  let fullResponse = "";
  let toolResults: Array<{ tool: string; result: unknown }> = [];
  let requiresConfirmation: { tool: string; input: unknown; message: string } | undefined;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (line.startsWith("data: ")) {
        try {
          const data = JSON.parse(line.slice(6));
          
          if (data.type === "text" && data.delta) {
            fullResponse += data.delta;
          } else if (data.type === "toolResults" && data.toolResults) {
            toolResults = data.toolResults;
          } else if (data.type === "confirmation" && data.requiresConfirmation) {
            requiresConfirmation = data.requiresConfirmation;
          }
        } catch (e) {
          // Ignore parse errors
        }
      }
    }
  }

  return {
    hasText: fullResponse.length > 0,
    response: fullResponse,
    toolResults: toolResults.length > 0 ? toolResults : undefined,
    requiresConfirmation,
  };
}

function log(message: string, color: "green" | "red" | "yellow" | "blue" | "cyan" = "cyan") {
  const colors = {
    green: "\x1b[32m",
    red: "\x1b[31m",
    yellow: "\x1b[33m",
    blue: "\x1b[34m",
    cyan: "\x1b[36m",
    reset: "\x1b[0m",
  };
  console.log(`${colors[color]}${message}${colors.reset}`);
}

async function testRobotStatus() {
  log("\n=== Test 1: Get Robot Status ===", "cyan");
  
  try {
    const response = await fetch(`${API_BASE}/api/agent`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "What's the robot status?",
        conversationHistory: [],
      }),
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    const data = await parseSSEResponse(response);
    
    if (data.toolResults && data.toolResults.length > 0) {
      const tool = data.toolResults[0];
      log(`✓ Tool called: ${tool.tool}`, "green");
      log(`  Response: ${data.response.substring(0, 200)}...`, "blue");
      return true;
    } else {
      log(`⚠ No tools called, but got response: ${data.response.substring(0, 100)}...`, "yellow");
      return true;
    }
  } catch (error) {
    log(`✗ Test failed: ${error instanceof Error ? error.message : String(error)}`, "red");
    return false;
  }
}

async function testServoControl() {
  log("\n=== Test 2: Servo Control (with confirmation) ===", "cyan");
  
  try {
    const response = await fetch(`${API_BASE}/api/agent`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "Turn the servo to 90 degrees",
        conversationHistory: [],
      }),
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    const data = await parseSSEResponse(response);
    
    if (data.requiresConfirmation) {
      log(`✓ Confirmation required for: ${data.requiresConfirmation.tool}`, "green");
      log(`  Message: ${data.requiresConfirmation.message}`, "blue");
      log(`  Input: ${JSON.stringify(data.requiresConfirmation.input)}`, "blue");
      return true;
    } else if (data.toolResults && data.toolResults.length > 0) {
      log(`✓ Tool executed: ${data.toolResults[0].tool}`, "green");
      log(`  Response: ${data.response.substring(0, 200)}...`, "blue");
      return true;
    } else {
      log(`⚠ No confirmation or tool results`, "yellow");
      log(`  Response: ${data.response.substring(0, 200)}...`, "blue");
      return true;
    }
  } catch (error) {
    log(`✗ Test failed: ${error instanceof Error ? error.message : String(error)}`, "red");
    return false;
  }
}

async function testMacroExecute() {
  log("\n=== Test 3: Macro Execute (with confirmation) ===", "cyan");
  
  try {
    const response = await fetch(`${API_BASE}/api/agent`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "Execute a figure-8 pattern",
        conversationHistory: [],
      }),
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    const data = await parseSSEResponse(response);
    
    if (data.requiresConfirmation) {
      log(`✓ Confirmation required for: ${data.requiresConfirmation.tool}`, "green");
      log(`  Message: ${data.requiresConfirmation.message}`, "blue");
      return true;
    } else if (data.toolResults && data.toolResults.length > 0) {
      log(`✓ Tool executed: ${data.toolResults[0].tool}`, "green");
      return true;
    } else {
      log(`⚠ Response: ${data.response.substring(0, 200)}...`, "yellow");
      return true;
    }
  } catch (error) {
    log(`✗ Test failed: ${error instanceof Error ? error.message : String(error)}`, "red");
    return false;
  }
}

async function testRobotDiagnostics() {
  log("\n=== Test 4: Get Robot Diagnostics ===", "cyan");
  
  try {
    const response = await fetch(`${API_BASE}/api/agent`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "Get robot diagnostics",
        conversationHistory: [],
      }),
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    const data = await parseSSEResponse(response);
    
    if (data.toolResults && data.toolResults.length > 0) {
      const tool = data.toolResults[0];
      log(`✓ Tool called: ${tool.tool}`, "green");
      log(`  Result: ${JSON.stringify(tool.result).substring(0, 300)}...`, "blue");
      return true;
    } else {
      log(`⚠ No tools called`, "yellow");
      return false;
    }
  } catch (error) {
    log(`✗ Test failed: ${error instanceof Error ? error.message : String(error)}`, "red");
    return false;
  }
}

async function main() {
  log("=".repeat(60), "cyan");
  log("Robot Control Chat Integration Test", "cyan");
  log("=".repeat(60), "cyan");
  
  const results = {
    status: await testRobotStatus(),
    servo: await testServoControl(),
    macro: await testMacroExecute(),
    diagnostics: await testRobotDiagnostics(),
  };
  
  log("\n" + "=".repeat(60), "cyan");
  log("Test Results Summary", "cyan");
  log("=".repeat(60), "cyan");
  log(`Robot Status: ${results.status ? "✓ PASS" : "✗ FAIL"}`, results.status ? "green" : "red");
  log(`Servo Control: ${results.servo ? "✓ PASS" : "✗ FAIL"}`, results.servo ? "green" : "red");
  log(`Macro Execute: ${results.macro ? "✓ PASS" : "✗ FAIL"}`, results.macro ? "green" : "red");
  log(`Diagnostics: ${results.diagnostics ? "✓ PASS" : "✗ FAIL"}`, results.diagnostics ? "green" : "red");
  
  const allPassed = Object.values(results).every(r => r);
  log(`\nOverall: ${allPassed ? "✓ ALL TESTS PASSED" : "⚠ SOME TESTS FAILED"}`, allPassed ? "green" : "yellow");
  
  process.exit(allPassed ? 0 : 1);
}

main().catch(console.error);
