#!/usr/bin/env tsx
/**
 * Test script to verify system stats integration with agent
 * Tests that tool results from agent calls properly update the frontend
 */

const colors = {
  reset: "\x1b[0m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
};

function log(message: string, color: keyof typeof colors = "reset") {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

async function parseSSEResponse(response: Response): Promise<{
  response?: string;
  toolResults?: Array<{ tool: string; result: unknown }>;
  hasText?: boolean;
}> {
  const reader = response.body?.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finalResponse = "";
  let toolResults: Array<{ tool: string; result: unknown }> = [];
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
            } else if (eventType === "toolResults") {
              // toolResults should be an array
              if (Array.isArray(data)) {
                toolResults = data;
                log(`  ✓ Received toolResults event with ${data.length} results`, "green");
                for (const result of data) {
                  log(`    - Tool: ${result.tool}`, "cyan");
                }
              } else {
                log(`  ⚠️ toolResults is not an array: ${typeof data}`, "yellow");
                console.log("    Data:", JSON.stringify(data, null, 2));
              }
            }
          } catch (e) {
            log(`  ❌ Error parsing SSE data: ${e}`, "red");
          }
        }
      }
    }
  }

  return { response: finalResponse, toolResults, hasText };
}

async function testSystemStatsViaAgent() {
  log("\n=== Test: System Stats via Agent ===", "cyan");
  log("Testing that agent calls get_system_stats and returns tool results\n", "reset");

  const baseUrl = process.env.BASE_URL || "http://localhost:3000";
  const url = `${baseUrl}/api/agent`;

  try {
    log(`Sending request to: ${url}`, "blue");
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: "What's my CPU usage?",
        conversationHistory: [],
        contextData: {},
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    log("✓ Response received, parsing SSE stream...", "green");

    const { response: agentResponse, toolResults } = await parseSSEResponse(response);

    log("\n--- Results ---", "cyan");
    log(`Agent Response: ${agentResponse?.substring(0, 200)}${agentResponse && agentResponse.length > 200 ? "..." : ""}`, "reset");

    if (toolResults && toolResults.length > 0) {
      log(`\n✓ Tool Results Found: ${toolResults.length}`, "green");
      for (const toolResult of toolResults) {
        log(`\nTool: ${toolResult.tool}`, "cyan");
        if (toolResult.tool === "get_system_stats") {
          const stats = toolResult.result as {
            cpuPercent?: number;
            ramUsedGb?: number;
            ramTotalGb?: number;
            diskUsedGb?: number;
            diskTotalGb?: number;
            cpuLabel?: string;
            memLabel?: string;
            diskLabel?: string;
          };
          log(`  CPU: ${stats.cpuPercent}% (${stats.cpuLabel})`, "green");
          log(`  RAM: ${stats.ramUsedGb}/${stats.ramTotalGb} GB (${stats.memLabel})`, "green");
          log(`  Disk: ${stats.diskUsedGb}/${stats.diskTotalGb} GB (${stats.diskLabel})`, "green");
          
          // Verify data structure matches what frontend expects
          const expectedFields = ["cpuPercent", "ramUsedGb", "ramTotalGb", "diskUsedGb", "diskTotalGb", "cpuLabel", "memLabel", "diskLabel"];
          const missingFields = expectedFields.filter(field => !(field in stats));
          if (missingFields.length > 0) {
            log(`  ⚠️ Missing fields: ${missingFields.join(", ")}`, "yellow");
          } else {
            log(`  ✓ All required fields present`, "green");
          }
        } else if (toolResult.tool === "get_uptime") {
          const uptime = toolResult.result as {
            runningSeconds?: number;
            loadPercent?: number;
            loadLabel?: string;
          };
          log(`  Uptime: ${uptime.runningSeconds}s`, "green");
          log(`  Load: ${uptime.loadPercent}% (${uptime.loadLabel})`, "green");
        }
      }
    } else {
      log("\n❌ No tool results found in response!", "red");
      log("This means the frontend won't receive panel updates.", "red");
      return false;
    }

    return true;
  } catch (error) {
    log(`\n❌ Test failed: ${error}`, "red");
    if (error instanceof Error) {
      log(`   ${error.message}`, "red");
      log(`   ${error.stack}`, "red");
    }
    return false;
  }
}

async function testDirectAPI() {
  log("\n=== Test: Direct API Call ===", "cyan");
  log("Testing direct API call to get_system_stats\n", "reset");

  const baseUrl = process.env.BASE_URL || "http://localhost:3000";
  const url = `${baseUrl}/api/tools/get_system_stats`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    log("✓ Direct API response:", "green");
    log(`  CPU: ${data.result.cpuPercent}%`, "green");
    log(`  RAM: ${data.result.ramUsedGb}/${data.result.ramTotalGb} GB`, "green");
    log(`  Disk: ${data.result.diskUsedGb}/${data.result.diskTotalGb} GB`, "green");

    return data.result;
  } catch (error) {
    log(`❌ Direct API test failed: ${error}`, "red");
    return null;
  }
}

async function main() {
  log("=".repeat(60), "cyan");
  log("System Stats Integration Test", "cyan");
  log("=".repeat(60), "cyan");

  // Test 1: Direct API
  const directResult = await testDirectAPI();

  // Test 2: Via Agent
  const agentResult = await testSystemStatsViaAgent();

  // Compare results
  if (directResult && agentResult) {
    log("\n=== Comparison ===", "cyan");
    log("If values differ significantly, there may be a timing issue.", "yellow");
    log("The agent should return the same data structure as the direct API.", "yellow");
  }

  log("\n" + "=".repeat(60), "cyan");
  if (agentResult) {
    log("✓ Integration test PASSED", "green");
    log("Tool results are being returned from agent and should update frontend.", "green");
  } else {
    log("❌ Integration test FAILED", "red");
    log("Tool results are NOT being returned from agent.", "red");
    log("Frontend will not receive panel updates from agent tool calls.", "red");
  }
  log("=".repeat(60), "cyan");
}

main().catch(console.error);
