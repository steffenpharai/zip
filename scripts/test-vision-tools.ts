#!/usr/bin/env npx tsx
/**
 * Test script for vision tools integration
 * Tests get_vision_detections and query_vision tools through the agent API
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

async function parseSSEResponse(response: Response): Promise<{ response?: string; toolResults?: any[] }> {
  const reader = response.body?.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finalResponse = "";
  let toolResults: any[] = [];
  
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
              finalResponse += data.delta;
            } else if (eventType === "toolResults" && Array.isArray(data)) {
              toolResults = data;
            } else if (eventType === "activity" && data.tool) {
              // Activity events can contain tool info
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
  
  return { response: finalResponse, toolResults };
}

async function testVisionDetections() {
  log("\n=== Test 1: get_vision_detections Tool ===", "cyan");
  
  try {
    const response = await fetch(`${API_BASE}/api/agent`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "What objects do you see? Use get_vision_detections to check.",
        conversationHistory: [],
      }),
    });
    
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`HTTP ${response.status}: ${error}`);
    }
    
    const data = await parseSSEResponse(response);
    log(`✓ Agent responded`, "green");
    log(`  Response: ${data.response?.substring(0, 200) || "No response"}...`, "blue");
    
    if (data.toolResults && data.toolResults.length > 0) {
      log(`  Tools used: ${data.toolResults.map((tr: any) => tr.tool || tr.name || "unknown").join(", ")}`, "blue");
      
      const visionTool = data.toolResults.find((tr: any) => 
        (tr.tool === "get_vision_detections") || (tr.name === "get_vision_detections")
      );
      if (visionTool) {
        log(`  ✓ get_vision_detections was called`, "green");
        const result = visionTool.result || visionTool;
        if (result.count !== undefined) {
          log(`  Detections found: ${result.count || 0}`, "blue");
          if (result.detections && result.detections.length > 0) {
            log(`  Sample detection: ${result.detections[0].className} (${(result.detections[0].confidence * 100).toFixed(0)}% confidence)`, "blue");
          }
        }
      } else {
        log(`  ⚠ get_vision_detections was not called`, "yellow");
      }
    } else {
      log(`  ⚠ No tools were called`, "yellow");
    }
    
    return true;
  } catch (error) {
    log(`✗ Test failed: ${error instanceof Error ? error.message : String(error)}`, "red");
    return false;
  }
}

async function testQueryVision() {
  log("\n=== Test 2: query_vision Tool ===", "cyan");
  
  try {
    const response = await fetch(`${API_BASE}/api/agent`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "Tell me what you see in the room. Use query_vision to analyze.",
        conversationHistory: [],
      }),
    });
    
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`HTTP ${response.status}: ${error}`);
    }
    
    const data = await parseSSEResponse(response);
    log(`✓ Agent responded`, "green");
    log(`  Response: ${data.response?.substring(0, 200) || "No response"}...`, "blue");
    
    if (data.toolResults && data.toolResults.length > 0) {
      log(`  Tools used: ${data.toolResults.map((tr: any) => tr.tool || tr.name || "unknown").join(", ")}`, "blue");
      
      const queryTool = data.toolResults.find((tr: any) => 
        (tr.tool === "query_vision") || (tr.name === "query_vision")
      );
      if (queryTool) {
        log(`  ✓ query_vision was called`, "green");
        const result = queryTool.result || queryTool;
        if (result.count !== undefined) {
          log(`  Detections analyzed: ${result.count || 0}`, "blue");
          if (result.answer) {
            log(`  Answer preview: ${result.answer.substring(0, 150)}...`, "blue");
          }
        }
      } else {
        log(`  ⚠ query_vision was not called`, "yellow");
      }
    } else {
      log(`  ⚠ No tools were called`, "yellow");
    }
    
    return true;
  } catch (error) {
    log(`✗ Test failed: ${error instanceof Error ? error.message : String(error)}`, "red");
    return false;
  }
}

async function testSpecificObjectQuery() {
  log("\n=== Test 3: Specific Object Query ===", "cyan");
  
  try {
    const response = await fetch(`${API_BASE}/api/agent`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "Is there a chair visible? Tell me more about it if you see one.",
        conversationHistory: [],
      }),
    });
    
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`HTTP ${response.status}: ${error}`);
    }
    
    const data = await parseSSEResponse(response);
    log(`✓ Agent responded`, "green");
    log(`  Response: ${data.response?.substring(0, 200) || "No response"}...`, "blue");
    
    if (data.toolResults && data.toolResults.length > 0) {
      log(`  Tools used: ${data.toolResults.map((tr: any) => tr.tool || tr.name || "unknown").join(", ")}`, "blue");
    }
    
    return true;
  } catch (error) {
    log(`✗ Test failed: ${error instanceof Error ? error.message : String(error)}`, "red");
    return false;
  }
}

async function testSafetyQuery() {
  log("\n=== Test 4: Safety/Analysis Query ===", "cyan");
  
  try {
    const response = await fetch(`${API_BASE}/api/agent`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "Is there anything in this room that shouldn't be here?",
        conversationHistory: [],
      }),
    });
    
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`HTTP ${response.status}: ${error}`);
    }
    
    const data = await parseSSEResponse(response);
    log(`✓ Agent responded`, "green");
    log(`  Response: ${data.response?.substring(0, 200) || "No response"}...`, "blue");
    
    if (data.toolResults && data.toolResults.length > 0) {
      log(`  Tools used: ${data.toolResults.map((tr: any) => tr.tool || tr.name || "unknown").join(", ")}`, "blue");
    }
    
    return true;
  } catch (error) {
    log(`✗ Test failed: ${error instanceof Error ? error.message : String(error)}`, "red");
    return false;
  }
}

async function checkVisionBridge() {
  log("\n=== Pre-flight Check: Vision Bridge ===", "cyan");
  
  try {
    const response = await fetch("http://localhost:8767/api/vision/detections", {
      cache: "no-store",
      signal: AbortSignal.timeout(3000),
    });
    
    if (response.ok) {
      const data = await response.json();
      log(`✓ Vision bridge is accessible`, "green");
      log(`  Detections available: ${data.detections?.length || 0}`, "blue");
      return true;
    } else {
      log(`⚠ Vision bridge returned status ${response.status}`, "yellow");
      return false;
    }
  } catch (error) {
    log(`✗ Vision bridge not accessible: ${error instanceof Error ? error.message : String(error)}`, "red");
    log(`  Make sure the vision diagnostics bridge is running on port 8767`, "yellow");
    return false;
  }
}

async function main() {
  log("=== Vision Tools Integration Test ===", "cyan");
  log(`Testing against: ${API_BASE}`, "blue");
  
  // Pre-flight check
  const bridgeOk = await checkVisionBridge();
  if (!bridgeOk) {
    log("\n⚠ Vision bridge check failed, but continuing tests...", "yellow");
  }
  
  // Run tests
  const results = {
    test1: await testVisionDetections(),
    test2: await testQueryVision(),
    test3: await testSpecificObjectQuery(),
    test4: await testSafetyQuery(),
  };
  
  // Summary
  log("\n=== Test Summary ===", "cyan");
  const passed = Object.values(results).filter(Boolean).length;
  const total = Object.keys(results).length;
  
  log(`Passed: ${passed}/${total}`, passed === total ? "green" : "yellow");
  
  if (passed === total) {
    log("\n✓ All tests passed!", "green");
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
