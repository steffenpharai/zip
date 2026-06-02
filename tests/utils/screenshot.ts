import { chromium } from "playwright";
import * as fs from "fs";
import * as path from "path";

async function captureScreenshot() {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  try {
    // Start dev server if not running
    await page.goto("http://localhost:3000", {
      waitUntil: "networkidle",
      timeout: 30000,
    });

    // Wait for HUD to render
    await page.waitForSelector("text=ZIP", { timeout: 10000 });

    // Ensure artifacts directory exists
    const artifactsDir = path.join(process.cwd(), "artifacts");
    if (!fs.existsSync(artifactsDir)) {
      fs.mkdirSync(artifactsDir, { recursive: true });
    }

    // Capture screenshot
    const screenshotPath = path.join(artifactsDir, "hud.png");
    await page.screenshot({
      path: screenshotPath,
      fullPage: true,
    });

    console.log(`Screenshot saved to: ${screenshotPath}`);
  } catch (error) {
    console.error("Error capturing screenshot:", error);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

captureScreenshot();

