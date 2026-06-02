import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Bridge server URL (configurable via environment variable)
const BRIDGE_URL = process.env.VISION_BRIDGE_URL || "http://localhost:8767";

/**
 * GET - Get latest visualization image with YOLO overlays from ROS 2
 * Proxies the image from the bridge server
 */
export async function GET(request: NextRequest) {
  try {
    const response = await fetch(`${BRIDGE_URL}/api/vision/visualization`, {
      cache: "no-store",
      next: { revalidate: 0 },
    });

    if (!response.ok) {
      // If visualization not available, try to return camera image as fallback
      try {
        const cameraResponse = await fetch(`${BRIDGE_URL}/api/vision/camera`, {
          cache: "no-store",
          next: { revalidate: 0 },
        });
        
        if (cameraResponse.ok) {
          const imageBuffer = await cameraResponse.arrayBuffer();
          return new NextResponse(imageBuffer, {
            status: 200,
            headers: {
              "Content-Type": "image/jpeg",
              "Cache-Control": "no-cache, no-store, must-revalidate",
              "Pragma": "no-cache",
              "Expires": "0",
            },
          });
        }
      } catch (fallbackError) {
        // Ignore fallback error
      }
      
      return NextResponse.json(
        { error: "Visualization image not available" },
        { status: response.status }
      );
    }

    const imageBuffer = await response.arrayBuffer();
    
    return new NextResponse(imageBuffer, {
      status: 200,
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "Pragma": "no-cache",
        "Expires": "0",
      },
    });
  } catch (error) {
    console.error("Visualization proxy error:", error);
    return NextResponse.json(
      { error: "Failed to fetch visualization image" },
      { status: 500 }
    );
  }
}
