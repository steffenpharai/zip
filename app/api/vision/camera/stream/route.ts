import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Bridge server URL (configurable via environment variable)
const BRIDGE_URL = process.env.VISION_BRIDGE_URL || "http://localhost:8767";

/**
 * GET - MJPEG stream from ROS 2 camera
 * Proxies the MJPEG stream from the bridge server
 * Uses multipart/x-mixed-replace for continuous frame streaming
 */
export async function GET(request: NextRequest) {
  // Create AbortController to handle client disconnections
  const controller = new AbortController();
  const signal = controller.signal;
  
  // Handle client disconnect - cancel the fetch
  request.signal.addEventListener('abort', () => {
    controller.abort();
  });

  try {
    const response = await fetch(`${BRIDGE_URL}/api/vision/camera/stream`, {
      cache: "no-store",
      next: { revalidate: 0 },
      signal, // Pass abort signal to cancel fetch on client disconnect
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: "Camera stream not available" },
        { status: response.status }
      );
    }

    // Stream the response body directly without buffering
    // This is critical for MJPEG streaming performance
    const stream = response.body;
    
    if (!stream) {
      return NextResponse.json(
        { error: "No stream data available" },
        { status: 500 }
      );
    }

    // Create a readable stream that handles cancellation
    const reader = stream.getReader();
    const readableStream = new ReadableStream({
      async start(controller) {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            controller.enqueue(value);
          }
          controller.close();
        } catch (error: any) {
          // Handle cancellation gracefully
          if (error.name === 'AbortError' || signal.aborted) {
            // Client disconnected - cancel gracefully
            try {
              reader.cancel();
            } catch (e) {
              // Ignore cancel errors
            }
            controller.close();
            return;
          }
          controller.error(error);
        }
      },
      cancel() {
        // Client disconnected - cancel the upstream fetch
        reader.cancel().catch(() => {
          // Ignore cancel errors
        });
        controller.abort();
      },
    });

    // Return streaming response with proper MJPEG headers
    return new NextResponse(readableStream, {
      status: 200,
      headers: {
        "Content-Type": "multipart/x-mixed-replace; boundary=frame",
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "Pragma": "no-cache",
        "Expires": "0",
        "Connection": "keep-alive",
      },
    });
  } catch (error: any) {
    // Handle cancellation and connection errors gracefully
    if (error.name === 'AbortError' || signal.aborted || error.message?.includes('aborted')) {
      // Client disconnected - this is normal, don't log as error
      return new NextResponse(null, { status: 499 }); // 499 = Client Closed Request
    }
    console.error("Camera stream proxy error:", error);
    return NextResponse.json(
      { error: "Failed to fetch camera stream" },
      { status: 500 }
    );
  }
}
