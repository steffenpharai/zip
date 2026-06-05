#!/usr/bin/env tsx
/**
 * Integration test script for local development
 * Tests WebSocket connection and command flow between ZIP app and robot bridge
 */

import WebSocket from "ws";

const ROBOT_BRIDGE_WS_URL =
  process.env.ROBOT_BRIDGE_WS_URL || "ws://localhost:8765/robot";
const ROBOT_BRIDGE_HTTP_URL =
  process.env.ROBOT_BRIDGE_HTTP_URL || "http://localhost:8766";

interface TestResult {
  name: string;
  status: "pass" | "fail" | "skip";
  message?: string;
  duration?: number;
}

const results: TestResult[] = [];

function recordTest(
  name: string,
  status: "pass" | "fail" | "skip",
  message?: string,
  duration?: number
) {
  results.push({ name, status, message, duration });
  const icon =
    status === "pass" ? "✅" : status === "fail" ? "❌" : "⏭️";
  console.log(`${icon} ${name}${message ? `: ${message}` : ""}`);
  if (duration !== undefined) {
    console.log(`   Duration: ${duration}ms`);
  }
}

async function testHealthEndpoint(): Promise<boolean> {
  const startTime = Date.now();
  try {
    const response = await fetch(`${ROBOT_BRIDGE_HTTP_URL}/health`, {
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      recordTest(
        "Health Endpoint",
        "fail",
        `HTTP ${response.status}`,
        Date.now() - startTime
      );
      return false;
    }

    const data = await response.json();
    if (data.status === "ok") {
      recordTest(
        "Health Endpoint",
        "pass",
        `Status: ${data.status}`,
        Date.now() - startTime
      );
      return true;
    } else {
      recordTest(
        "Health Endpoint",
        "fail",
        `Unexpected status: ${data.status}`,
        Date.now() - startTime
      );
      return false;
    }
  } catch (error) {
    recordTest(
      "Health Endpoint",
      "fail",
      error instanceof Error ? error.message : String(error),
      Date.now() - startTime
    );
    return false;
  }
}

async function testWebSocketConnection(): Promise<WebSocket | null> {
  const startTime = Date.now();
  return new Promise((resolve) => {
    try {
      const ws = new WebSocket(ROBOT_BRIDGE_WS_URL);

      const timeout = setTimeout(() => {
        ws.close();
        recordTest(
          "WebSocket Connection",
          "fail",
          "Connection timeout",
          Date.now() - startTime
        );
        resolve(null);
      }, 5000);

      ws.on("open", () => {
        clearTimeout(timeout);
        recordTest(
          "WebSocket Connection",
          "pass",
          "Connected successfully",
          Date.now() - startTime
        );
        resolve(ws);
      });

      ws.on("error", (error) => {
        clearTimeout(timeout);
        recordTest(
          "WebSocket Connection",
          "fail",
          error.message,
          Date.now() - startTime
        );
        resolve(null);
      });
    } catch (error) {
      recordTest(
        "WebSocket Connection",
        "fail",
        error instanceof Error ? error.message : String(error),
        Date.now() - startTime
      );
      resolve(null);
    }
  });
}

async function testCommandFlow(ws: WebSocket): Promise<boolean> {
  const startTime = Date.now();
  return new Promise((resolve) => {
    let ackReceived = false;
    const timeout = setTimeout(() => {
      if (!ackReceived) {
        recordTest(
          "Command Flow",
          "fail",
          "ACK timeout (5s)",
          Date.now() - startTime
        );
        resolve(false);
      }
    }, 5000);

    // Listen for ACK
    const ackHandler = (data: WebSocket.Data) => {
      try {
        const message = JSON.parse(data.toString());
        if (message.type === "ack") {
          ackReceived = true;
          clearTimeout(timeout);
          ws.removeListener("message", ackHandler);
          recordTest(
            "Command Flow",
            "pass",
            `ACK received (seq: ${message.seq}, ok: ${message.ok})`,
            Date.now() - startTime
          );
          resolve(true);
        }
      } catch (error) {
        // Not an ACK, continue listening
      }
    };

    ws.on("message", ackHandler);

    // Send a simple command (HELLO to get robot info)
    const command = {
      type: "command",
      cmd: "HELLO",
      payload: {},
      seq: 1,
    };

    try {
      ws.send(JSON.stringify(command));
    } catch (error) {
      clearTimeout(timeout);
      ws.removeListener("message", ackHandler);
      recordTest(
        "Command Flow",
        "fail",
        `Failed to send command: ${error instanceof Error ? error.message : String(error)}`,
        Date.now() - startTime
      );
      resolve(false);
    }
  });
}

async function testTelemetryFlow(ws: WebSocket): Promise<boolean> {
  const startTime = Date.now();
  return new Promise((resolve) => {
    let telemetryReceived = false;
    const timeout = setTimeout(() => {
      if (!telemetryReceived) {
        recordTest(
          "Telemetry Flow",
          "skip",
          "No telemetry received (may be normal if robot not connected)",
          Date.now() - startTime
        );
        resolve(true); // Not a failure, just skip
      }
    }, 10000); // Give more time for telemetry

    const telemetryHandler = (data: WebSocket.Data) => {
      try {
        const message = JSON.parse(data.toString());
        if (message.type === "telemetry") {
          telemetryReceived = true;
          clearTimeout(timeout);
          ws.removeListener("message", telemetryHandler);
          recordTest(
            "Telemetry Flow",
            "pass",
            "Telemetry received",
            Date.now() - startTime
          );
          resolve(true);
        }
      } catch (error) {
        // Not telemetry, continue listening
      }
    };

    ws.on("message", telemetryHandler);
  });
}

async function testInfoMessage(ws: WebSocket): Promise<boolean> {
  const startTime = Date.now();
  return new Promise((resolve) => {
    let infoReceived = false;
    const timeout = setTimeout(() => {
      if (!infoReceived) {
        recordTest(
          "Info Message",
          "skip",
          "No info message received (may be normal if robot not connected)",
          Date.now() - startTime
        );
        resolve(true); // Not a failure, just skip
      }
    }, 5000);

    const infoHandler = (data: WebSocket.Data) => {
      try {
        const message = JSON.parse(data.toString());
        if (message.type === "info") {
          infoReceived = true;
          clearTimeout(timeout);
          ws.removeListener("message", infoHandler);
          recordTest(
            "Info Message",
            "pass",
            `Robot info received: ${JSON.stringify(message.data)}`,
            Date.now() - startTime
          );
          resolve(true);
        }
      } catch (error) {
        // Not info, continue listening
      }
    };

    ws.on("message", infoHandler);
  });
}

async function main() {
  console.log("🔗 Integration Tests for Local Services\n");
  console.log(`Robot Bridge WebSocket: ${ROBOT_BRIDGE_WS_URL}`);
  console.log(`Robot Bridge HTTP: ${ROBOT_BRIDGE_HTTP_URL}\n`);

  // Test 1: Health endpoint
  const healthOk = await testHealthEndpoint();
  if (!healthOk) {
    console.log("\n❌ Health check failed. Cannot proceed with WebSocket tests.");
    process.exit(1);
  }

  console.log();

  // Test 2: WebSocket connection
  const ws = await testWebSocketConnection();
  if (!ws) {
    console.log("\n❌ WebSocket connection failed. Cannot proceed with command tests.");
    process.exit(1);
  }

  console.log();

  // Test 3: Command flow
  await testCommandFlow(ws);
  console.log();

  // Test 4: Info message (may be skipped if robot not connected)
  await testInfoMessage(ws);
  console.log();

  // Test 5: Telemetry flow (may be skipped if robot not connected)
  await testTelemetryFlow(ws);
  console.log();

  // Close WebSocket
  ws.close();

  // Summary
  const passed = results.filter((r) => r.status === "pass").length;
  const failed = results.filter((r) => r.status === "fail").length;
  const skipped = results.filter((r) => r.status === "skip").length;

  console.log("📈 Summary:");
  console.log(`   Passed: ${passed}/${results.length}`);
  console.log(`   Failed: ${failed}/${results.length}`);
  console.log(`   Skipped: ${skipped}/${results.length}`);

  if (failed > 0) {
    console.log("\n❌ Some integration tests failed!");
    process.exit(1);
  } else {
    console.log("\n✅ All integration tests passed!");
    process.exit(0);
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});

