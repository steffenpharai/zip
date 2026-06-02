/**
 * Robot Bridge Server-Side Client
 * 
 * HTTP-based client for server-side (API route) communication with the robot bridge.
 * Uses the bridge's HTTP endpoints at port 8766 for health checks and WebSocket for commands.
 */

import type {
  RobotHealthResponse,
  RobotDiagnostics,
  FirmwareCommand,
  MotionOwner,
} from "./types";
import { DEFAULT_ROBOT_CONFIG } from "./types";

const config = DEFAULT_ROBOT_CONFIG;

/**
 * Make an HTTP request to the robot bridge
 */
async function bridgeRequest<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  // Use bridge HTTP endpoint
  const bridgeUrl = process.env.ROBOT_BRIDGE_HTTP_URL || "http://localhost:8766";
  const url = `${bridgeUrl}${path}`;
  
  const response = await fetch(url, {
    ...options,
    signal: AbortSignal.timeout(options.method === "POST" ? 5000 : 3000),
  });

  if (!response.ok) {
    throw new Error(`Bridge request failed: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

/**
 * Check bridge health
 */
export async function checkBridgeHealth(): Promise<RobotHealthResponse | null> {
  try {
    return await bridgeRequest<RobotHealthResponse>("/health");
  } catch (error) {
    console.error("[RobotServerClient] Health check failed:", error);
    return null;
  }
}

/**
 * Send emergency stop via HTTP
 */
export async function emergencyStop(): Promise<boolean> {
  try {
    const result = await bridgeRequest<{ ok: boolean }>("/api/robot/stop", {
      method: "POST",
    });
    return result.ok;
  } catch (error) {
    console.error("[RobotServerClient] Emergency stop failed:", error);
    return false;
  }
}

/**
 * Send a command via WebSocket bridge (uses a temporary connection)
 * This creates a short-lived WebSocket connection for server-side use
 */
export async function sendCommand(
  command: FirmwareCommand,
  timeoutMs: number = 500
): Promise<{ ok: boolean; token?: string; diagnostics?: string[]; error?: string }> {
  // For server-side, we need to use the 'ws' package
  // Dynamic import to avoid issues with client-side bundling
  try {
    const WebSocket = (await import("ws")).default;
    
    return new Promise((resolve) => {
      const bridgeWsUrl = process.env.ROBOT_BRIDGE_WS_URL || "ws://localhost:8765/robot";
      const ws = new WebSocket(bridgeWsUrl);
      const id = `srv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      let resolved = false;
      
      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          try { ws.close(); } catch { /* ignore */ }
          console.log(`[RobotServerClient] Command N=${command.N} timeout after ${timeoutMs}ms`);
          resolve({ ok: false, error: `Command timeout after ${timeoutMs}ms` });
        }
      }, timeoutMs);

      ws.on("error", (error: Error) => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          try { ws.close(); } catch { /* ignore */ }
          console.log(`[RobotServerClient] WebSocket error:`, error.message);
          resolve({ ok: false, error: error.message });
        }
      });

      ws.on("message", (data: Buffer) => {
        try {
          const msg = JSON.parse(data.toString());
          if (msg.type === "robot.serial.rx") {
            console.log(`[RobotServerClient] Serial RX: ${msg.line}`);
          } else if (msg.type === "robot.reply") {
            console.log(`[RobotServerClient] Reply: id=${msg.id}, our_id=${id}, ok=${msg.ok}, replyKind=${msg.replyKind}`);
          }
          // Handle reply messages
          if (msg.type === "robot.reply" && msg.id === id) {
            if (!resolved) {
              resolved = true;
              clearTimeout(timeout);
              try { ws.close(); } catch { /* ignore */ }
              console.log(`[RobotServerClient] Reply matched! replyKind=${msg.replyKind}, token=${msg.token}, diag=${!!msg.diagnostics}`);
              resolve({
                ok: msg.ok,
                token: msg.token,
                diagnostics: msg.diagnostics,
                error: msg.error,
              });
            }
          }
          // Ignore status and other messages
        } catch {
          // Ignore parse errors
        }
      });

      ws.on("open", () => {
        const message = JSON.stringify({
          type: "robot.command",
          id,
          payload: command,
          expectReply: true,
          timeoutMs,
        });
        ws.send(message);
      });
    });
  } catch (error) {
    console.log("[RobotServerClient] Failed to create WebSocket:", error);
    return { ok: false, error: error instanceof Error ? error.message : "WebSocket not available" };
  }
}

