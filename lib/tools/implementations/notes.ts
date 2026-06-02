/**
 * Notes CRUD tools
 * 
 * Store notes in SQLite database
 */

import Database from "better-sqlite3";
import { join } from "path";
import { existsSync, mkdirSync } from "fs";
import { z } from "zod";

const DATA_DIR = join(process.cwd(), "data");
const NOTES_DB_PATH = join(DATA_DIR, "notes.db");

// Ensure data directory exists
if (!existsSync(DATA_DIR)) {
  mkdirSync(DATA_DIR, { recursive: true });
}

let db: Database.Database | null = null;

function getDb(): Database.Database {
  if (!db) {
    db = new Database(NOTES_DB_PATH);
    
    db.exec(`
      CREATE TABLE IF NOT EXISTS notes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        body TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      
      CREATE INDEX IF NOT EXISTS idx_notes_title ON notes(title);
      CREATE INDEX IF NOT EXISTS idx_notes_created ON notes(created_at);
    `);
  }
  return db;
}

export const createNoteSchema = z.object({
  title: z.string().min(1).max(200),
  body: z.string().min(1).max(10000),
});

export const createNoteOutputSchema = z.object({
  id: z.number(),
  title: z.string(),
  body: z.string(),
  created_at: z.number(),
});

export async function createNote(input: z.infer<typeof createNoteSchema>): Promise<z.infer<typeof createNoteOutputSchema>> {
  const database = getDb();
  const now = Date.now();
  
  const result = database.prepare(`
    INSERT INTO notes (title, body, created_at, updated_at)
    VALUES (?, ?, ?, ?)
  `).run(input.title, input.body, now, now);
  
  return {
    id: Number(result.lastInsertRowid),
    title: input.title,
    body: input.body,
    created_at: now,
  };
}

export const listNotesOutputSchema = z.object({
  notes: z.array(z.object({
    id: z.number(),
    title: z.string(),
    body: z.string(),
    created_at: z.number(),
    updated_at: z.number(),
  })),
});

export async function listNotes(): Promise<z.infer<typeof listNotesOutputSchema>> {
  const database = getDb();
  const rows = database.prepare(`
    SELECT id, title, body, created_at, updated_at
    FROM notes
    ORDER BY updated_at DESC
  `).all() as Array<{
    id: number;
    title: string;
    body: string;
    created_at: number;
    updated_at: number;
  }>;
  
  return { notes: rows };
}

export const searchNotesSchema = z.object({
  query: z.string().min(1),
});

export const searchNotesOutputSchema = z.object({
  notes: z.array(z.object({
    id: z.number(),
    title: z.string(),
    body: z.string(),
    created_at: z.number(),
    updated_at: z.number(),
    relevance: z.number().optional(),
  })),
});

export async function searchNotes(input: z.infer<typeof searchNotesSchema>): Promise<z.infer<typeof searchNotesOutputSchema>> {
  const database = getDb();
  const query = `%${input.query}%`;
  
  const rows = database.prepare(`
    SELECT id, title, body, created_at, updated_at
    FROM notes
    WHERE title LIKE ? OR body LIKE ?
    ORDER BY updated_at DESC
    LIMIT 50
  `).all(query, query) as Array<{
    id: number;
    title: string;
    body: string;
    created_at: number;
    updated_at: number;
  }>;
  
  return { notes: rows };
}

export const deleteNoteSchema = z.object({
  id: z.number().int().positive(),
});

export const deleteNoteOutputSchema = z.object({
  success: z.boolean(),
  id: z.number(),
});

export async function deleteNote(input: z.infer<typeof deleteNoteSchema>): Promise<z.infer<typeof deleteNoteOutputSchema>> {
  const database = getDb();
  const result = database.prepare("DELETE FROM notes WHERE id = ?").run(input.id);
  
  return {
    success: result.changes > 0,
    id: input.id,
  };
}

