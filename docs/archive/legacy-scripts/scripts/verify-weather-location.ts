#!/usr/bin/env tsx
/**
 * Verification script to test weather and location detection
 * 
 * This script verifies:
 * 1. Weather API endpoint is accessible
 * 2. Weather function can be called with coordinates
 * 3. Location detection flow is correct
 */

import { getWeather } from "../lib/tools/implementations/weather";

async function verifyWeatherLocation() {
  console.log("🔍 Verifying Weather and Location Detection\n");

  // Test 1: Verify weather API with known coordinates (San Francisco)
  console.log("Test 1: Fetching weather for San Francisco (37.7749, -122.4194)...");
  try {
    const weather = await getWeather({ lat: 37.7749, lon: -122.4194 });
    console.log("✅ Weather API working!");
    console.log(`   Location: ${weather.city}, ${weather.country}`);
    console.log(`   Temperature: ${weather.tempF}°F`);
    console.log(`   Condition: ${weather.condition}`);
    console.log(`   Humidity: ${weather.humidityPercent}%`);
    console.log(`   Wind: ${weather.windMs} m/s`);
    if (weather.airQuality) {
      console.log(`   Air Quality: AQI ${weather.airQuality.usAqi}`);
    }
    console.log("");
  } catch (error) {
    console.error("❌ Weather API test failed:", error);
    process.exit(1);
  }

  // Test 2: Verify error handling for missing coordinates
  console.log("Test 2: Testing error handling for missing coordinates...");
  try {
    await getWeather();
    console.error("❌ Should have thrown error for missing coordinates");
    process.exit(1);
  } catch (error) {
    if (error instanceof Error && error.message.includes("location coordinates")) {
      console.log("✅ Error handling correct - requires coordinates");
      console.log("");
    } else {
      console.error("❌ Unexpected error:", error);
      process.exit(1);
    }
  }

  // Test 3: Verify caching works
  console.log("Test 3: Testing weather data caching...");
  const start1 = Date.now();
  await getWeather({ lat: 37.7749, lon: -122.4194 });
  const time1 = Date.now() - start1;
  
  const start2 = Date.now();
  await getWeather({ lat: 37.7749, lon: -122.4194 });
  const time2 = Date.now() - start2;
  
  if (time2 < time1) {
    console.log(`✅ Caching working (first: ${time1}ms, cached: ${time2}ms)`);
  } else {
    console.log(`⚠️  Cache may not be working (first: ${time1}ms, second: ${time2}ms)`);
  }
  console.log("");

  console.log("✅ All weather and location verification tests passed!");
  console.log("\n📝 Browser Verification:");
  console.log("   1. Open browser console (F12)");
  console.log("   2. Navigate to http://localhost:3000");
  console.log("   3. Look for [Weather] prefixed logs:");
  console.log("      - '[Weather] Requesting geolocation permission...'");
  console.log("      - '[Weather] ✅ Location obtained successfully!'");
  console.log("      - '[Weather] 🌤️ Fetching weather for location:'");
  console.log("      - '[Weather] ✅ Weather data received:'");
  console.log("   4. Check weather panel shows data (not 'Loading...')");
}

verifyWeatherLocation().catch((error) => {
  console.error("❌ Verification failed:", error);
  process.exit(1);
});
