import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Bridge server URL (configurable via environment variable)
const BRIDGE_URL = process.env.VISION_BRIDGE_URL || "http://localhost:8767";

/**
 * GET - Get status of all vision topics
 * Proxies the status from the bridge server
 */
export async function GET(request: NextRequest) {
  try {
    const response = await fetch(`${BRIDGE_URL}/api/vision/status`, {
      cache: "no-store",
      next: { revalidate: 0 },
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: "Status not available" },
        { status: response.status }
      );
    }

    const data = await response.json();
    
    return NextResponse.json(data, {
      headers: {
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "Pragma": "no-cache",
        "Expires": "0",
      },
    });
  } catch (error) {
    console.error("Status proxy error:", error);
    return NextResponse.json(
      { error: "Failed to fetch status" },
      { status: 500 }
    );
  }
}
