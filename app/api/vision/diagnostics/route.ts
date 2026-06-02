import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

export const dynamic = "force-dynamic";

// Bridge server URL (configurable via environment variable)
const BRIDGE_URL = process.env.VISION_BRIDGE_URL || "http://localhost:8767";

const detectionRequestSchema = z.object({
  imageBase64: z.string().optional(),
  imageUrl: z.string().optional(),
  confidenceThreshold: z.number().min(0).max(1).optional().default(0.5),
  nmsThreshold: z.number().min(0).max(1).optional().default(0.4),
  maxDetections: z.number().min(1).max(500).optional().default(100),
});

const configRequestSchema = z.object({
  action: z.enum(["get", "update"]),
  config: z.object({
    confidenceThreshold: z.number().min(0).max(1).optional(),
    nmsThreshold: z.number().min(0).max(1).optional(),
    maxDetections: z.number().min(1).max(500).optional(),
    inputWidth: z.number().optional(),
    inputHeight: z.number().optional(),
    useInt8: z.boolean().optional(),
  }).optional(),
});

/**
 * GET - Get YOLOE model configuration and status
 * Migrated to YOLOE for potential open-vocabulary detection (zero overhead in closed mode)
 */
export async function GET(request: NextRequest) {
  try {
    // Try to fetch from bridge server first
    try {
      const [configRes, statusRes] = await Promise.all([
        fetch(`${BRIDGE_URL}/api/vision/config`).catch(() => null),
        fetch(`${BRIDGE_URL}/api/vision/status`).catch(() => null),
      ]);

      if (configRes?.ok && statusRes?.ok) {
        const configData = await configRes.json();
        const statusData = await statusRes.json();
        
        return NextResponse.json({
          success: true,
          config: configData.config || configData,
          status: {
            ...statusData,
            engineLoaded: statusData.detections?.active || false,
          },
        });
      }
    } catch (bridgeError) {
      console.warn("Bridge server not available, using defaults:", bridgeError);
    }

    // Fallback to default configuration if bridge is unavailable
    const config = {
      modelPath: process.env.YOLOE_MODEL_PATH || process.env.YOLO_MODEL_PATH || "/opt/models/yoloe-11s-seg-pf.engine",
      inputWidth: 640,
      inputHeight: 640,
      confidenceThreshold: 0.75,
      nmsThreshold: 0.4,
      maxDetections: 100,
      useInt8: true,
      useFp16: true,
      device: "GPU",
      initialized: true,
      numClasses: 80, // COCO dataset default
    };

    return NextResponse.json({
      success: true,
      config,
      status: {
        engineLoaded: false,
        lastInferenceTime: null,
        averageFps: null,
        totalInferences: 0,
        bridgeConnected: false,
      },
    });
  } catch (error) {
    console.error("YOLOE diagnostics GET error:", error);
    return NextResponse.json(
      { error: "Failed to get YOLOE configuration" },
      { status: 500 }
    );
  }
}

