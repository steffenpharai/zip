/**
 * Test printer tools via the API endpoint
 */

async function testPrinterAPI() {
  console.log("🧪 Testing Printer Tools via API...\n");
  
  const baseUrl = "http://localhost:3000";
  
  try {
    // Test get_printer_status tool
    console.log("1️⃣ Testing get_printer_status tool...");
    const statusResponse = await fetch(`${baseUrl}/api/tools/get_printer_status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    
    if (!statusResponse.ok) {
      const errorText = await statusResponse.text();
      throw new Error(`Status API returned ${statusResponse.status}: ${errorText}`);
    }
    
    const statusData = await statusResponse.json();
    console.log("✅ Printer Status API Response:");
    console.log(`   - State: ${statusData.result?.state || "unknown"}`);
    console.log(`   - Klippy Connected: ${statusData.result?.klippyConnected || false}`);
    console.log(`   - Hotend: ${statusData.result?.temperatures?.hotend?.current || 0}°C`);
    console.log(`   - Bed: ${statusData.result?.temperatures?.bed?.current || 0}°C`);
    console.log();
    
    // Test list_printer_files tool
    console.log("2️⃣ Testing list_printer_files tool...");
    const filesResponse = await fetch(`${baseUrl}/api/tools/list_printer_files`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ root: "gcodes" }),
    });
    
    if (!filesResponse.ok) {
      throw new Error(`Files API returned ${filesResponse.status}`);
    }
    
    const filesData = await filesResponse.json();
    console.log(`✅ Files API Response: ${filesData.result?.files?.length || 0} files found`);
    if (filesData.result?.files?.length > 0) {
      filesData.result.files.slice(0, 3).forEach((file: { path: string }, i: number) => {
        console.log(`   ${i + 1}. ${file.path}`);
      });
    }
    console.log();
    
    console.log("✅ All API tests passed! Printer integration is fully functional.");
    process.exit(0);
  } catch (error) {
    console.error("❌ API test failed:");
    if (error instanceof Error) {
      console.error(`   Error: ${error.message}`);
    } else {
      console.error(`   Unknown error: ${error}`);
    }
    process.exit(1);
  }
}

testPrinterAPI();

