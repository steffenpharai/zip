/**
 * 3D Printer file upload tool (ACT tier)
 * 
 * Tool for uploading G-code files to the printer
 * Requires user confirmation
 */

import { z } from "zod";
import { getPrinterBaseUrl, getLongOperationTimeout } from "./client";

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB max

export const uploadGcodeFileSchema = z.object({
  filename: z.string().min(1).refine(
    (name) => name.endsWith(".gcode") || name.endsWith(".g"),
    { message: "Filename must have .gcode or .g extension" }
  ).describe("G-code filename (must end with .gcode or .g)"),
  content: z.string().min(1).max(MAX_FILE_SIZE).describe("G-code file content (max 50MB)"),
});

export const uploadGcodeFileOutputSchema = z.object({
  success: z.boolean(),
  filename: z.string(),
  message: z.string(),
});

export async function uploadGcodeFile(
  input: z.infer<typeof uploadGcodeFileSchema>
): Promise<z.infer<typeof uploadGcodeFileOutputSchema>> {
  try {
    // Validate file size
    const contentSize = new Blob([input.content]).size;
    if (contentSize > MAX_FILE_SIZE) {
      throw new Error(`File size (${Math.round(contentSize / 1024 / 1024)}MB) exceeds maximum of ${MAX_FILE_SIZE / 1024 / 1024}MB`);
    }
    
    // Validate G-code content (basic check)
    if (!input.content.trim()) {
      throw new Error("G-code file content is empty");
    }
    
    // Moonraker file upload uses multipart/form-data
    const baseUrl = getPrinterBaseUrl();
    const url = `${baseUrl}/server/files/upload`;
    
    // Create FormData (Node.js 18+ has native FormData support)
    const formData = new FormData();
    // Create a Blob from the content (Node.js 18+ supports Blob)
    const fileBlob = new Blob([input.content], { type: "text/plain" });
    formData.append("file", fileBlob, input.filename);
    formData.append("root", "gcodes");
    
    const controller = new AbortController();
    const timeoutMs = getLongOperationTimeout();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    
    try {
      const response = await fetch(url, {
        method: "POST",
        body: formData,
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
        try {
          const errorData = await response.json();
          if (errorData.error?.message) {
            errorMessage = errorData.error.message;
          }
        } catch {
          // Ignore JSON parse errors
        }
        throw new Error(`Upload failed: ${errorMessage}`);
      }
      
      // Moonraker returns the uploaded file info
      const result = await response.json();
      
      return {
        success: true,
        filename: input.filename,
        message: `File uploaded successfully: ${input.filename}`,
      };
    } catch (error) {
      clearTimeout(timeoutId);
      
      if (error instanceof Error) {
        if (error.name === "AbortError") {
          throw new Error(`Upload timeout after ${timeoutMs}ms`);
        }
        throw error;
      }
      throw new Error("Unknown error during file upload");
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to upload file: ${errorMessage}`);
  }
}

