/**
 * URL fetching and content extraction tool
 */

import { z } from "zod";
import * as cheerio from "cheerio";

export const fetchUrlSchema = z.object({
  url: z.string().url().refine(
    (url) => {
      const lower = url.toLowerCase();
      return (lower.startsWith("http://") || lower.startsWith("https://")) &&
             !lower.startsWith("file://") &&
             !lower.startsWith("javascript:");
    },
    { message: "URL must use http:// or https:// protocol" }
  ),
  maxSize: z.number().int().positive().max(1048576).default(1048576), // 1MB default
});

export const fetchUrlOutputSchema = z.object({
  title: z.string(),
  content: z.string(),
  url: z.string(),
  word_count: z.number(),
  truncated: z.boolean(),
});

export async function fetchUrl(input: z.infer<typeof fetchUrlSchema>): Promise<z.infer<typeof fetchUrlOutputSchema>> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout
  
  try {
    const response = await fetch(input.url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; ZipBot/1.0)",
      },
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    // Check content size
    const contentLength = response.headers.get("content-length");
    if (contentLength && parseInt(contentLength) > input.maxSize) {
      throw new Error(`Content too large: ${contentLength} bytes`);
    }
    
    const html = await response.text();
    
    if (html.length > input.maxSize) {
      throw new Error(`Content too large: ${html.length} bytes`);
    }
    
    // Parse HTML with cheerio
    const $ = cheerio.load(html);
    
    // Extract title
    const title = $("title").text() || $("h1").first().text() || "Untitled";
    
    // Remove scripts, styles, and other non-content elements
    $("script, style, nav, footer, header, aside").remove();
    
    // Extract main content
    const mainContent = $("main, article, .content, .post, .entry, body").first();
    const text = mainContent.text() || $("body").text();
    
    // Clean up whitespace
    const cleanedText = text
      .replace(/\s+/g, " ")
      .trim();
    
    const wordCount = cleanedText.split(/\s+/).filter(w => w.length > 0).length;
    
    // Truncate if too long (keep first 10000 chars)
    const maxChars = 10000;
    const truncated = cleanedText.length > maxChars;
    const content = truncated ? cleanedText.substring(0, maxChars) + "..." : cleanedText;
    
    return {
      title: title.substring(0, 200),
      content,
      url: input.url,
      word_count: wordCount,
      truncated,
    };
  } catch (error) {
    clearTimeout(timeoutId);
    
    if (error instanceof Error) {
      throw new Error(`Failed to fetch URL: ${error.message}`);
    }
    throw new Error("Failed to fetch URL: Unknown error");
  }
}

