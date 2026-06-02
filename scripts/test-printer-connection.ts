/**
 * Test script to verify 3D printer integration
 * 
 * Tests communication with Moonraker API
 */

import { moonrakerRequest } from "../lib/tools/implementations/printer/client";
import { getPrinterStatus } from "../lib/tools/implementations/printer/status";
import { listPrinterFiles } from "../lib/tools/implementations/printer/status";

async function testPrinterConnection() {
  console.log("🔌 Testing 3D Printer Connection...\n");
  
  const printerUrl = process.env.PRINTER_API_URL || "http://169.254.178.90";
  console.log(`📍 Printer URL: ${printerUrl}\n`);
  
  try {
    // Test 1: Server info
    console.log("1️⃣ Testing server info endpoint...");
    const serverInfo = await moonrakerRequest<{
      klippy_connected: boolean;
      klippy_state: string;
      moonraker_version: string;
    }>("/server/info");
    
    console.log("✅ Server Info:");
    console.log(`   - Klippy Connected: ${serverInfo.klippy_connected}`);
    console.log(`   - Klippy State: ${serverInfo.klippy_state}`);
    console.log(`   - Moonraker Version: ${serverInfo.moonraker_version}`);
    console.log();
    
    // Test 2: Printer status
    console.log("2️⃣ Testing printer status...");
    const status = await getPrinterStatus({});
    console.log("✅ Printer Status:");
    console.log(`   - State: ${status.state}`);
    console.log(`   - Klippy Connected: ${status.klippyConnected}`);
    console.log(`   - Hotend: ${status.temperatures.hotend.current}°C / ${status.temperatures.hotend.target}°C`);
    console.log(`   - Bed: ${status.temperatures.bed.current}°C / ${status.temperatures.bed.target}°C`);
    if (status.position) {
      console.log(`   - Position: X${status.position.x?.toFixed(2)} Y${status.position.y?.toFixed(2)} Z${status.position.z?.toFixed(2)}`);
    }
    if (status.printProgress) {
      console.log(`   - Print: ${status.printProgress.filename || "None"} (${status.printProgress.progress || 0}%)`);
    }
    console.log();
    
    // Test 3: List files
    console.log("3️⃣ Testing file list...");
    const files = await listPrinterFiles({ root: "gcodes" });
    console.log(`✅ Found ${files.files.length} G-code files:`);
    if (files.files.length > 0) {
      files.files.slice(0, 5).forEach((file, i) => {
        const size = file.size ? ` (${(file.size / 1024).toFixed(1)}KB)` : "";
        console.log(`   ${i + 1}. ${file.path}${size}`);
      });
      if (files.files.length > 5) {
        console.log(`   ... and ${files.files.length - 5} more`);
      }
    } else {
      console.log("   (No files found)");
    }
    console.log();
    
    console.log("✅ All tests passed! Printer integration is working correctly.");
    process.exit(0);
  } catch (error) {
    console.error("❌ Test failed:");
    if (error instanceof Error) {
      console.error(`   Error: ${error.message}`);
      if (error.stack) {
        console.error(`   Stack: ${error.stack}`);
      }
    } else {
      console.error(`   Unknown error: ${error}`);
    }
    process.exit(1);
  }
}

testPrinterConnection();

