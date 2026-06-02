/**
 * Trace writer for observability
 * 
 * Writes traces to ./data/traces/ directory in JSONL format
 */

import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { existsSync } from "fs";

export interface TraceEntry {
  request_id: string;
  step_id: string;
  parent_id?: string;
  tool_name?: string;
  input?: unknown;
  output?: unknown;
  timing_ms: number;
  error?: string;
  ts: number;
}

const TRACES_DIR = join(process.cwd(), "data", "traces");

/**
 * Ensure traces directory exists
 */
async function ensureTracesDir(): Promise<void> {
  if (!existsSync(TRACES_DIR)) {
    await mkdir(TRACES_DIR, { recursive: true });
  }
}

/**
 * Write a trace entry to file
 */
export async function writeTrace(entry: TraceEntry): Promise<void> {
  try {
    await ensureTracesDir();
    
    // Write to daily trace file
    const date = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
    const traceFile = join(TRACES_DIR, `trace_${date}.jsonl`);
    
    const line = JSON.stringify(entry) + "\n";
    await writeFile(traceFile, line, { flag: "a" });
  } catch (error) {
    // Don't throw - tracing should not break the application
    console.error("Failed to write trace:", error);
  }
}

/**
 * Write a trace entry synchronously (for critical paths)
 * Uses a queue to avoid blocking
 */
const traceQueue: TraceEntry[] = [];
let isProcessing = false;

async function processTraceQueue(): Promise<void> {
  if (isProcessing || traceQueue.length === 0) return;
  
  isProcessing = true;
  try {
    while (traceQueue.length > 0) {
      const entry = traceQueue.shift();
      if (entry) {
        await writeTrace(entry);
      }
    }
  } finally {
    isProcessing = false;
  }
}

export function queueTrace(entry: TraceEntry): void {
  traceQueue.push(entry);
  // Process queue asynchronously
  processTraceQueue().catch(console.error);
}

