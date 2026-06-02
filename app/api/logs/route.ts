import { NextRequest, NextResponse } from "next/server";

// Throttle logging to avoid spam - only log once per message per second
const logCache = new Map<string, number>();
const LOG_THROTTLE_MS = 1000; // 1 second

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { level = "log", message, data } = body;

    // Create a cache key from the message (include data hash for uniqueness)
    const dataHash = data ? JSON.stringify(data).slice(0, 100) : '';
    const cacheKey = `${level}:${message}:${dataHash}`;
    const now = Date.now();
    const lastLogTime = logCache.get(cacheKey) || 0;
    
    // Throttle: only log if enough time has passed since last identical log
    // Only errors and warnings bypass throttling
    const isErrorOrWarn = level === "error" || level === "warn";
    if (!isErrorOrWarn && now - lastLogTime < LOG_THROTTLE_MS) {
      return NextResponse.json({ success: true, throttled: true });
    }
    
    logCache.set(cacheKey, now);
    
    // Clean up old cache entries periodically (keep cache size reasonable)
    if (logCache.size > 100) {
      const cutoff = now - LOG_THROTTLE_MS * 10;
      for (const [key, time] of logCache.entries()) {
        if (time < cutoff) {
          logCache.delete(key);
        }
      }
    }

    // Format the log message
    const timestamp = new Date().toISOString();
    const logMessage = data
      ? `[${timestamp}] [${level.toUpperCase()}] ${message}\n${JSON.stringify(data, null, 2)}`
      : `[${timestamp}] [${level.toUpperCase()}] ${message}`;

    // Log to server console (which will appear in Docker logs)
    switch (level.toLowerCase()) {
      case "error":
        console.error(logMessage);
        break;
      case "warn":
        console.warn(logMessage);
        break;
      case "info":
        console.info(logMessage);
        break;
      default:
        console.log(logMessage);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error in log endpoint:", error);
    return NextResponse.json(
      { success: false, error: "Failed to log message" },
      { status: 500 }
    );
  }
}

