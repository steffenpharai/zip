/**
 * Document search tool
 * 
 * Vector search for relevant chunks using embeddings
 */

import { z } from "zod";
import Database from "better-sqlite3";
import { join } from "path";
import { existsSync } from "fs";
import { generateEmbedding, cosineSimilarity } from "@/lib/utils/embeddings";

const DATA_DIR = join(process.cwd(), "data");
const DOCS_DB_PATH = join(DATA_DIR, "docs.db");

let db: Database.Database | null = null;

function getDb(): Database.Database {
  if (!db) {
    if (!existsSync(DOCS_DB_PATH)) {
      throw new Error("Documents database not found. Please ingest documents first.");
    }
    db = new Database(DOCS_DB_PATH);
  }
  return db;
}

export const docSearchSchema = z.object({
  query: z.string().min(1),
  maxResults: z.number().int().positive().max(10).default(5),
  docId: z.string().optional(),
});

export const docSearchOutputSchema = z.object({
  chunks: z.array(z.object({
    id: z.string(),
    text: z.string(),
    doc_id: z.string(),
    filename: z.string(),
    relevance: z.number(),
  })),
});

export async function docSearch(input: z.infer<typeof docSearchSchema>): Promise<z.infer<typeof docSearchOutputSchema>> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY not configured");
  }
  
  const database = getDb();
  
  // Generate query embedding
  const queryEmbedding = await generateEmbedding(input.query);
  
  // Get all chunks (or filtered by doc_id)
  let chunksQuery = `
    SELECT c.chunk_id, c.doc_id, c.text, c.embedding, d.filename
    FROM chunks c
    JOIN documents d ON c.doc_id = d.doc_id
  `;
  
  const params: unknown[] = [];
  if (input.docId) {
    chunksQuery += " WHERE c.doc_id = ?";
    params.push(input.docId);
  }
  
  const rows = database.prepare(chunksQuery).all(...params) as Array<{
    chunk_id: string;
    doc_id: string;
    text: string;
    embedding: string;
    filename: string;
  }>;
  
  // Compute similarities
  const similarities = rows.map(row => {
    const chunkEmbedding = JSON.parse(row.embedding) as number[];
    const relevance = cosineSimilarity(queryEmbedding, chunkEmbedding);
    return {
      id: row.chunk_id,
      text: row.text,
      doc_id: row.doc_id,
      filename: row.filename,
      relevance,
    };
  });
  
  // Sort by relevance and take top results
  const topChunks = similarities
    .sort((a, b) => b.relevance - a.relevance)
    .slice(0, input.maxResults);
  
  return {
    chunks: topChunks,
  };
}

