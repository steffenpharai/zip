/**
 * Test script for context filtering
 * 
 * Tests that irrelevant conversation history is filtered out
 */

import { filterConversationHistory } from "../lib/orchestrators/utils/context-filter";

async function testContextFilter() {
  console.log("Testing context filtering...\n");

  // Simulate conversation: user asks about computer, then weather
  const conversationHistory = [
    {
      role: "user" as const,
      content: "what's my computer performance?",
    },
    {
      role: "assistant" as const,
      content: "Here's the current performance status of your computer:\n- CPU Usage: 10%\n- RAM Usage: 6.8 GB out of 16.0 GB (43%)\n- Disk Usage: 264.0 GB out of 512.0 GB (52%)",
    },
  ];

  const currentQuery = "and the weather?";
  const requestId = "test_" + Date.now();

  console.log("Conversation history:");
  conversationHistory.forEach((msg, i) => {
    console.log(`  ${i + 1}. [${msg.role}]: ${msg.content.substring(0, 60)}...`);
  });
  console.log(`\nCurrent query: "${currentQuery}"`);
  console.log("\nFiltering conversation history...\n");

  try {
    const filtered = await filterConversationHistory(
      currentQuery,
      conversationHistory,
      requestId
    );

    console.log("Filtered conversation history:");
    if (filtered.length === 0) {
      console.log("  ✓ No messages included (correct - computer performance is not relevant to weather)");
    } else {
      filtered.forEach((msg, i) => {
        console.log(`  ${i + 1}. [${msg.role}]: ${msg.content.substring(0, 60)}...`);
      });
    }

    console.log(`\nResult: ${filtered.length} messages included out of ${conversationHistory.length} total`);
    
    if (filtered.length === 0) {
      console.log("✓ TEST PASSED: Irrelevant context correctly filtered out");
      return true;
    } else {
      console.log("✗ TEST FAILED: Irrelevant context was not filtered out");
      return false;
    }
  } catch (error) {
    console.error("✗ TEST ERROR:", error);
    if (error instanceof Error) {
      console.error("Error message:", error.message);
      if (error.message.includes("PermissionDenied") || error.message.includes("403")) {
        console.error("\n⚠ Embedding model access issue. Check:");
        console.error("  1. OPENAI_EMBEDDING_MODEL is set correctly in .env");
        console.error("  2. Your OpenAI API key has access to the embedding model");
        console.error("  3. The model name is correct (e.g., text-embedding-3-small)");
      }
    }
    return false;
  }
}

// Run test
testContextFilter()
  .then((success) => {
    process.exit(success ? 0 : 1);
  })
  .catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });

