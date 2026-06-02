/**
 * Web-safe URL opening tool
 * 
 * Returns instruction for client to open URL in new tab
 */

import { z } from "zod";

export const openUrlSchema = z.object({
  url: z.string().url().refine(
    (url) => {
      // Reject unsafe protocols
      const lower = url.toLowerCase();
      return !lower.startsWith("file://") &&
             !lower.startsWith("javascript:") &&
             !lower.startsWith("data:") &&
             (lower.startsWith("http://") || lower.startsWith("https://"));
    },
    { message: "URL must use http:// or https:// protocol" }
  ),
});

export const openUrlOutputSchema = z.object({
  url: z.string(),
  action: z.literal("open"),
  instruction: z.string(),
});

export async function openUrl(input: z.infer<typeof openUrlSchema>): Promise<z.infer<typeof openUrlOutputSchema>> {
  return {
    url: input.url,
    action: "open",
    instruction: `Open URL in new tab: ${input.url}`,
  };
}

