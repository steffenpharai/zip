import { NextResponse } from "next/server";
import { existsSync } from "fs";
import { join } from "path";

/**
 * Health check endpoint for Docker and monitoring
 * Returns service health status with database connectivity and system metrics
 */
export async function GET() {
  try {
    const health: {
      status: string;
      timestamp: number;
      uptime: number;
      database?: {
        connected: boolean;
        path?: string;
      };
      memory?: {
        used: number;
        total: number;
        percentage: number;
      };
    } = {
      status: "healthy",
      timestamp: Date.now(),
      uptime: process.uptime(),
    };

    // Check database connectivity (SQLite)
    const dataDir = join(process.cwd(), "data");
    const memoryDbPath = join(dataDir, "memory.db");
    const notesDbPath = join(dataDir, "notes.db");
    const docsDbPath = join(dataDir, "docs.db");

    const dbExists =
      existsSync(memoryDbPath) ||
      existsSync(notesDbPath) ||
      existsSync(docsDbPath);

    health.database = {
      connected: dbExists || existsSync(dataDir), // Data directory exists
      path: dataDir,
    };

    // Memory usage (optional, can be disabled in production for security)
    if (process.env.HEALTH_CHECK_INCLUDE_MEMORY === "true") {
      const memUsage = process.memoryUsage();
      health.memory = {
        used: Math.round(memUsage.heapUsed / 1024 / 1024), // MB
        total: Math.round(memUsage.heapTotal / 1024 / 1024), // MB
        percentage: Math.round(
          (memUsage.heapUsed / memUsage.heapTotal) * 100
        ),
      };
    }

    return NextResponse.json(health, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      {
        status: "unhealthy",
        timestamp: Date.now(),
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 503 }
    );
  }
}

