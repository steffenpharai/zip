/**
 * Vision tools for webcam frame analysis and YOLOE detection queries
 */

import { z } from "zod";
import OpenAI from "openai";

// Lazy initialization to avoid errors when API key is not set during module load
let openai: OpenAI | null = null;

function getOpenAIClient(): OpenAI {
  if (!openai) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY not configured");
    }
    openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }
  return openai;
}

export const analyzeImageSchema = z.object({
  imageBase64: z.string().optional().describe("Base64-encoded image data (with data URL prefix)"),
  imageUrl: z.string().optional().describe("URL to image (for web images)"),
  source: z.enum(["webcam", "upload"]).optional().default("webcam").describe("Image source"),
  prompt: z.string().optional().describe("Optional prompt for specific analysis"),
});

export const analyzeImageOutputSchema = z.object({
  analysis: z.string(),
  objects: z.array(z.object({
    name: z.string(),
    confidence: z.number().optional(),
  })).optional(),
  text: z.string().optional(),
  imageUrl: z.string().optional(),
});

export async function analyzeImage(input: z.infer<typeof analyzeImageSchema>): Promise<z.infer<typeof analyzeImageOutputSchema>> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY not configured");
  }
  
  let imageUrl: string;
  
  // Handle different image sources
  if (input.imageUrl) {
    // Use provided URL
    imageUrl = input.imageUrl;
  } else if (input.imageBase64) {
    // Use base64 data
    let imageData = input.imageBase64;
    if (imageData.startsWith("data:image")) {
      imageData = imageData.split(",")[1] || imageData;
    }
    imageUrl = `data:image/jpeg;base64,${imageData}`;
  } else {
    throw new Error("No image data provided. Provide imageBase64 or imageUrl.");
  }
  
  const model = process.env.OPENAI_VISION_MODEL || "gpt-4o";
  
  const prompt = input.prompt || "Analyze this image and describe what you see. Identify any objects, text, or notable features.";
  
  const client = getOpenAIClient();
  const response = await client.chat.completions.create({
    model,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: prompt,
          },
          {
            type: "image_url",
            image_url: {
              url: imageUrl,
            },
          },
        ],
      },
    ],
    max_tokens: 500,
  });
  
  const analysis = response.choices[0]?.message?.content || "Unable to analyze image";
  
  // Extract objects and text if mentioned in analysis
  // In a production system, you might use a more sophisticated extraction
  const objects: Array<{ name: string; confidence?: number }> = [];
  const textMatch = analysis.match(/text[:\s]+"([^"]+)"/i);
  const text = textMatch ? textMatch[1] : undefined;
  
  return {
    analysis,
    objects: objects.length > 0 ? objects : undefined,
    text,
    imageUrl: input.imageUrl,
  };
}

// ============================================================================
// YOLOE Vision Detection Tools
// ============================================================================

/**
 * Get latest YOLOE detections from robot camera
 */
export const getVisionDetectionsSchema = z.object({
  minConfidence: z.number().min(0).max(1).optional().default(0.2).describe("Minimum confidence threshold for detections"),
  maxDetections: z.number().int().min(1).max(1000).optional().default(100).describe("Maximum number of detections to return"),
});

export const getVisionDetectionsOutputSchema = z.object({
  detections: z.array(z.object({
    classId: z.string(),
    className: z.string(),
    confidence: z.number().min(0).max(1),
    bbox: z.object({
      x: z.number(),
      y: z.number(),
      width: z.number(),
      height: z.number(),
      centerX: z.number(),
      centerY: z.number(),
    }),
  })),
  timestamp: z.string().nullable(),
  imageWidth: z.number().nullable(),
  imageHeight: z.number().nullable(),
  count: z.number(),
  error: z.string().optional(),
});