/**
 * POST - Run YOLOE inference or update configuration
 * Migrated to YOLOE for potential open-vocabulary detection (zero overhead in closed mode)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Check if this is a config update request
    if (body.action === "get" || body.action === "update") {
      const validated = configRequestSchema.parse(body);
      
      if (validated.action === "get") {
        // Return current configuration
        return GET(request);
      } else if (validated.action === "update" && validated.config) {
        // In a real implementation, this would update ROS2 node parameters
        // For now, return success
        return NextResponse.json({
          success: true,
          message: "Configuration updated (simulated)",
          config: validated.config,
        });
      }
    }
    
    // Otherwise, this is an inference request
    const validated = detectionRequestSchema.parse(body);
    
    // Try to fetch real detections from bridge server
    try {
      const detectionsRes = await fetch(`${BRIDGE_URL}/api/vision/detections`).catch(() => null);
      const statusRes = await fetch(`${BRIDGE_URL}/api/vision/status`).catch(() => null);
      
      if (detectionsRes?.ok && statusRes?.ok) {
        const detectionsData = await detectionsRes.json();
        const statusData = await statusRes.json();
        
        // Filter detections by confidence threshold
        const filteredDetections = detectionsData.detections?.filter(
          (det: any) => det.confidence >= validated.confidenceThreshold
        ) || [];
        
        // Limit to maxDetections
        const limitedDetections = filteredDetections.slice(0, validated.maxDetections);
        
        return NextResponse.json({
          success: true,
          detections: limitedDetections,
          stats: {
            inferenceTimeMs: null, // Not available from bridge
            numDetections: limitedDetections.length,
            imageWidth: detectionsData.image_width || statusData.camera?.width || 640,
            imageHeight: detectionsData.image_height || statusData.camera?.height || 480,
            fps: statusData.detections?.fps || null,
          },
          config: {
            confidenceThreshold: validated.confidenceThreshold,
            nmsThreshold: validated.nmsThreshold,
            maxDetections: validated.maxDetections,
          },
        });
      }
    } catch (bridgeError) {
      console.warn("Bridge server not available, using mock data:", bridgeError);
    }
    
    // Fallback to mock detections if bridge is unavailable
    if (!validated.imageBase64 && !validated.imageUrl) {
      return NextResponse.json(
        { error: "No image data provided and bridge server unavailable" },
        { status: 400 }
      );
    }
    
    const mockDetections = generateMockDetections(
      validated.confidenceThreshold,
      validated.maxDetections
    );
    
    const startTime = performance.now();
    // Simulate inference time (10-50ms)
    await new Promise(resolve => setTimeout(resolve, Math.random() * 40 + 10));
    const inferenceTime = performance.now() - startTime;
    
    return NextResponse.json({
      success: true,
      detections: mockDetections,
      stats: {
        inferenceTimeMs: inferenceTime,
        numDetections: mockDetections.length,
        imageWidth: 640,
        imageHeight: 480,
      },
      config: {
        confidenceThreshold: validated.confidenceThreshold,
        nmsThreshold: validated.nmsThreshold,
        maxDetections: validated.maxDetections,
      },
    });
  } catch (error) {
    console.error("YOLOE diagnostics POST error:", error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid request", details: error.errors },
        { status: 400 }
      );
    }
    
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * Generate mock detections for testing UI
 */
function generateMockDetections(
  confidenceThreshold: number,
  maxDetections: number
): Array<{
  classId: string;
  className: string;
  confidence: number;
  bbox: {
    x: number;
    y: number;
    width: number;
    height: number;
    centerX: number;
    centerY: number;
  };
}> {
  // COCO class names (first 20 for demo)
  const classNames = [
    "person", "bicycle", "car", "motorcycle", "airplane",
    "bus", "train", "truck", "boat", "traffic light",
    "fire hydrant", "stop sign", "parking meter", "bench", "bird",
    "cat", "dog", "horse", "sheep", "cow",
  ];
  
  const detections: Array<{
    classId: string;
    className: string;
    confidence: number;
    bbox: {
      x: number;
      y: number;
      width: number;
      height: number;
      centerX: number;
      centerY: number;
    };
  }> = [];
  
  // Generate 0-5 random detections
  const numDetections = Math.floor(Math.random() * 6);
  
  for (let i = 0; i < numDetections && i < maxDetections; i++) {
    const classId = Math.floor(Math.random() * classNames.length);
    const confidence = Math.random() * 0.5 + confidenceThreshold; // Ensure above threshold
    
    if (confidence >= confidenceThreshold) {
      const x = Math.random() * 400;
      const y = Math.random() * 300;
      const width = Math.random() * 200 + 50;
      const height = Math.random() * 200 + 50;
      
      detections.push({
        classId: classId.toString(),
        className: classNames[classId],
        confidence: Math.round(confidence * 100) / 100,
        bbox: {
          x: Math.round(x),
          y: Math.round(y),
          width: Math.round(width),
          height: Math.round(height),
          centerX: Math.round(x + width / 2),
          centerY: Math.round(y + height / 2),
        },
      });
    }
  }
  
  // Sort by confidence (highest first)
  detections.sort((a, b) => b.confidence - a.confidence);
  
  return detections;
}
