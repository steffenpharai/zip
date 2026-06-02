/**
 * Test script for context filtering - relevant context should be included
 */

import { filterConversationHistory } from "../lib/orchestrators/utils/context-filter";

async function testRelevantContext() {
  console.log("Testing context filtering with relevant context...\n");

  // Simulate conversation: user asks about weather, then asks follow-up
  const conversationHistory = [
    {
      role: "user" as const,
      content: "what's the weather like?",
    },
    {
      role: "assistant" as const,
      content: "The weather is 20°F, Clear Sky in Town of Haverstraw.",
    },
  ];

  const currentQuery = "will it rain later?";
  const requestId = "test_relevant_" + Date.now();

  console.log("Conversation history:");
  conversationHistory.forEach((msg, i) => {
    console.log(`  ${i + 1}. [${msg.role}]: ${msg.content}`);
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
      console.log("  ✗ No messages included (unexpected - weather context should be relevant)");
    } else {
      filtered.forEach((msg, i) => {
        console.log(`  ${i + 1}. [${msg.role}]: ${msg.content.substring(0, 80)}...`);
      });
    }

    console.log(`\nResult: ${filtered.length} messages included out of ${conversationHistory.length} total`);
    
    if (filtered.length > 0) {
      console.log("✓ TEST PASSED: Relevant context correctly included");
      return true;
    } else {
      console.log("✗ TEST FAILED: Relevant context was filtered out");
      return false;
    }
  } catch (error) {
    console.error("✗ TEST ERROR:", error);
    return false;
  }
}

testRelevantContext()
  .then((success) => {
    process.exit(success ? 0 : 1);
  })
  .catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });

