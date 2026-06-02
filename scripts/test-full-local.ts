#!/usr/bin/env tsx
/**
 * Full test suite orchestrator for local development
 * Runs: build verification, health checks, E2E tests, and integration tests
 */

import { exec } from "child_process";
import { promisify } from "util";
import { existsSync } from "fs";
import { join } from "path";

const execAsync = promisify(exec);

interface TestPhase {
  name: string;
  command: string;
  cwd?: string;
}

const phases: TestPhase[] = [];

let currentPhase = 0;
let allPassed = true;

function log(message: string) {
  console.log(message);
}

function logPhase(name: string) {
  log(`\n${"=".repeat(60)}`);
  log(`Phase ${++currentPhase}: ${name}`);
  log("=".repeat(60));
}

async function runCommand(command: string, cwd?: string): Promise<boolean> {
  try {
    log(`\nRunning: ${command}`);
    if (cwd) {
      log(`Working directory: ${cwd}`);
    }
    const { stdout, stderr } = await execAsync(command, {
      cwd: cwd || process.cwd(),
      maxBuffer: 10 * 1024 * 1024, // 10MB
    });

    if (stdout) {
      log(stdout);
    }
    if (stderr) {
      log(stderr);
    }
    return true;
  } catch (error: any) {
    log(`\n❌ Command failed: ${command}`);
    if (error.stdout) {
      log(error.stdout);
    }
    if (error.stderr) {
      log(error.stderr);
    }
    return false;
  }
}

async function checkBuilds(): Promise<boolean> {
  logPhase("Build Verification");

  // Check ZIP app TypeScript compilation
  log("\n1. Checking ZIP app TypeScript compilation...");
  const zipTypeCheck = await runCommand("npm run typecheck");
  if (!zipTypeCheck) {
    log("❌ ZIP app typecheck failed");
    return false;
  }

  // Check robot bridge TypeScript compilation
  log("\n2. Checking robot bridge TypeScript compilation...");
  const bridgeTypeCheck = await runCommand(
    "npm run typecheck",
    join(process.cwd(), "robot/bridge/zip-robot-bridge")
  );
  if (!bridgeTypeCheck) {
    log("❌ Robot bridge typecheck failed");
    return false;
  }

  // Check ZIP app build (production)
  log("\n3. Building ZIP app for production...");
  const zipBuild = await runCommand("npm run build:local");
  if (!zipBuild) {
    log("❌ ZIP app build failed");
    return false;
  }

  // Check robot bridge build
  log("\n4. Building robot bridge...");
  const bridgeBuild = await runCommand(
    "npm run build:local",
    join(process.cwd(), "robot/bridge/zip-robot-bridge")
  );
  if (!bridgeBuild) {
    log("❌ Robot bridge build failed");
    return false;
  }

  log("\n✅ All builds successful!");
  return true;
}

async function checkServicesRunning(): Promise<boolean> {
  logPhase("Service Availability Check");

  log("\n⚠️  Note: This test assumes services are already running.");
  log("   Start services in separate terminals:");
  log("   Terminal 1: npm run dev:bridge");
  log("   Terminal 2: npm run dev:local");
  log("\n   Or use the build scripts to start production builds.\n");

  // Check if services are running by testing health endpoints
  log("Checking if ZIP app is running...");
  try {
    const zipResponse = await fetch("http://localhost:3000/api/health", {
      signal: AbortSignal.timeout(2000),
    });
    if (zipResponse.ok) {
      log("✅ ZIP app is running");
    } else {
      log("❌ ZIP app health check failed");
      return false;
    }
  } catch (error) {
    log("❌ ZIP app is not running or not accessible");
    log(`   Error: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }

  log("\nChecking if robot bridge is running...");
  try {
    const bridgeResponse = await fetch("http://localhost:8766/health", {
      signal: AbortSignal.timeout(2000),
    });
    if (bridgeResponse.ok) {
      log("✅ Robot bridge is running");
    } else {
      log("❌ Robot bridge health check failed");
      return false;
    }
  } catch (error) {
    log("❌ Robot bridge is not running or not accessible");
    log(`   Error: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }

  return true;
}

async function runHealthTests(): Promise<boolean> {
  logPhase("Health Check Tests");

  const healthTest = await runCommand("npm run test:health");
  return healthTest;
}

async function runIntegrationTests(): Promise<boolean> {
  logPhase("Integration Tests");

  const integrationTest = await runCommand("npm run test:integration");
  return integrationTest;
}

async function runE2ETests(): Promise<boolean> {
  logPhase("E2E Tests (Playwright)");

  // Check if Playwright is installed
  const playwrightConfig = join(process.cwd(), "playwright.config.ts");
  if (!existsSync(playwrightConfig)) {
    log("⏭️  Playwright config not found, skipping E2E tests");
    return true;
  }

  const e2eTest = await runCommand("npm run test:e2e");
  return e2eTest;
}

async function main() {
  log("🧪 Full Test Suite for Local Development\n");
  log("This script will run:");
  log("  1. Build verification (TypeScript + production builds)");
  log("  2. Service availability check");
  log("  3. Health check tests");
  log("  4. Integration tests");
  log("  5. E2E tests (Playwright)");
  log("\n⚠️  Make sure services are running before running this script!\n");

  const startTime = Date.now();

  // Phase 1: Build verification
  const buildsOk = await checkBuilds();
  if (!buildsOk) {
    log("\n❌ Build verification failed. Stopping tests.");
    process.exit(1);
  }

  // Phase 2: Service availability
  const servicesOk = await checkServicesRunning();
  if (!servicesOk) {
    log("\n❌ Services are not running. Please start them and try again.");
    log("\nTo start services:");
    log("  Terminal 1: npm run dev:bridge");
    log("  Terminal 2: npm run dev:local");
    process.exit(1);
  }

  // Phase 3: Health tests
  const healthOk = await runHealthTests();
  if (!healthOk) {
    allPassed = false;
  }

  // Phase 4: Integration tests
  const integrationOk = await runIntegrationTests();
  if (!integrationOk) {
    allPassed = false;
  }

  // Phase 5: E2E tests
  const e2eOk = await runE2ETests();
  if (!e2eOk) {
    allPassed = false;
  }

  // Summary
  const duration = ((Date.now() - startTime) / 1000).toFixed(2);
  log("\n" + "=".repeat(60));
  log("Test Suite Summary");
  log("=".repeat(60));
  log(`Total duration: ${duration}s`);
  log(`Status: ${allPassed ? "✅ All tests passed" : "❌ Some tests failed"}`);

  process.exit(allPassed ? 0 : 1);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});

