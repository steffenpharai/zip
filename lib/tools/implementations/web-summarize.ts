/**
 * Source summarization tool
 * 
 * Summarizes multiple sources with citations
 */

import { z } from "zod";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export const summarizeSourcesSchema = z.object({
  sources: z.array(z.object({
    title: z.string(),
    url: z.string(),
    content: z.string(),
    snippet: z.string().optional(),
  })).min(1).max(10),
  query: z.string().optional(),
});

export const summarizeSourcesOutputSchema = z.object({
  summary: z.string(),
  citations: z.array(z.object({
    url: z.string(),
    title: z.string(),
    quote: z.string(),
  })),
});

export async function summarizeSources(input: z.infer<typeof summarizeSourcesSchema>): Promise<z.infer<typeof summarizeSourcesOutputSchema>> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY not configured");
  }
  
  const model = process.env.OPENAI_RESPONSES_MODEL || "gpt-4o";
  
  // Build prompt with sources
  const sourcesText = input.sources
    .map((source, index) => {
      return `[Source ${index + 1}]
Title: ${source.title}
URL: ${source.url}
Content: ${source.content.substring(0, 2000)}${source.content.length > 2000 ? "..." : ""}
`;
    })
    .join("\n");
  
  const query = input.query || "Summarize the key information from these sources";
  
  const prompt = `${query}

Sources:
${sourcesText}

Please provide a concise summary (3-5 sentences) and include 2-4 relevant citations with quotes from the sources. Format citations as:
- [Source Title](URL): "quote from source"

Summary:`;
  
  const response = await openai.chat.completions.create({
    model,
    messages: [
      {
        role: "system",
        content: "You are a research assistant. Summarize information from sources and provide accurate citations with quotes.",
      },
      {
        role: "user",
        content: prompt,
      },
    ],
    max_tokens: 1000,
  });
  
  const summary = response.choices[0]?.message?.content || "Unable to generate summary";
  
  // Extract citations from summary (look for [Title](URL) patterns)
  const citationPattern = /\[([^\]]+)\]\(([^)]+)\)/g;
  const citations: Array<{ url: string; title: string; quote: string }> = [];
  let match;
  
  while ((match = citationPattern.exec(summary)) !== null) {
    const title = match[1];
    const url = match[2];
    
    // Try to find a quote near the citation
    const quoteStart = match.index + match[0].length;
    const quoteEnd = Math.min(quoteStart + 200, summary.length);
    const quote = summary.substring(quoteStart, quoteEnd).trim().replace(/^[":\s]+/, "").substring(0, 150);
    
    citations.push({
      url,
      title,
      quote: quote || "See source",
    });
  }
  
  // If no citations found, create them from sources
  if (citations.length === 0 && input.sources.length > 0) {
    citations.push({
      url: input.sources[0].url,
      title: input.sources[0].title,
      quote: input.sources[0].snippet || input.sources[0].content.substring(0, 150),
    });
  }
  
  return {
    summary,
    citations: citations.slice(0, 4), // Max 4 citations
  };
}

