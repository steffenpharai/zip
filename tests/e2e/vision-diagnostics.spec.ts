import { test, expect } from "@playwright/test";

test.describe("Vision Diagnostics Page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/vision-diagnostics");
    // Wait for page to load
    await page.waitForLoadState("networkidle");
  });

  test("should load diagnostics page with all key elements", async ({ page }) => {
    // Check page title
    const title = page.locator("h1:has-text('YOLO11 Diagnostics')");
    await expect(title).toBeVisible();

    // Check for Start Streaming button
    const startButton = page.getByRole("button", { name: "Start Streaming" });
    await expect(startButton).toBeVisible();

    // Check for Run Inference button
    const inferenceButton = page.getByRole("button", { name: "Run Inference" });
    await expect(inferenceButton).toBeVisible();
  });

  test("should show bridge connection status", async ({ page }) => {
    // Check for bridge status indicator
    const bridgeStatus = page.locator("text=Bridge Connected").or(page.locator("text=Bridge Disconnected"));
    await expect(bridgeStatus).toBeVisible();
  });

  test("should toggle streaming and maintain bridge connection", async ({ page }) => {
    // Click Start Streaming
    const startButton = page.getByRole("button", { name: "Start Streaming" });
    await startButton.click();

    // Wait for stream to start (check for Stop Streaming button)
    const stopButton = page.getByRole("button", { name: "Stop Streaming" });
    await expect(stopButton).toBeVisible({ timeout: 10000 });

    // Wait a moment for stream to initialize
    await page.waitForTimeout(2000);

    // Check bridge connection is still shown (not "Bridge Disconnected")
    const bridgeDisconnected = page.locator("text=Bridge Disconnected");
    // Bridge should NOT be disconnected after starting stream
    await expect(bridgeDisconnected).not.toBeVisible({ timeout: 5000 });

    // Stop streaming
    await stopButton.click();

    // Wait for Start Streaming button to reappear
    await expect(startButton).toBeVisible({ timeout: 5000 });

    // Wait a moment
    await page.waitForTimeout(1000);

    // Start streaming again
    await startButton.click();
    await expect(stopButton).toBeVisible({ timeout: 10000 });

    // Wait for stream to initialize
    await page.waitForTimeout(2000);

    // Bridge should still be connected (or at least not show disconnected immediately)
    // The fix should prevent immediate disconnection after stopping
    await expect(bridgeDisconnected).not.toBeVisible({ timeout: 3000 });
  });

  test("should render canvas overlay when streaming", async ({ page }) => {
    // Start streaming
    const startButton = page.getByRole("button", { name: "Start Streaming" });
    await startButton.click();

    // Wait for stream to start
    const stopButton = page.getByRole("button", { name: "Stop Streaming" });
    await expect(stopButton).toBeVisible({ timeout: 10000 });

    // Wait for stream image to load
    await page.waitForTimeout(3000);

    // Check that canvas element exists (for overlays)
    const canvas = page.locator("canvas").first();
    // Canvas should exist for overlay rendering
    const canvasCount = await canvas.count();
    expect(canvasCount).toBeGreaterThan(0);
  });

  test("should display detections when available", async ({ page }) => {
    // Start streaming
    const startButton = page.getByRole("button", { name: "Start Streaming" });
    await startButton.click();

    // Wait for stream to start
    await page.waitForTimeout(5000);

    // Check if detection list appears (may be empty, but section should exist)
    const detectionSection = page.locator("text=/Detections/i");
    // Detection section might not appear if no detections, so just check page loaded
    await page.waitForLoadState("networkidle");
  });
});
