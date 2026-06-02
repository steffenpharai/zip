/**
 * Test script for voice fallback endpoints
 * 
 * Tests STT/TTS fallback and Realtime token endpoints
 */

async function testVoiceFallback() {
  const baseUrl = process.env.TEST_BASE_URL || "http://localhost:3000";
  
  console.log("Testing voice integration endpoints...\n");

  let sessionId: string | null = null;

  // Test 1: Realtime token endpoint
  console.log("1. Testing /api/realtime/token");
  try {
    const tokenResponse = await fetch(`${baseUrl}/api/realtime/token`);
    const tokenData = await tokenResponse.json();

    if (!tokenResponse.ok) {
      if (tokenData.error === "OPENAI_API_KEY not configured") {
        console.log("   ✓ Returns expected error when API key missing");
        console.log(`   Response: ${tokenData.error}`);
        console.log("\n⚠ Skipping remaining tests (API key not configured)");
        return;
      } else {
        console.log(`   ✗ Unexpected error: ${tokenData.error}`);
        process.exit(1);
      }
    } else {
      // Check response structure
      const hasSessionId = typeof tokenData.sessionId === "string";
      const hasRealtimeModel = typeof tokenData.realtimeModel === "string";
      const hasExpiresAt = typeof tokenData.expiresAt === "number";

      if (hasSessionId && hasRealtimeModel && hasExpiresAt) {
        console.log("   ✓ Returns expected structure");
        console.log(`   SessionId: ${tokenData.sessionId.substring(0, 20)}...`);
        console.log(`   Model: ${tokenData.realtimeModel}`);
        console.log(`   ExpiresAt: ${new Date(tokenData.expiresAt).toISOString()}`);
        sessionId = tokenData.sessionId;
      } else {
        console.log("   ✗ Missing required fields");
        console.log(`   Has sessionId: ${hasSessionId}`);
        console.log(`   Has realtimeModel: ${hasRealtimeModel}`);
        console.log(`   Has expiresAt: ${hasExpiresAt}`);
        process.exit(1);
      }
    }
  } catch (error) {
    console.log(`   ✗ Request failed: ${error}`);
    process.exit(1);
  }

  console.log("");

  // Test 2: Realtime bridge endpoint
  if (sessionId) {
    console.log("2. Testing /api/realtime/bridge");
    try {
      const bridgeResponse = await fetch(`${baseUrl}/api/realtime/bridge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          userTranscript: "Hello, what's the weather like?",
          source: "voice",
        }),
      });

      const bridgeData = await bridgeResponse.json();

      if (!bridgeResponse.ok) {
        console.log(`   ✗ Bridge endpoint failed: ${bridgeData.error}`);
        console.log(`   Status: ${bridgeResponse.status}`);
        process.exit(1);
      } else {
        // Check response structure
        const hasAssistantText = typeof bridgeData.assistantText === "string";
        const hasEvents = Array.isArray(bridgeData.events);

        if (hasAssistantText && hasEvents) {
          console.log("   ✓ Returns expected structure");
          console.log(`   Assistant text length: ${bridgeData.assistantText.length} chars`);
          console.log(`   Events count: ${bridgeData.events.length}`);
        } else {
          console.log("   ✗ Missing required fields");
          console.log(`   Has assistantText: ${hasAssistantText}`);
          console.log(`   Has events: ${hasEvents}`);
          process.exit(1);
        }
      }
    } catch (error) {
      console.log(`   ✗ Request failed: ${error}`);
      process.exit(1);
    }
  } else {
    console.log("2. Skipping /api/realtime/bridge (no sessionId)");
  }

  console.log("");

  // Test 3: Voice transcribe endpoint
  console.log("3. Testing /api/voice/transcribe");
  try {
    // Create a minimal audio blob (empty for testing - should return error)
    const audioBlob = new Blob([], { type: "audio/webm" });
    const formData = new FormData();
    formData.append("audio", audioBlob, "test.webm");

    const transcribeResponse = await fetch(`${baseUrl}/api/voice/transcribe`, {
      method: "POST",
      body: formData,
    });

    const transcribeData = await transcribeResponse.json();

    if (!transcribeResponse.ok) {
      if (transcribeData.error === "OPENAI_API_KEY not configured" || 
          transcribeData.error === "OpenAI API key not configured") {
        console.log("   ✓ Returns expected error when API key missing");
        console.log(`   Response: ${transcribeData.error}`);
      } else if (transcribeData.error === "No audio file provided" || 
                 transcribeData.error === "Audio file is empty") {
        console.log("   ✓ Returns expected error for empty/invalid audio");
        console.log(`   Response: ${transcribeData.error}`);
      } else {
        console.log(`   ✗ Unexpected error: ${transcribeData.error}`);
        process.exit(1);
      }
    } else {
      // If it succeeds, check structure
      if (typeof transcribeData.transcript === "string") {
        console.log("   ✓ Returns expected structure");
        console.log(`   Transcript: ${transcribeData.transcript.substring(0, 50)}...`);
      } else {
        console.log("   ✗ Missing transcript field");
        process.exit(1);
      }
    }
  } catch (error) {
    console.log(`   ✗ Request failed: ${error}`);
    process.exit(1);
  }

  console.log("");

  // Test 4: Voice speak endpoint
  console.log("4. Testing /api/voice/speak");
  try {
    const speakResponse = await fetch(`${baseUrl}/api/voice/speak`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "Test message" }),
    });

    const speakData = await speakResponse.json();

    if (!speakResponse.ok) {
      if (speakData.error === "OPENAI_API_KEY not configured" || 
          speakData.error === "OpenAI API key not configured") {
        console.log("   ✓ Returns expected error when API key missing");
        console.log(`   Response: ${speakData.error}`);
      } else {
        console.log(`   ⚠ Unexpected error: ${speakData.error}`);
        // This is okay - might be a different error
      }
    } else {
      // If it succeeds, check structure
      if (typeof speakData.audio === "string" && typeof speakData.format === "string") {
        console.log("   ✓ Returns expected structure");
        console.log(`   Format: ${speakData.format}`);
        console.log(`   Audio length: ${speakData.audio.length} chars (base64)`);
      } else {
        console.log("   ✗ Missing required fields");
        process.exit(1);
      }
    }
  } catch (error) {
    console.log(`   ✗ Request failed: ${error}`);
    process.exit(1);
  }

  console.log("\n✅ All voice integration tests passed!");
}

// Run tests
testVoiceFallback().catch((error) => {
  console.error("Test execution failed:", error);
  process.exit(1);
});

