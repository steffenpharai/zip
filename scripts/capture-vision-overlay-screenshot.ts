#!/usr/bin/env npx tsx
/**
 * Capture screenshot of /vision-diagnostics with live stream and overlays.
 * Run with: npx tsx scripts/capture-vision-overlay-screenshot.ts
 * Requires: zip-app on :3000, vision-service on :8767
 */
import { chromium } from "playwright";
import * as path from "path";

const SCREENSHOT_DIR = process.env.SCREENSHOT_DIR || path.join(process.cwd(), ".cursor");
const BASE = process.env.BASE_URL || "http://localhost:3000";

async function main() {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await page.goto(`${BASE}/vision-diagnostics`, { waitUntil: "networkidle", timeout: 15000 });

    // Click Start Streaming
    const startBtn = page.getByRole("button", { name: "Start Streaming" });
    await startBtn.click();

    // Wait for Stop Streaming (stream started)
    const stopBtn = page.getByRole("button", { name: "Stop Streaming" });
    await stopBtn.waitFor({ state: "visible", timeout: 15000 });

    // Wait for stream and overlays to render (MJPEG + canvas)
    await page.waitForTimeout(4500);

    // Full page screenshot
    const fullPath = path.join(SCREENSHOT_DIR, "vision-overlay-full.png");
    await page.screenshot({ path: fullPath, fullPage: true });
    console.log("Screenshot (full):", fullPath);

    // Screenshot of stream area: img with /api/vision/ or canvas
    const areaPath = path.join(SCREENSHOT_DIR, "vision-overlay-stream-area.png");
    try {
      const img = await page.locator('img[src*="/api/vision/"]').first().boundingBox();
      if (img) {
        await page.screenshot({
          path: areaPath,
          clip: { x: Math.max(0, img.x - 24), y: Math.max(0, img.y - 60), width: img.width + 48, height: img.height + 80 },
        });
      } else {
        await page.screenshot({ path: areaPath, clip: { x: 0, y: 180, width: 720, height: 560 } });
      }
    } catch {
      await page.screenshot({ path: areaPath, clip: { x: 0, y: 180, width: 720, height: 560 } });
    }
    console.log("Screenshot (stream area):", areaPath);
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