/**
 * Get diagnostics from firmware (N=120)
 * Diagnostics returns multiple lines, collected over ~100ms by the bridge.
 * We need a longer timeout to account for collection time.
 */
export async function getDiagnostics(): Promise<RobotDiagnostics | null> {
  // Diagnostics takes longer: ~100ms for collection + variable firmware response time
  // Use 3000ms timeout to be safe
  const result = await sendCommand({ N: 120, H: "diag" }, 3000);
  
  console.log("[RobotServerClient] Diagnostics result:", JSON.stringify(result));
  
  if (!result.ok || !result.diagnostics) {
    console.log("[RobotServerClient] Diagnostics failed or no data:", result.error);
    return null;
  }

  return parseDiagnostics(result.diagnostics);
}

/**
 * Parse diagnostics response
 * Handles both old and new firmware formats:
 * Old: {I100,-100,0,1,5} {stats:rx=1234,jd=0,pe=0,bc=0,tx=567,ms=60000}
 * New: {X0,0,0,0,1,ram:859,min:853} {stats:rx=0,jd=0,pe=0,tx=0,ms=1}
 */
function parseDiagnostics(lines: string[]): RobotDiagnostics | null {
  try {
    if (lines.length < 2) return null;

    // Parse first line: {<owner><L>,<R>,<stby>,<state>,<resets>[,ram:<ram>,min:<min>]}
    const line1Match = lines[0].match(/\{([IDX])(-?\d+),(-?\d+),(\d+),(\d+),(\d+)/);
    if (!line1Match) {
      console.log("[parseDiagnostics] Line 1 didn't match:", lines[0]);
      return null;
    }

    // Parse second line: {stats:rx=<rx>,jd=<jd>,pe=<pe>[,bc=<bc>],tx=<tx>,ms=<ms>}
    // bc is optional in newer firmware
    const line2Match = lines[1].match(/\{stats:rx=(\d+),jd=(\d+),pe=(\d+)(?:,bc=(\d+))?,tx=(\d+),ms=(\d+)\}/);
    if (!line2Match) {
      console.log("[parseDiagnostics] Line 2 didn't match:", lines[1]);
      return null;
    }

    return {
      owner: line1Match[1] as MotionOwner,
      motorLeft: parseInt(line1Match[2], 10),
      motorRight: parseInt(line1Match[3], 10),
      standby: line1Match[4] === "1",
      state: parseInt(line1Match[5], 10),
      resets: parseInt(line1Match[6], 10),
      stats: {
        rxBytes: parseInt(line2Match[1], 10),
        jsonDecodeErrors: parseInt(line2Match[2], 10),
        parseErrors: parseInt(line2Match[3], 10),
        badCommands: line2Match[4] ? parseInt(line2Match[4], 10) : 0,
        txBytes: parseInt(line2Match[5], 10),
        uptime: parseInt(line2Match[6], 10),
      },
    };
  } catch (error) {
    console.log("[parseDiagnostics] Error:", error);
    return null;
  }
}

/**
 * Send stop command (N=201)
 */
export async function sendStopCommand(): Promise<boolean> {
  const result = await sendCommand({ N: 201, H: "stop" }, 500);
  return result.ok;
}

/**
 * Send direct motor command (N=999)
 */
export async function sendDirectMotor(left: number, right: number): Promise<boolean> {
  const result = await sendCommand({
    N: 999,
    H: "motor",
    D1: Math.max(-255, Math.min(255, Math.round(left))),
    D2: Math.max(-255, Math.min(255, Math.round(right))),
  }, 500);
  return result.ok;
}

/**
 * Get ultrasonic reading (N=21)
 */
export async function getUltrasonic(mode: "distance" | "obstacle" = "distance"): Promise<number | boolean | null> {
  const result = await sendCommand({
    N: 21,
    H: "ultra",
    D1: mode === "distance" ? 2 : 1,
  }, 500);
  
  if (!result.ok || !result.token) return null;
  
  const match = result.token.match(/\{[\w]+_(\w+)\}/);
  if (!match) return null;
  
  if (mode === "obstacle") {
    return match[1] === "true";
  }
  return parseInt(match[1], 10);
}

/**
 * Get line sensor reading (N=22)
 */
export async function getLineSensor(sensor: 0 | 1 | 2): Promise<number | null> {
  const result = await sendCommand({
    N: 22,
    H: "line",
    D1: sensor,
  }, 500);
  
  if (!result.ok || !result.token) return null;
  
  const match = result.token.match(/\{[\w]+_(\d+)\}/);
  return match ? parseInt(match[1], 10) : null;
}

/**
 * Get battery voltage (N=23)
 */
export async function getBattery(): Promise<number | null> {
  console.log("[RobotServerClient] Getting battery...");
  const result = await sendCommand({
    N: 23,
    H: "batt",
  }, 1000);
  
  console.log("[RobotServerClient] Battery result:", JSON.stringify(result));
  
  if (!result.ok || !result.token) return null;
  
  const match = result.token.match(/\{[\w]+_(\d+)\}/);
  return match ? parseInt(match[1], 10) : null;
}

/**
 * Start streaming (via WebSocket message)
 */
export async function startStreaming(
  v: number,
  w: number,
  rateHz: number = 10,
  ttlMs: number = 200
): Promise<boolean> {
  try {
    const WebSocket = (await import("ws")).default;
    
    return new Promise((resolve) => {
      const bridgeWsUrl = process.env.ROBOT_BRIDGE_WS_URL || "ws://localhost:8765/robot";
      const ws = new WebSocket(bridgeWsUrl);
      const id = `stream_${Date.now()}`;
      
      const timeout = setTimeout(() => {
        ws.close();
        resolve(false);
      }, 2000);

      ws.on("error", () => {
        clearTimeout(timeout);
        ws.close();
        resolve(false);
      });

      ws.on("message", (data) => {
        try {
          const msg = JSON.parse(data.toString());
          if (msg.type === "robot.reply" && msg.id === id) {
            clearTimeout(timeout);
            ws.close();
            resolve(msg.ok);
          }
        } catch {
          // Ignore
        }
      });

      ws.on("open", () => {
        ws.send(JSON.stringify({
          type: "robot.stream.start",
          id,
          v: Math.max(-255, Math.min(255, Math.round(v))),
          w: Math.max(-255, Math.min(255, Math.round(w))),
          rateHz,
          ttlMs,
        }));
      });
    });
  } catch {
    return false;
  }
}

/**
 * Stop streaming (via WebSocket message)
 */
export async function stopStreaming(hardStop: boolean = true): Promise<boolean> {
  try {
    const WebSocket = (await import("ws")).default;
    
    return new Promise((resolve) => {
      const bridgeWsUrl = process.env.ROBOT_BRIDGE_WS_URL || "ws://localhost:8765/robot";
      const ws = new WebSocket(bridgeWsUrl);
      const id = `stop_${Date.now()}`;
      
      const timeout = setTimeout(() => {
        ws.close();
        resolve(false);
      }, 2000);

      ws.on("error", () => {
        clearTimeout(timeout);
        ws.close();
        resolve(false);
      });

      ws.on("message", (data) => {
        try {
          const msg = JSON.parse(data.toString());
          if (msg.type === "robot.reply" && msg.id === id) {
            clearTimeout(timeout);
            ws.close();
            resolve(msg.ok);
          }
        } catch {
          // Ignore
        }
      });

      ws.on("open", () => {
        ws.send(JSON.stringify({
          type: "robot.stream.stop",
          id,
          hardStop,
        }));
      });
    });
  } catch {
    return false;
  }
}

