/**
 * Test script for streaming functionality
 * Tests the SSE streaming endpoint and activity tracking
 */

const API_URL = process.env.API_URL || "http://localhost:3000";

async function testStreaming() {
  console.log("Testing streaming endpoint...\n");

  try {
    const response = await fetch(`${API_URL}/api/agent`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: "What is the weather like today?",
        conversationHistory: [],
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    console.log("✓ Connected to streaming endpoint");
    console.log("Response headers:", Object.fromEntries(response.headers.entries()));
    console.log("\n--- Streaming Response ---\n");

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error("No response body reader");
    }

    const decoder = new TextDecoder();
    let buffer = "";
    let textContent = "";
    let activityCount = 0;
    let eventCount = 0;

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
          eventCount++;

          if (eventType === "text") {
            textContent += data.delta;
            process.stdout.write(data.delta);
          } else if (eventType === "activity") {
            activityCount++;
            console.log(`\n[Activity ${activityCount}] ${data.action}${data.node ? ` - ${data.node}` : ""}${data.tool ? ` - ${data.tool}` : ""}`);
          } else if (eventType === "confirmation") {
            console.log(`\n[Confirmation] ${data.message}`);
          } else if (eventType === "toolResults") {
            console.log(`\n[Tool Results] ${data.length} tool(s) executed`);
          } else if (eventType === "done") {
            console.log("\n\n--- Stream Complete ---");
            console.log(`Total events: ${eventCount}`);
            console.log(`Activity events: ${activityCount}`);
            console.log(`Text length: ${textContent.length} characters`);
          } else if (eventType === "error") {
            console.error(`\n[Error] ${data.message}`);
          }
        } catch (parseError) {
          console.error("Error parsing SSE data:", parseError);
        }
      }
    }

    console.log("\n✓ Streaming test completed successfully");
  } catch (error) {
    console.error("✗ Streaming test failed:", error);
    process.exit(1);
  }
}

// Run test
testStreaming();

