/**
 * Audit logger for tool execution
 * 
 * Writes audit logs to ./data/audit.log in JSONL format
 */

import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { existsSync } from "fs";
import type { PermissionTier } from "@/lib/tools/registry";

export interface AuditEntry {
  request_id: string;
  tool_name: string;
  permission_tier: PermissionTier;
  user_input?: string;
  tool_input: unknown;
  tool_output: unknown;
  timing_ms: number;
  error?: string;
  ts: number;
}

const AUDIT_LOG_FILE = join(process.cwd(), "data", "audit.log");

/**
 * Ensure data directory exists
 */
async function ensureDataDir(): Promise<void> {
  const dataDir = join(process.cwd(), "data");
  if (!existsSync(dataDir)) {
    await mkdir(dataDir, { recursive: true });
  }
}

/**
 * Write an audit entry to file
 */
export async function writeAuditLog(entry: AuditEntry): Promise<void> {
  try {
    await ensureDataDir();
    
    const line = JSON.stringify(entry) + "\n";
    await writeFile(AUDIT_LOG_FILE, line, { flag: "a" });
  } catch (error) {
    // Don't throw - audit logging should not break the application
    console.error("Failed to write audit log:", error);
  }
}

/**
 * Queue audit log entry (non-blocking)
 */
const auditQueue: AuditEntry[] = [];
let isProcessingAudit = false;

async function processAuditQueue(): Promise<void> {
  if (isProcessingAudit || auditQueue.length === 0) return;
  
  isProcessingAudit = true;
  try {
    while (auditQueue.length > 0) {
      const entry = auditQueue.shift();
      if (entry) {
        await writeAuditLog(entry);
      }
    }
  } finally {
    isProcessingAudit = false;
  }
}

export function queueAuditLog(entry: AuditEntry): void {
  auditQueue.push(entry);
  // Process queue asynchronously
  processAuditQueue().catch(console.error);
}

