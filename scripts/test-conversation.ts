#!/usr/bin/env npx tsx
/**
 * Test script for conversation functionality
 * Verifies that messages are sent and responses are received
 */

const API_BASE = process.env.API_BASE || "http://localhost:3000";

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

async function parseSSEResponse(response: Response): Promise<{ response?: string; toolResults?: any[]; hasText?: boolean }> {
  const reader = response.body?.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finalResponse = "";
  let toolResults: any[] = [];
  let hasText = false;
  
  if (!reader) {
    throw new Error("No response body");
  }
  
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.startsWith("event: ")) {
        const eventType = line.slice(7).trim();
        // Look for the next data line
        if (i + 1 < lines.length && lines[i + 1].startsWith("data: ")) {
          try {
            const data = JSON.parse(lines[i + 1].slice(6));
            if (eventType === "text" && data.delta) {
              hasText = true;
              finalResponse += data.delta;
            } else if (eventType === "toolResults" && Array.isArray(data)) {
              toolResults = data;
            } else if (eventType === "activity" && data.tool) {
              if (data.type === "tool_start" || data.type === "tool_complete") {
                toolResults.push({ tool: data.tool, result: data.result || data });
              }
            }
          } catch (e) {
            // Ignore parse errors
          }
        }
      } else if (line.startsWith("data: ")) {
        try {
          const data = JSON.parse(line.slice(6));
          if (data.delta) {
            hasText = true;
            finalResponse += data.delta;
          }
          if (data.toolResults && Array.isArray(data.toolResults)) {
            toolResults = data.toolResults;
          }
        } catch (e) {
          // Ignore parse errors
        }
      }
    }
  }
  
  return { response: finalResponse, toolResults, hasText };
}

async function testBasicConversation() {
  log("\n=== Test 1: Basic Conversation ===", "cyan");
  
  try {
    const response = await fetch(`${API_BASE}/api/agent`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "Hello, how are you?",
        conversationHistory: [],
      }),
    });
    
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`HTTP ${response.status}: ${error}`);
    }
    
    const data = await parseSSEResponse(response);
    
    if (data.hasText && data.response && data.response.trim().length > 0) {
      log(`✓ Conversation working - received response`, "green");
      log(`  Response: ${data.response.substring(0, 150)}...`, "blue");
      if (data.toolResults && data.toolResults.length > 0) {
        log(`  Tools used: ${data.toolResults.map((tr: any) => tr.tool || tr.name || "unknown").join(", ")}`, "blue");
      }
      return true;
    } else {
      log(`✗ No text response received`, "red");
      log(`  hasText: ${data.hasText}, response length: ${data.response?.length || 0}`, "yellow");
      return false;
    }
  } catch (error) {
    log(`✗ Test failed: ${error instanceof Error ? error.message : String(error)}`, "red");
    return false;
  }
}

async function testVisionQuery() {
  log("\n=== Test 2: Vision Query ===", "cyan");
  
  try {
    const response = await fetch(`${API_BASE}/api/agent`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "what objects do you see?",
        conversationHistory: [],
      }),
    });
    
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`HTTP ${response.status}: ${error}`);
    }
    
    const data = await parseSSEResponse(response);
    
    if (data.hasText && data.response && data.response.trim().length > 0) {
      log(`✓ Vision query working`, "green");
      log(`  Response: ${data.response.substring(0, 200)}...`, "blue");
      if (data.toolResults && data.toolResults.length > 0) {
        const visionTool = data.toolResults.find((tr: any) => 
          (tr.tool === "get_vision_detections") || (tr.tool === "query_vision") ||
          (tr.name === "get_vision_detections") || (tr.name === "query_vision")
        );
        if (visionTool) {
          log(`  ✓ Vision tool was called: ${visionTool.tool || visionTool.name}`, "green");
        } else {
          log(`  ⚠ Vision tool was not called`, "yellow");
        }
      }
      return true;
    } else {
      log(`✗ No response received`, "red");
      return false;
    }
  } catch (error) {
    log(`✗ Test failed: ${error instanceof Error ? error.message : String(error)}`, "red");
    return false;
  }
}

async function checkServiceHealth() {
  log("\n=== Pre-flight Check: Service Health ===", "cyan");
  
  try {
    const response = await fetch(`${API_BASE}/api/health`, {
      signal: AbortSignal.timeout(3000),
    });
    
    if (response.ok) {
      log(`✓ Service is healthy`, "green");
      return true;
    } else {
      log(`⚠ Service returned status ${response.status}`, "yellow");
      return false;
    }
  } catch (error) {
    log(`⚠ Health check failed: ${error instanceof Error ? error.message : String(error)}`, "yellow");
    log(`  Service may still be starting up...`, "yellow");
    return false;
  }
}

async function main() {
  log("=== Conversation Functionality Test ===", "cyan");
  log(`Testing against: ${API_BASE}`, "blue");
  
  // Pre-flight check
  await checkServiceHealth();
  
  // Run tests
  const results = {
    test1: await testBasicConversation(),
    test2: await testVisionQuery(),
  };
  
  // Summary
  log("\n=== Test Summary ===", "cyan");
  const passed = Object.values(results).filter(Boolean).length;
  const total = Object.keys(results).length;
  
  log(`Passed: ${passed}/${total}`, passed === total ? "green" : "yellow");
  
  if (passed === total) {
    log("\n✓ All tests passed! Conversation is working.", "green");
    process.exit(0);
  } else {
    log("\n⚠ Some tests had issues. Check the output above.", "yellow");
    process.exit(1);
  }
}

main().catch((error) => {
  log(`\n✗ Fatal error: ${error}`, "red");
  process.exit(1);
});
