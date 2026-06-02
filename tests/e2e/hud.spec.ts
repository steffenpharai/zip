import { test, expect } from "@playwright/test";

test.describe("HUD Page", () => {
  test("should load and display all key elements", async ({ page }) => {
    await page.goto("/");

    // Check top bar contains ZIP (h1 in top bar)
    const topBar = page.locator("h1:has-text('ZIP')");
    await expect(topBar).toBeVisible();

    // Check Online pill exists
    const onlinePill = page.locator("text=Online");
    await expect(onlinePill).toBeVisible();

    // Check left rail exists with 3 cards (System now includes Uptime tab)
    const leftRail = page.locator('text=System').locator('..').locator('..');
    await expect(leftRail).toBeVisible();

    const systemStatsPanel = page.getByRole("heading", { name: "System" });
    await expect(systemStatsPanel).toBeVisible();

    // Check that System panel has both Stats and Uptime tabs
    const statsTab = page.getByRole("button", { name: "Stats" });
    await expect(statsTab).toBeVisible();

    const uptimeTab = page.getByRole("button", { name: "Uptime" });
    await expect(uptimeTab).toBeVisible();

    const weatherPanel = page.getByRole("heading", { name: "Weather" });
    await expect(weatherPanel).toBeVisible();

    const cameraPanel = page.getByRole("heading", { name: "Camera" });
    await expect(cameraPanel).toBeVisible();

    // Check right rail conversation exists
    const conversationHeader = page.getByRole("heading", { name: "Conversation" });
    await expect(conversationHeader).toBeVisible();

    const clearButton = page.getByRole("button", { name: "Clear conversation" });
    await expect(clearButton).toBeVisible();

    const extractButton = page.getByRole("button", { name: "Extract conversation" });
    await expect(extractButton).toBeVisible();

    // Check center status
    const centerStatus = page.locator("text=Listening for wake word");
    await expect(centerStatus.first()).toBeVisible();

    // Check rail widths (with tolerance - accounting for padding/borders)
    const leftRailBox = await leftRail.boundingBox();
    expect(leftRailBox?.width).toBeGreaterThanOrEqual(320);
    expect(leftRailBox?.width).toBeLessThanOrEqual(360);

    const rightRail = page.getByRole("heading", { name: "Conversation" }).locator("..").locator("..");
    const rightRailBox = await rightRail.boundingBox();
    expect(rightRailBox?.width).toBeGreaterThanOrEqual(390);
    expect(rightRailBox?.width).toBeLessThanOrEqual(440);
  });

  test("should have working chat input", async ({ page }) => {
    await page.goto("/");

    const chatInput = page.locator('input[placeholder*="message"]');
    await expect(chatInput).toBeVisible();

    await chatInput.fill("Hello, ZIP");
    await expect(chatInput).toHaveValue("Hello, ZIP");
  });
});

