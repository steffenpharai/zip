/**
 * Test script for streaming functionality with a simple query
 * Tests text streaming from direct tool calling
 */

const API_URL = process.env.API_URL || "http://localhost:3000";

async function testStreaming() {
  console.log("Testing streaming with simple query...\n");

  try {
    const response = await fetch(`${API_URL}/api/agent`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: "Tell me a short story about a robot",
        conversationHistory: [],
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    console.log("✓ Connected to streaming endpoint\n");
    console.log("--- Streaming Response ---\n");

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error("No response body reader");
    }

    const decoder = new TextDecoder();
    let buffer = "";
    let textContent = "";
    let activityCount = 0;
    let textDeltaCount = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.trim()) continue;

        const [eventLine, dataLine] = line.split("\n");
        if (!eventLine.startsWith("event:") || !dataLine.startsWith("data:")) {
          continue;
        }

        const eventType = eventLine.substring(7).trim();
        const dataStr = dataLine.substring(6).trim();

        try {
          const data = JSON.parse(dataStr);

          if (eventType === "text") {
            textContent += data.delta;
            textDeltaCount++;
            process.stdout.write(data.delta);
          } else if (eventType === "activity") {
            activityCount++;
            const activityInfo = [
              data.action,
              data.node ? `node:${data.node}` : "",
              data.tool ? `tool:${data.tool}` : "",
              data.llmModel ? `llm:${data.llmModel.split("-")[0]}` : "",
            ]
              .filter(Boolean)
              .join(" | ");
            console.log(`\n[Activity] ${activityInfo}`);
          } else if (eventType === "done") {
            console.log("\n\n--- Stream Complete ---");
            console.log(`Text deltas received: ${textDeltaCount}`);
            console.log(`Activity events: ${activityCount}`);
            console.log(`Total text length: ${textContent.length} characters`);
          } else if (eventType === "error") {
            console.error(`\n[Error] ${data.message}`);
          }
        } catch (parseError) {
          // Ignore parse errors for now
        }
      }
    }

    console.log("\n✓ Streaming test completed successfully");
    return textContent.length > 0;
  } catch (error) {
    console.error("✗ Streaming test failed:", error);
    throw error;
  }
}

// Run test
testStreaming()
  .then((hasText) => {
    if (hasText) {
      console.log("\n✓ Text streaming verified");
      process.exit(0);
    } else {
      console.log("\n⚠ No text was streamed");
      process.exit(1);
    }
  })
  .catch((error) => {
    console.error("Test failed:", error);
    process.exit(1);
  });

