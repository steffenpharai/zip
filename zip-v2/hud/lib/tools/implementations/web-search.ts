/**
 * Web search tool
 * 
 * Uses DuckDuckGo HTML scraping for web search (no API key required)
 */

import { z } from "zod";

export const webSearchSchema = z.object({
  query: z.string().min(1).max(500),
  maxResults: z.number().int().positive().max(10).default(5),
});

export const webSearchOutputSchema = z.object({
  results: z.array(z.object({
    title: z.string(),
    snippet: z.string(),
    url: z.string(),
    relevance: z.number().optional(),
  })),
  query: z.string(),
});

export async function webSearch(input: z.infer<typeof webSearchSchema>): Promise<z.infer<typeof webSearchOutputSchema>> {
  try {
    // Use DuckDuckGo HTML search (no API key needed)
    const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(input.query)}`;
    
    const response = await fetch(searchUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; ZipBot/1.0)",
      },
    });
    
    if (!response.ok) {
      throw new Error(`Search failed: ${response.status}`);
    }
    
    const html = await response.text();
    
    // Simple HTML parsing to extract results
    // This is a basic implementation - in production, you might want to use a proper HTML parser
    const results: Array<{ title: string; snippet: string; url: string }> = [];
    
    // Extract links and snippets from DuckDuckGo HTML
    const linkPattern = /<a class="result__a"[^>]*href="([^"]+)"[^>]*>([^<]+)<\/a>/g;
    const snippetPattern = /<a class="result__snippet"[^>]*>([^<]+)<\/a>/g;
    
    const links: Array<{ url: string; title: string }> = [];
    let match;
    while ((match = linkPattern.exec(html)) !== null && links.length < input.maxResults) {
      links.push({
        url: match[1],
        title: match[2].trim(),
      });
    }
    
    const snippets: string[] = [];
    while ((match = snippetPattern.exec(html)) !== null && snippets.length < input.maxResults) {
      snippets.push(match[1].trim());
    }
    
    // Combine links and snippets
    for (let i = 0; i < Math.min(links.length, input.maxResults); i++) {
      results.push({
        title: links[i].title,
        url: links[i].url,
        snippet: snippets[i] || "",
      });
    }
    
    // Map results to our schema
    const mappedResults = results.map((result, index) => ({
      title: result.title || "No title",
      snippet: result.snippet || "",
      url: result.url || "",
      relevance: 1 - index * 0.1, // Simple relevance scoring
    }));
    
    return {
      results: mappedResults,
      query: input.query,
    };
  } catch (error) {
    console.error("Web search error:", error);
    
    // Fallback: return empty results
    return {
      results: [],
      query: input.query,
    };
  }
}

