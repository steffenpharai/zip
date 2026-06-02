/**
 * Debug script to check SerialPort module resolution paths
 */

console.log("=== SerialPort Path Debug ===\n");

console.log("1. Process Information:");
console.log("   cwd:", process.cwd());
console.log("   __dirname:", __dirname);
console.log("   NODE_PATH:", process.env.NODE_PATH || "(not set)");
console.log("   PWD:", process.env.PWD || "(not set)");

console.log("\n2. Module Resolution:");
try {
  const serialportPath = require.resolve("serialport");
  const bindingsPath = require.resolve("@serialport/bindings-cpp");
  console.log("   serialport:", serialportPath);
  console.log("   bindings-cpp:", bindingsPath);
  
  // Check if paths contain C:\ROOT
  if (serialportPath.includes("C:\\ROOT") || bindingsPath.includes("C:\\ROOT")) {
    console.log("\n   ⚠️ WARNING: Path contains C:\\ROOT - this suggests a Docker or path resolution issue!");
  }
} catch (error) {
  console.log("   Error:", error instanceof Error ? error.message : String(error));
}

console.log("\n3. Module Paths:");
console.log("   require.main.paths:", require.main?.paths?.slice(0, 3) || "N/A");
console.log("   module.paths:", module.paths.slice(0, 3));

console.log("\n4. Test Import:");
try {
  const serialport = require("serialport");
  console.log("   ✓ serialport imported successfully");
  console.log("   SerialPort type:", typeof serialport.SerialPort);
  
  // Try to list ports
  serialport.SerialPort.list()
    .then((ports: any[]) => {
      console.log(`   ✓ Found ${ports.length} serial port(s)`);
      if (ports.length > 0) {
        console.log(`   First port: ${ports[0].path}`);
      }
    })
    .catch((err: Error) => {
      console.log("   ✗ Error listing ports:", err.message);
    });
} catch (error) {
  console.log("   ✗ Import failed:", error instanceof Error ? error.message : String(error));
}

console.log("\n5. File System Check:");
const fs = require("fs");
const path = require("path");

const projectNodeModules = path.join(process.cwd(), "node_modules");
const serialportDir = path.join(projectNodeModules, "serialport");
const bindingsDir = path.join(projectNodeModules, "@serialport", "bindings-cpp");

console.log("   Project node_modules exists:", fs.existsSync(projectNodeModules));
console.log("   serialport exists:", fs.existsSync(serialportDir));
console.log("   bindings-cpp exists:", fs.existsSync(bindingsDir));

if (fs.existsSync(bindingsDir)) {
  const bindingsIndex = path.join(bindingsDir, "dist", "index.js");
  console.log("   bindings index.js exists:", fs.existsSync(bindingsIndex));
  
  // Check for prebuilds
  const prebuildsDir = path.join(bindingsDir, "prebuilds", "win32-x64");
  console.log("   prebuilds/win32-x64 exists:", fs.existsSync(prebuildsDir));
  
  if (fs.existsSync(prebuildsDir)) {
    const files = fs.readdirSync(prebuildsDir);
    console.log("   Prebuild files:", files.join(", "));
  }
}

console.log("\n=== End Debug ===");

