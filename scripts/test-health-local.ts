#!/usr/bin/env tsx
/**
 * Health check script for local development
 * Tests health endpoints of both ZIP app and robot bridge services
 */

const ZIP_APP_URL = process.env.ZIP_APP_URL || "http://localhost:3000";
const ROBOT_BRIDGE_URL = process.env.ROBOT_BRIDGE_URL || "http://localhost:8766";

interface HealthCheckResult {
  service: string;
  url: string;
  status: "pass" | "fail";
  response?: any;
  error?: string;
  responseTime?: number;
}

async function checkHealth(
  service: string,
  url: string
): Promise<HealthCheckResult> {
  const startTime = Date.now();
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(5000), // 5 second timeout
    });

    const responseTime = Date.now() - startTime;

    if (!response.ok) {
      return {
        service,
        url,
        status: "fail",
        error: `HTTP ${response.status}: ${response.statusText}`,
        responseTime,
      };
    }

    const data = await response.json();

    // Validate health response structure
    if (service === "zip-app") {
      if (!data.status || !data.timestamp) {
        return {
          service,
          url,
          status: "fail",
          error: "Invalid health response structure",
          response: data,
          responseTime,
        };
      }
    } else if (service === "robot-bridge") {
      if (!data.status || !data.timestamp) {
        return {
          service,
          url,
          status: "fail",
          error: "Invalid health response structure",
          response: data,
          responseTime,
        };
      }
    }

    return {
      service,
      url,
      status: "pass",
      response: data,
      responseTime,
    };
  } catch (error) {
    const responseTime = Date.now() - startTime;
    return {
      service,
      url,
      status: "fail",
      error:
        error instanceof Error
          ? error.message
          : `Unknown error: ${String(error)}`,
      responseTime,
    };
  }
}

async function main() {
  console.log("🔍 Health Check for Local Services\n");
  console.log(`ZIP App URL: ${ZIP_APP_URL}/api/health`);
  console.log(`Robot Bridge URL: ${ROBOT_BRIDGE_URL}/health\n`);

  const results: HealthCheckResult[] = [];

  // Check ZIP app health
  console.log("Checking ZIP app health...");
  const zipAppResult = await checkHealth(
    "zip-app",
    `${ZIP_APP_URL}/api/health`
  );
  results.push(zipAppResult);

  // Check robot bridge health
  console.log("Checking robot bridge health...");
  const robotBridgeResult = await checkHealth(
    "robot-bridge",
    `${ROBOT_BRIDGE_URL}/health`
  );
  results.push(robotBridgeResult);

  // Print results
  console.log("\n📊 Results:\n");
  let allPassed = true;

  for (const result of results) {
    const icon = result.status === "pass" ? "✅" : "❌";
    console.log(`${icon} ${result.service}`);
    console.log(`   URL: ${result.url}`);
    console.log(`   Status: ${result.status.toUpperCase()}`);
    if (result.responseTime !== undefined) {
      console.log(`   Response Time: ${result.responseTime}ms`);
    }
    if (result.error) {
      console.log(`   Error: ${result.error}`);
      allPassed = false;
    } else if (result.response) {
      console.log(`   Response: ${JSON.stringify(result.response, null, 2)}`);
    }
    console.log();
  }

  // Summary
  const passed = results.filter((r) => r.status === "pass").length;
  const failed = results.filter((r) => r.status === "fail").length;

  console.log("📈 Summary:");
  console.log(`   Passed: ${passed}/${results.length}`);
  console.log(`   Failed: ${failed}/${results.length}`);

  if (allPassed) {
    console.log("\n✅ All health checks passed!");
    process.exit(0);
  } else {
    console.log("\n❌ Some health checks failed!");
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});

