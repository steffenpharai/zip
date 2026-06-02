import { test, expect } from "@playwright/test";

test.describe("Weather Panel Location Detection", () => {
  test("should detect location and load weather data", async ({ page, context }) => {
    // Grant geolocation permissions
    await context.grantPermissions(["geolocation"]);
    
    // Mock a location (San Francisco)
    await context.setGeolocation({ latitude: 37.7749, longitude: -122.4194 });
    
    // Navigate to the HUD
    await page.goto("/");
    
    // Wait for page to load
    await page.waitForLoadState("networkidle");
    
    // Wait for geolocation to be requested and location to be obtained
    // Check console logs for location detection
    const locationLogs: string[] = [];
    page.on("console", (msg) => {
      const text = msg.text();
      if (text.includes("[Weather]")) {
        locationLogs.push(text);
      }
    });
    
    // Wait for location to be detected (check for success log)
    await page.waitForFunction(() => {
      return window.navigator.geolocation !== undefined;
    }, { timeout: 5000 });
    
    // Wait a bit for location to be obtained
    await page.waitForTimeout(3000);
    
    // Check that location was obtained
    const locationObtained = locationLogs.some(log => 
      log.includes("Location obtained successfully") || 
      log.includes("✅ Location obtained")
    );
    
    expect(locationObtained).toBe(true);
    
    // Check for weather panel - it should either show weather data or an error (not loading forever)
    const weatherPanel = page.locator("text=Weather").first();
    await expect(weatherPanel).toBeVisible({ timeout: 10000 });
    
    // Wait for weather to load (either data or error, but not "Loading...")
    await page.waitForTimeout(5000);
    
    // Check that weather panel is not stuck on "Loading..."
    const loadingText = page.locator("text=Loading...");
    const loadingCount = await loadingText.count();
    
    // If there's a loading text, it should disappear after a reasonable time
    if (loadingCount > 0) {
      // Wait a bit more
      await page.waitForTimeout(5000);
      
      // Check again - loading should be gone
      const stillLoading = await page.locator("text=Loading...").count();
      expect(stillLoading).toBe(0);
    }
    
    // Verify weather data is displayed or error is shown (not stuck loading)
    const hasWeatherData = await page.locator("text=/°F|°C|Temperature|Humidity|Wind/i").count() > 0;
    const hasError = await page.locator("text=/error|unavailable|denied/i").count() > 0;
    
    // Either weather data or error should be shown (not stuck on loading)
    expect(hasWeatherData || hasError).toBe(true);
    
    // Log the location logs for debugging
    console.log("Location detection logs:", locationLogs);
  });

  test("should handle geolocation permission denial gracefully", async ({ page, context }) => {
    // Deny geolocation permissions
    await context.clearPermissions();
    
    // Navigate to the HUD
    await page.goto("/");
    
    // Wait for page to load
    await page.waitForLoadState("networkidle");
    
    // Wait for geolocation attempt
    await page.waitForTimeout(5000);
    
    // Check that weather panel shows an error (not stuck loading)
    const weatherPanel = page.locator("text=Weather").first();
    await expect(weatherPanel).toBeVisible({ timeout: 10000 });
    
    // Wait a bit more
    await page.waitForTimeout(5000);
    
    // Should show error message, not stuck on loading
    const loadingText = page.locator("text=Loading...");
    const loadingCount = await loadingText.count();
    
    // Should not be stuck on loading after reasonable time
    if (loadingCount > 0) {
      await page.waitForTimeout(5000);
      const stillLoading = await page.locator("text=Loading...").count();
      expect(stillLoading).toBe(0);
    }
    
    // Should show error about location
    const hasError = await page.locator("text=/error|unavailable|denied|location/i").count() > 0;
    expect(hasError).toBe(true);
  });
});
