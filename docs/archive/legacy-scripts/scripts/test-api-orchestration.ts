/**
 * Test script for OpenAI orchestration via API endpoints
 * 
 * Tests all AI capabilities through HTTP endpoints
 */

const API_BASE = "http://localhost:3000";

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

async function testAgentEndpoint() {
  log("\n=== Testing Agent Endpoint ===", "cyan");
  
  try {
    const response = await fetch(`${API_BASE}/api/agent`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "What's the weather like?",
        conversationHistory: [],
      }),
    });
    
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`HTTP ${response.status}: ${error}`);
    }
    
    const data = await response.json();
    log(`✓ Agent responded`, "green");
    log(`  Response: ${data.response?.substring(0, 100) || "No response"}...`, "blue");
    if (data.toolResults && data.toolResults.length > 0) {
      log(`  Tools used: ${data.toolResults.map((tr: any) => tr.tool).join(", ")}`, "blue");
    }
    return true;
  } catch (error) {
    log(`✗ Agent endpoint failed: ${error instanceof Error ? error.message : String(error)}`, "red");
    return false;
  }
}

async function testMemoryEndpoints() {
  log("\n=== Testing Memory Endpoints ===", "cyan");
  
  try {
    // Add memory
    const addResponse = await fetch(`${API_BASE}/api/memory/add`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        key: "test_preference",
        value: "User prefers concise responses",
        pinned: true,
      }),
    });
    
    if (!addResponse.ok) throw new Error(`Add failed: ${addResponse.status}`);
    log("✓ Memory added", "green");
    
    // Get memory
    const getResponse = await fetch(`${API_BASE}/api/memory/get?key=test_preference`);
    if (!getResponse.ok) throw new Error(`Get failed: ${getResponse.status}`);
    const memory = await getResponse.json();
    log(`✓ Memory retrieved: ${memory.key}`, "green");
    
    // Get all memory
    const getAllResponse = await fetch(`${API_BASE}/api/memory/get`);
    if (!getAllResponse.ok) throw new Error(`Get all failed: ${getAllResponse.status}`);
    const allMemory = await getAllResponse.json();
    log(`✓ Retrieved ${allMemory.memories?.length || 0} memory entries`, "green");
    
    // Delete memory
    const deleteResponse = await fetch(`${API_BASE}/api/memory/delete?key=test_preference`, {
      method: "DELETE",
    });
    if (!deleteResponse.ok) throw new Error(`Delete failed: ${deleteResponse.status}`);
    log("✓ Memory deleted", "green");
    
    return true;
  } catch (error) {
    log(`✗ Memory endpoints failed: ${error instanceof Error ? error.message : String(error)}`, "red");
    return false;
  }
}

async function testNotesEndpoints() {
  log("\n=== Testing Notes Endpoints ===", "cyan");
  
  try {
    // Create note
    const createResponse = await fetch(`${API_BASE}/api/notes/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Test Note",
        body: "This is a test note for orchestration testing",
      }),
    });
    
    if (!createResponse.ok) throw new Error(`Create failed: ${createResponse.status}`);
    const created = await createResponse.json();
    log(`✓ Note created: ID ${created.id}`, "green");
    const noteId = created.id;
    
    // List notes
    const listResponse = await fetch(`${API_BASE}/api/notes/list`);
    if (!listResponse.ok) throw new Error(`List failed: ${listResponse.status}`);
    const list = await listResponse.json();
    log(`✓ Listed ${list.notes?.length || 0} notes`, "green");
    
    // Search notes
    const searchResponse = await fetch(`${API_BASE}/api/notes/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: "test" }),
    });
    if (!searchResponse.ok) throw new Error(`Search failed: ${searchResponse.status}`);
    const search = await searchResponse.json();
    log(`✓ Found ${search.notes?.length || 0} matching notes`, "green");
    
    // Delete note
    const deleteResponse = await fetch(`${API_BASE}/api/notes/delete?id=${noteId}`, {
      method: "DELETE",
    });
    if (!deleteResponse.ok) throw new Error(`Delete failed: ${deleteResponse.status}`);
    log("✓ Note deleted", "green");
    
    return true;
  } catch (error) {
    log(`✗ Notes endpoints failed: ${error instanceof Error ? error.message : String(error)}`, "red");
    return false;
  }
}

async function testTimersEndpoints() {
  log("\n=== Testing Timers Endpoints ===", "cyan");
  
  try {
    // Create timer
    const createResponse = await fetch(`${API_BASE}/api/timers/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        seconds: 10,
        message: "Test timer",
      }),
    });
    
    if (!createResponse.ok) throw new Error(`Create failed: ${createResponse.status}`);
    const created = await createResponse.json();
    log(`✓ Timer created: ID ${created.id}`, "green");
    const timerId = created.id;
    
    // Cancel timer
    const cancelResponse = await fetch(`${API_BASE}/api/timers/cancel?id=${timerId}`, {
      method: "DELETE",
    });
    if (!cancelResponse.ok) throw new Error(`Cancel failed: ${cancelResponse.status}`);
    log("✓ Timer cancelled", "green");
    
    return true;
  } catch (error) {
    log(`✗ Timers endpoints failed: ${error instanceof Error ? error.message : String(error)}`, "red");
    return false;
  }
}

async function testWebSearchEndpoint() {
  log("\n=== Testing Web Search Endpoint ===", "cyan");
  
  try {
    const response = await fetch(`${API_BASE}/api/tools/web_search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: "TypeScript",
        maxResults: 3,
      }),
    });
    
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`HTTP ${response.status}: ${error}`);
    }
    
    const data = await response.json();
    log(`✓ Web search completed`, "green");
    log(`  Found ${data.results?.length || 0} results`, "blue");
    if (data.results && data.results.length > 0) {
      log(`  First result: ${data.results[0].title}`, "blue");
    }
    return true;
  } catch (error) {
    log(`✗ Web search failed: ${error instanceof Error ? error.message : String(error)}`, "red");
    return false;
  }
}

