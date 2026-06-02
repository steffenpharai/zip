/**
 * SQLite-based memory storage for pinned memory
 */

import Database from "better-sqlite3";
import { join } from "path";
import { existsSync, mkdirSync } from "fs";

const DATA_DIR = join(process.cwd(), "data");
const MEMORY_DB_PATH = join(DATA_DIR, "memory.db");

// Ensure data directory exists
if (!existsSync(DATA_DIR)) {
  mkdirSync(DATA_DIR, { recursive: true });
}

let db: Database.Database | null = null;

/**
 * Get or create database connection
 */
function getDb(): Database.Database {
  if (!db) {
    db = new Database(MEMORY_DB_PATH);
    
    // Create memory table if it doesn't exist
    db.exec(`
      CREATE TABLE IF NOT EXISTS memory (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        key TEXT NOT NULL UNIQUE,
        value TEXT NOT NULL,
        pinned INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      
      CREATE INDEX IF NOT EXISTS idx_memory_key ON memory(key);
      CREATE INDEX IF NOT EXISTS idx_memory_pinned ON memory(pinned);
    `);
  }
  return db;
}

export interface MemoryEntry {
  id: number;
  key: string;
  value: string;
  pinned: boolean;
  created_at: number;
  updated_at: number;
}

interface MemoryRow {
  id: number;
  key: string;
  value: string;
  pinned: number; // SQLite returns INTEGER as number
  created_at: number;
  updated_at: number;
}

/**
 * Add or update a memory entry
 */
export function setMemory(key: string, value: string, pinned: boolean = true): void {
  const database = getDb();
  const now = Date.now();
  
  database.prepare(`
    INSERT INTO memory (key, value, pinned, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET
      value = excluded.value,
      pinned = excluded.pinned,
      updated_at = excluded.updated_at
  `).run(key, value, pinned ? 1 : 0, now, now);
}

/**
 * Get a memory entry by key
 */
export function getMemory(key: string): MemoryEntry | null {
  const database = getDb();
  const row = database.prepare("SELECT * FROM memory WHERE key = ?").get(key) as MemoryRow | undefined;
  
  if (!row) return null;
  
  return {
    ...row,
    pinned: row.pinned === 1,
  };
}

/**
 * Get all pinned memory entries
 */
export function getAllPinnedMemory(): MemoryEntry[] {
  const database = getDb();
  const rows = database.prepare("SELECT * FROM memory WHERE pinned = 1 ORDER BY updated_at DESC").all() as MemoryRow[];
  
  return rows.map(row => ({
    ...row,
    pinned: row.pinned === 1,
  }));
}

/**
 * Delete a memory entry by key
 */
export function deleteMemory(key: string): boolean {
  const database = getDb();
  const result = database.prepare("DELETE FROM memory WHERE key = ?").run(key);
  return result.changes > 0;
}

/**
 * Search memory entries by key pattern
 */
export function searchMemory(pattern: string): MemoryEntry[] {
  const database = getDb();
  const rows = database.prepare("SELECT * FROM memory WHERE key LIKE ? ORDER BY updated_at DESC").all(`%${pattern}%`) as MemoryRow[];
  
  return rows.map(row => ({
    ...row,
    pinned: row.pinned === 1,
  }));
}

/**
 * Close database connection (for cleanup)
 */
export function closeMemoryStore(): void {
  if (db) {
    db.close();
    db = null;
  }
}