export async function getVisionDetections(
  input: z.infer<typeof getVisionDetectionsSchema>
): Promise<z.infer<typeof getVisionDetectionsOutputSchema>> {
  const VISION_BRIDGE_URL = process.env.VISION_BRIDGE_URL || "http://localhost:8767";
  const { minConfidence, maxDetections } = input;

  try {
    // Fetch detections from vision bridge
    const response = await fetch(`${VISION_BRIDGE_URL}/api/vision/detections`, {
      cache: "no-store",
      headers: {
        "Cache-Control": "no-cache",
      },
      // Timeout after 5 seconds
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      return {
        detections: [],
        timestamp: null,
        imageWidth: null,
        imageHeight: null,
        count: 0,
        error: `Vision bridge returned status ${response.status}`,
      };
    }

    const data = await response.json();

    // Filter and limit detections
    let filteredDetections = (data.detections || []).filter(
      (det: { confidence: number }) => det.confidence >= minConfidence
    );

    // Sort by confidence (highest first) and limit
    filteredDetections = filteredDetections
      .sort((a: { confidence: number }, b: { confidence: number }) => b.confidence - a.confidence)
      .slice(0, maxDetections);

    return {
      detections: filteredDetections,
      timestamp: data.timestamp || null,
      imageWidth: data.image_width || null,
      imageHeight: data.image_height || null,
      count: filteredDetections.length,
    };
  } catch (error) {
    // Handle network errors, timeouts, etc.
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    
    return {
      detections: [],
      timestamp: null,
      imageWidth: null,
      imageHeight: null,
      count: 0,
      error: `Failed to fetch detections: ${errorMessage}`,
    };
  }
}

/**
 * Query vision system with natural language questions
 */
export const queryVisionSchema = z.object({
  question: z.string().describe("Natural language question about what the robot sees"),
  minConfidence: z.number().min(0).max(1).optional().default(0.2).describe("Minimum confidence threshold for detections"),
});

export const queryVisionOutputSchema = z.object({
  answer: z.string().describe("Answer to the question based on vision detections"),
  detections: z.array(z.object({
    className: z.string(),
    confidence: z.number(),
    bbox: z.object({
      centerX: z.number(),
      centerY: z.number(),
      width: z.number(),
      height: z.number(),
    }),
  })).optional().describe("Relevant detections used to answer the question"),
  count: z.number().describe("Total number of detections analyzed"),
});

export async function queryVision(
  input: z.infer<typeof queryVisionSchema>
): Promise<z.infer<typeof queryVisionOutputSchema>> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY not configured");
  }

  const { question, minConfidence } = input;

  // First, get current detections
  const detectionsResult = await getVisionDetections({ minConfidence, maxDetections: 100 });

  if (detectionsResult.error || detectionsResult.count === 0) {
    return {
      answer: detectionsResult.error 
        ? `I cannot see anything right now: ${detectionsResult.error}`
        : "I don't see any objects in my current view. The camera may be off or there may be nothing detected.",
      count: 0,
    };
  }

  // Format detections for LLM context
  const detectionsSummary = detectionsResult.detections.map((det) => ({
    className: det.className,
    confidence: det.confidence,
    position: {
      x: det.bbox.centerX,
      y: det.bbox.centerY,
      width: det.bbox.width,
      height: det.bbox.height,
    },
  }));

  // Group by class for better context
  const classGroups: Record<string, Array<{ confidence: number; position: { x: number; y: number } }>> = {};
  detectionsResult.detections.forEach((det) => {
    if (!classGroups[det.className]) {
      classGroups[det.className] = [];
    }
    classGroups[det.className].push({
      confidence: det.confidence,
      position: { x: det.bbox.centerX, y: det.bbox.centerY },
    });
  });

  const classSummary = Object.entries(classGroups)
    .map(([className, instances]) => {
      const avgConfidence = instances.reduce((sum, inst) => sum + inst.confidence, 0) / instances.length;
      return `${className} (${instances.length} ${instances.length === 1 ? 'instance' : 'instances'}, ${(avgConfidence * 100).toFixed(0)}% confidence)`;
    })
    .join(", ");

  // Build prompt for LLM
  const prompt = `You are analyzing what a robot sees through its camera. The robot has detected the following objects:

${classSummary}

Detailed detections:
${JSON.stringify(detectionsSummary.slice(0, 20), null, 2)}${detectionsSummary.length > 20 ? `\n... and ${detectionsSummary.length - 20} more detections` : ''}

Image dimensions: ${detectionsResult.imageWidth || 'unknown'}x${detectionsResult.imageHeight || 'unknown'}

User question: ${question}

Answer the question based on what the robot can see. Be specific about object names, positions, and relationships. If the question asks about something not visible, say so clearly.`;

  const client = getOpenAIClient();
  const response = await client.chat.completions.create({
    model: process.env.OPENAI_RESPONSES_MODEL || "gpt-4o",
    messages: [
      {
        role: "system",
        content: "You are helping a robot understand what it sees. Answer questions about detected objects accurately and concisely.",
      },
      {
        role: "user",
        content: prompt,
      },
    ],
    max_tokens: 500,
    temperature: 0.3, // Lower temperature for more factual responses
  });

  const answer = response.choices[0]?.message?.content || "I cannot answer that question right now.";

  // Return relevant detections (filter based on question keywords if possible)
  const relevantDetections = detectionsResult.detections.slice(0, 10).map((det) => ({
    className: det.className,
    confidence: det.confidence,
    bbox: {
      centerX: det.bbox.centerX,
      centerY: det.bbox.centerY,
      width: det.bbox.width,
      height: det.bbox.height,
    },
  }));

  return {
    answer,
    detections: relevantDetections.length > 0 ? relevantDetections : undefined,
    count: detectionsResult.count,
  };
}

