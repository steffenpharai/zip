/**
 * Document ingestion tool
 * 
 * Extracts text from PDFs, chunks it, and stores with embeddings
 */

import { z } from "zod";
import pdfParse from "pdf-parse";
import OpenAI from "openai";
import Database from "better-sqlite3";
import { join } from "path";
import { existsSync, mkdirSync, readFileSync } from "fs";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const DATA_DIR = join(process.cwd(), "data");
const DOCS_DB_PATH = join(DATA_DIR, "docs.db");

if (!existsSync(DATA_DIR)) {
  mkdirSync(DATA_DIR, { recursive: true });
}

let db: Database.Database | null = null;

function getDb(): Database.Database {
  if (!db) {
    db = new Database(DOCS_DB_PATH);
    
    db.exec(`
      CREATE TABLE IF NOT EXISTS documents (
        doc_id TEXT PRIMARY KEY,
        filename TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      
      CREATE TABLE IF NOT EXISTS chunks (
        chunk_id TEXT PRIMARY KEY,
        doc_id TEXT NOT NULL,
        text TEXT NOT NULL,
        embedding TEXT,
        chunk_index INTEGER NOT NULL,
        FOREIGN KEY (doc_id) REFERENCES documents(doc_id)
      );
      
      CREATE INDEX IF NOT EXISTS idx_chunks_doc_id ON chunks(doc_id);
    `);
  }
  return db;
}

/**
 * Chunk text into overlapping segments
 */
function chunkText(text: string, chunkSize: number = 1000, overlap: number = 100): string[] {
  const chunks: string[] = [];
  let start = 0;
  
  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    chunks.push(text.substring(start, end));
    start = end - overlap;
  }
  
  return chunks;
}

/**
 * Generate embedding for text
 */
async function generateEmbedding(text: string): Promise<number[]> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY not configured");
  }
  
  const response = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: text.substring(0, 8000), // Limit input length
  });
  
  return response.data[0].embedding;
}

export const ingestDocumentSchema = z.object({
  filename: z.string(),
  fileData: z.string().describe("Base64-encoded file data"),
  fileType: z.enum(["pdf", "txt"]).default("pdf"),
});

export const ingestDocumentOutputSchema = z.object({
  doc_id: z.string(),
  filename: z.string(),
  chunks_count: z.number(),
  created_at: z.number(),
});

export async function ingestDocument(input: z.infer<typeof ingestDocumentSchema>): Promise<z.infer<typeof ingestDocumentOutputSchema>> {
  const database = getDb();
  const docId = `doc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const now = Date.now();
  
  // Decode file data
  const fileBuffer = Buffer.from(input.fileData, "base64");
  
  // Extract text
  let text: string;
  if (input.fileType === "pdf") {
    const pdfData = await pdfParse(fileBuffer);
    text = pdfData.text;
  } else {
    text = fileBuffer.toString("utf-8");
  }
  
  if (!text || text.trim().length === 0) {
    throw new Error("No text extracted from document");
  }
  
  // Chunk text
  const chunks = chunkText(text, 1000, 100);
  
  // Generate embeddings and store chunks
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const chunkId = `${docId}_chunk_${i}`;
    
    // Generate embedding
    const embedding = await generateEmbedding(chunk);
    
    // Store chunk
    database.prepare(`
      INSERT INTO chunks (chunk_id, doc_id, text, embedding, chunk_index)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      chunkId,
      docId,
      chunk,
      JSON.stringify(embedding),
      i
    );
  }
  
  // Store document metadata
  database.prepare(`
    INSERT INTO documents (doc_id, filename, created_at)
    VALUES (?, ?, ?)
  `).run(docId, input.filename, now);
  
  return {
    doc_id: docId,
    filename: input.filename,
    chunks_count: chunks.length,
    created_at: now,
  };
}