async function testMultiStepAgent() {
  log("\n=== Testing Multi-Step Agent ===", "cyan");
  
  try {
    const response = await fetch(`${API_BASE}/api/agent`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "Get the weather and system stats, then create a note about it",
        conversationHistory: [],
      }),
    });
    
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`HTTP ${response.status}: ${error}`);
    }
    
    const data = await response.json();
    log(`✓ Multi-step completed`, "green");
    if (data.toolResults && data.toolResults.length > 0) {
      log(`  Tools called: ${data.toolResults.map((tr: any) => tr.tool).join(", ")}`, "blue");
    }
    log(`  Response: ${data.response?.substring(0, 150) || "No response"}...`, "blue");
    return true;
  } catch (error) {
    log(`✗ Multi-step agent failed: ${error instanceof Error ? error.message : String(error)}`, "red");
    return false;
  }
}

async function testMemoryCommands() {
  log("\n=== Testing Memory Commands in Agent ===", "cyan");
  
  try {
    // Test remember command
    const rememberResponse = await fetch(`${API_BASE}/api/agent`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "remember that I prefer dark mode",
        conversationHistory: [],
      }),
    });
    
    if (!rememberResponse.ok) throw new Error(`Remember failed: ${rememberResponse.status}`);
    const rememberData = await rememberResponse.json();
    log(`✓ Remember command: ${rememberData.response?.substring(0, 100)}`, "green");
    
    // Test list memory command
    const listResponse = await fetch(`${API_BASE}/api/agent`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "what do you remember?",
        conversationHistory: [],
      }),
    });
    
    if (!listResponse.ok) throw new Error(`List memory failed: ${listResponse.status}`);
    const listData = await listResponse.json();
    log(`✓ List memory: ${listData.response?.substring(0, 100)}`, "green");
    
    return true;
  } catch (error) {
    log(`✗ Memory commands failed: ${error instanceof Error ? error.message : String(error)}`, "red");
    return false;
  }
}

async function testResearchOrchestration() {
  log("\n=== Testing Research Orchestration ===", "cyan");
  
  try {
    const response = await fetch(`${API_BASE}/api/agent`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "What's the latest news about artificial intelligence?",
        conversationHistory: [],
      }),
    });
    
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`HTTP ${response.status}: ${error}`);
    }
    
    const data = await response.json();
    log(`✓ Research orchestration completed`, "green");
    if (data.toolResults && data.toolResults.length > 0) {
      log(`  Tools used: ${data.toolResults.map((tr: any) => tr.tool).join(", ")}`, "blue");
    }
    log(`  Response length: ${data.response?.length || 0} chars`, "blue");
    return true;
  } catch (error) {
    log(`✗ Research orchestration failed: ${error instanceof Error ? error.message : String(error)}`, "red");
    return false;
  }
}

async function runAllTests() {
  log("\n" + "=".repeat(60), "cyan");
  log("OpenAI Orchestration API Test Suite", "cyan");
  log("=".repeat(60), "cyan");
  log(`Testing against: ${API_BASE}`, "blue");
  
  // Wait for server to be ready
  log("\nWaiting for server to be ready...", "yellow");
  let serverReady = false;
  for (let i = 0; i < 10; i++) {
    try {
      const response = await fetch(`${API_BASE}/api/realtime/token`);
      if (response.ok) {
        serverReady = true;
        break;
      }
    } catch (error) {
      // Server not ready yet
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  if (!serverReady) {
    log("✗ Server not ready. Make sure 'npm run dev' is running.", "red");
    process.exit(1);
  }
  
  log("✓ Server is ready\n", "green");
  
  const results: Array<{ name: string; passed: boolean }> = [];
  
  // Run tests
  results.push({ name: "Agent Endpoint", passed: await testAgentEndpoint() });
  results.push({ name: "Memory Endpoints", passed: await testMemoryEndpoints() });
  results.push({ name: "Notes Endpoints", passed: await testNotesEndpoints() });
  results.push({ name: "Timers Endpoints", passed: await testTimersEndpoints() });
  results.push({ name: "Web Search Endpoint", passed: await testWebSearchEndpoint() });
  results.push({ name: "Multi-Step Agent", passed: await testMultiStepAgent() });
  results.push({ name: "Memory Commands", passed: await testMemoryCommands() });
  results.push({ name: "Research Orchestration", passed: await testResearchOrchestration() });
  
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

