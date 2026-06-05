/**
 * Memory management logic
 * 
 * Handles session memory (ephemeral) and pinned memory (persistent)
 */

import {
  setMemory,
  getMemory,
  getAllPinnedMemory,
  deleteMemory,
  searchMemory,
  type MemoryEntry,
} from "./memory-store";

// Session memory (ephemeral, in-memory)
const sessionMemory = new Map<string, string>();

/**
 * Add session memory (ephemeral)
 */
export function addSessionMemory(key: string, value: string): void {
  sessionMemory.set(key, value);
}

/**
 * Get session memory
 */
export function getSessionMemory(key: string): string | undefined {
  return sessionMemory.get(key);
}

/**
 * Clear all session memory
 */
export function clearSessionMemory(): void {
  sessionMemory.clear();
}

/**
 * Add pinned memory (persistent)
 */
export function addPinnedMemory(key: string, value: string): void {
  setMemory(key, value, true);
}

/**
 * Get pinned memory by key
 */
export function getPinnedMemory(key: string): MemoryEntry | null {
  return getMemory(key);
}

/**
 * Get all pinned memory entries
 */
export function getAllPinned(): MemoryEntry[] {
  return getAllPinnedMemory();
}

/**
 * Delete pinned memory
 */
export function deletePinnedMemory(key: string): boolean {
  return deleteMemory(key);
}

/**
 * Search pinned memory
 */
export function searchPinnedMemory(pattern: string): MemoryEntry[] {
  return searchMemory(pattern);
}

/**
 * Parse memory commands from user input
 * Commands: "remember X", "forget X", "what do you remember"
 */
export interface ParsedMemoryCommand {
  type: "remember" | "forget" | "list" | null;
  key?: string;
  value?: string;
}

export function parseMemoryCommand(input: string): ParsedMemoryCommand | null {
  const lower = input.toLowerCase().trim();
  
  // "remember X" or "remember that X"
  const rememberMatch = lower.match(/^remember\s+(?:that\s+)?(.+)$/);
  if (rememberMatch) {
    const value = rememberMatch[1].trim();
    // Extract key from value (first few words) or use hash
    const key = value.substring(0, 50).replace(/\s+/g, "_").toLowerCase();
    return { type: "remember", key, value };
  }
  
  // "forget X" or "forget about X"
  const forgetMatch = lower.match(/^forget\s+(?:about\s+)?(.+)$/);
  if (forgetMatch) {
    const key = forgetMatch[1].trim().toLowerCase();
    return { type: "forget", key };
  }
  
  // "what do you remember" or "show me what you remember"
  if (lower.match(/^(what\s+do\s+you\s+remember|show\s+me\s+what\s+you\s+remember|list\s+memory)$/)) {
    return { type: "list" };
  }
  
  return null;
}

/**
 * Format pinned memory for inclusion in system prompt
 */
export function formatPinnedMemoryForPrompt(): string {
  const memories = getAllPinned();
  if (memories.length === 0) {
    return "";
  }
  
  const lines = memories.map(m => `- ${m.key}: ${m.value}`);
  return `\n\nPinned Memory:\n${lines.join("\n")}`;
}

