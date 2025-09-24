import Database from 'better-sqlite3';
import path from 'path';
import { OpenAI } from 'openai';
import type { ChunkDocument, Settings } from '../types';

export class RAGSystem {
  private db: Database.Database;
  private vaultPath: string;
  private openai?: OpenAI;
  private settings?: Settings;

  constructor(vaultPath: string, settings?: Settings) {
    this.vaultPath = vaultPath;
    this.settings = settings;
    const dbPath = path.join(vaultPath, 'indices', 'embeddings.sqlite');
    this.db = new Database(dbPath);
    
    if (settings?.api_key) {
      this.openai = new OpenAI({ apiKey: settings.api_key });
    }
    
    this.initializeDatabase();
  }

  private initializeDatabase() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS documents (
        id TEXT PRIMARY KEY,
        path TEXT NOT NULL,
        title TEXT,
        date TEXT,
        hash TEXT
      );

      CREATE TABLE IF NOT EXISTS chunks (
        id TEXT PRIMARY KEY,
        document_id TEXT,
        heading TEXT,
        text TEXT,
        tokens INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (document_id) REFERENCES documents(id)
      );

      CREATE TABLE IF NOT EXISTS embeddings (
        chunk_id TEXT PRIMARY KEY,
        embedding BLOB,
        model TEXT,
        FOREIGN KEY (chunk_id) REFERENCES chunks(id)
      );

      CREATE INDEX IF NOT EXISTS idx_chunks_document ON chunks(document_id);
      CREATE INDEX IF NOT EXISTS idx_documents_date ON documents(date);
    `);
  }

  async chunkDocument(content: string, metadata: any): Promise<ChunkDocument[]> {
    const chunks: ChunkDocument[] = [];
    const lines = content.split('\n');
    let currentChunk = '';
    let currentHeading = '';
    
    for (const line of lines) {
      if (line.startsWith('#')) {
        if (currentChunk) {
          chunks.push({
            id: `${metadata.path}-${chunks.length}`,
            path: metadata.path,
            heading: currentHeading,
            text: currentChunk.trim(),
            date: metadata.date
          });
          currentChunk = '';
        }
        currentHeading = line.replace(/^#+\s*/, '');
      }
      
      currentChunk += line + '\n';
      
      // Create chunk if it's getting too long (roughly 400-800 tokens)
      if (currentChunk.split(' ').length > 150) {
        chunks.push({
          id: `${metadata.path}-${chunks.length}`,
          path: metadata.path,
          heading: currentHeading,
          text: currentChunk.trim(),
          date: metadata.date
        });
        currentChunk = '';
      }
    }
    
    // Don't forget the last chunk
    if (currentChunk.trim()) {
      chunks.push({
        id: `${metadata.path}-${chunks.length}`,
        path: metadata.path,
        heading: currentHeading,
        text: currentChunk.trim(),
        date: metadata.date
      });
    }
    
    return chunks;
  }

  async embedText(text: string): Promise<number[]> {
    if (this.openai && this.settings?.embedding_model) {
      try {
        const response = await this.openai.embeddings.create({
          model: this.settings.embedding_model || 'text-embedding-3-small',
          input: text
        });
        return response.data[0].embedding;
      } catch (error) {
        console.error('OpenAI embedding error:', error);
        return this.createSimpleEmbedding(text);
      }
    }
    
    // Fallback to simple embedding if no API configured
    return this.createSimpleEmbedding(text);
  }

  private createSimpleEmbedding(text: string): number[] {
    // Simple fallback embedding for development/testing
    // This creates a 1536-dim vector (matching OpenAI's dimension)
    const embedding = new Array(1536).fill(0);
    for (let i = 0; i < text.length; i++) {
      embedding[i % 1536] += text.charCodeAt(i) / 1000;
    }
    // Normalize
    const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
    return embedding.map(val => val / magnitude);
  }

  async indexDocument(path: string, content: string, metadata: any) {
    const documentId = path;
    
    // Insert document
    const insertDoc = this.db.prepare(`
      INSERT OR REPLACE INTO documents (id, path, title, date, hash)
      VALUES (?, ?, ?, ?, ?)
    `);
    insertDoc.run(documentId, path, metadata.title || '', metadata.date, metadata.hash || '');
    
    // Chunk and index
    const chunks = await this.chunkDocument(content, { ...metadata, path });
    
    for (const chunk of chunks) {
      // Insert chunk
      const insertChunk = this.db.prepare(`
        INSERT OR REPLACE INTO chunks (id, document_id, heading, text, tokens)
        VALUES (?, ?, ?, ?, ?)
      `);
      insertChunk.run(chunk.id, documentId, chunk.heading, chunk.text, chunk.text.split(' ').length);
      
      // Create and store embedding
      const embedding = await this.embedText(chunk.text);
      const insertEmbedding = this.db.prepare(`
        INSERT OR REPLACE INTO embeddings (chunk_id, embedding, model)
        VALUES (?, ?, ?)
      `);
      insertEmbedding.run(
        chunk.id, 
        Buffer.from(new Float32Array(embedding).buffer),
        this.settings?.embedding_model || 'simple'
      );
    }
  }

  async search(query: string, k: number = 5, recencyBoost: number = 0.2): Promise<ChunkDocument[]> {
    const queryEmbedding = await this.embedText(query);
    
    // Get all chunks with embeddings
    const chunks = this.db.prepare(`
      SELECT c.*, e.embedding, d.date
      FROM chunks c
      JOIN embeddings e ON c.id = e.chunk_id
      JOIN documents d ON c.document_id = d.id
      ORDER BY d.date DESC
      LIMIT 100
    `).all();
    
    // Calculate similarity scores
    const scored = chunks.map(chunk => {
      const embedding = new Float32Array(chunk.embedding.buffer);
      const similarity = this.cosineSimilarity(queryEmbedding, Array.from(embedding));
      
      // Apply recency boost
      const daysAgo = Math.floor((Date.now() - new Date(chunk.date).getTime()) / (1000 * 60 * 60 * 24));
      const recencyScore = Math.exp(-daysAgo * 0.1) * recencyBoost;
      
      return {
        ...chunk,
        score: similarity + recencyScore
      };
    });
    
    // Sort by score and return top k
    scored.sort((a, b) => b.score - a.score);
    
    return scored.slice(0, k).map(chunk => ({
      id: chunk.id,
      path: chunk.document_id,
      heading: chunk.heading,
      text: chunk.text,
      date: chunk.date
    }));
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      // Handle dimension mismatch gracefully
      const minLen = Math.min(a.length, b.length);
      a = a.slice(0, minLen);
      b = b.slice(0, minLen);
    }
    
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  close() {
    this.db.close();
  }
}
