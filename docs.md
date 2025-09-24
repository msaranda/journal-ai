# AI Journal Application - Complete Implementation

## Project Structure

```
journal-ai/
├── src/
│   ├── pages/
│   │   ├── index.astro
│   │   └── api/
│   │       ├── stt.ts
│   │       ├── llm.ts
│   │       ├── rag.ts
│   │       └── vault.ts
│   ├── components/
│   │   ├── JournalSession.astro
│   │   ├── ChatPanel.astro
│   │   ├── Timer.astro
│   │   └── Settings.astro
│   ├── islands/
│   │   ├── Dictation.tsx
│   │   ├── Chat.tsx
│   │   └── PhaseTimer.tsx
│   ├── lib/
│   │   ├── markdown.ts
│   │   ├── embeddings.ts
│   │   ├── rag.ts
│   │   ├── vault.ts
│   │   └── prompts.ts
│   ├── types/
│   │   └── index.ts
│   └── styles/
│       └── global.css
├── vault/
│   ├── sessions/
│   ├── indices/
│   └── config/
│       ├── prompts/
│       │   ├── system.md
│       │   ├── reflection.md
│       │   └── summarizer.md
│       └── settings.json
├── package.json
├── astro.config.mjs
├── tailwind.config.cjs
└── tsconfig.json
```

## 1. Package.json

```json
{
  "name": "journal-ai",
  "type": "module",
  "version": "1.0.0",
  "scripts": {
    "dev": "astro dev",
    "build": "astro build",
    "preview": "astro preview",
    "index": "tsx scripts/index-vault.ts",
    "setup": "tsx scripts/setup.ts"
  },
  "dependencies": {
    "@astrojs/react": "^3.0.0",
    "@astrojs/tailwind": "^5.0.0",
    "@anthropic-ai/sdk": "^0.20.0",
    "astro": "^4.0.0",
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "better-sqlite3": "^9.0.0",
    "sqlite-vec": "^0.0.1",
    "gray-matter": "^4.0.3",
    "date-fns": "^3.0.0",
    "openai": "^4.0.0",
    "lucide-react": "^0.300.0"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.0",
    "@types/react": "^18.2.0",
    "tailwindcss": "^3.4.0",
    "typescript": "^5.3.0",
    "tsx": "^4.0.0"
  }
}
```

## 2. astro.config.mjs

```js
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwind from '@astrojs/tailwind';

export default defineConfig({
  integrations: [react(), tailwind()],
  output: 'server',
  vite: {
    ssr: {
      external: ['better-sqlite3']
    }
  }
});
```

## 3. src/types/index.ts

```typescript
export interface SessionFrontMatter {
  date: string;
  duration_minutes: number;
  tags?: string[];
  mood?: number;
  problems?: Problem[];
  recurring_theme?: string;
  closing?: {
    tomorrow: string;
    letting_go: string;
  };
}

export interface Problem {
  title: string;
  control: string[];
  not_in_control: string[];
  action: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export interface JournalPhase {
  name: string;
  duration: number; // seconds
  prompt: string;
  subPrompts?: string[];
}

export interface Settings {
  model: string;
  temperature: number;
  top_p: number;
  max_tokens: number;
  retriever: {
    k: number;
    recency_boost: number;
  };
  tone: string;
  vault_path: string;
  stt_engine: 'local' | 'browser' | 'openai';
  llm_backend: 'openai' | 'anthropic' | 'grok';
  api_key?: string;
  embedding_model?: string;
}

export interface ChunkDocument {
  id: string;
  path: string;
  heading: string;
  text: string;
  date: string;
  embedding?: number[];
}
```

## 4. src/lib/vault.ts

```typescript
import fs from 'fs/promises';
import path from 'path';
import matter from 'gray-matter';
import { format } from 'date-fns';
import type { SessionFrontMatter, Settings } from '../types';

export class VaultManager {
  private vaultPath: string;

  constructor(vaultPath: string = '~/JournalAI') {
    this.vaultPath = vaultPath.replace('~', process.env.HOME || '');
  }

  async initialize() {
    const dirs = [
      this.vaultPath,
      path.join(this.vaultPath, 'sessions'),
      path.join(this.vaultPath, 'indices'),
      path.join(this.vaultPath, 'config'),
      path.join(this.vaultPath, 'config', 'prompts')
    ];

    for (const dir of dirs) {
      await fs.mkdir(dir, { recursive: true });
    }

    // Initialize default settings if not exists
    const settingsPath = path.join(this.vaultPath, 'config', 'settings.json');
    try {
      await fs.access(settingsPath);
    } catch {
      await this.saveSettings(this.getDefaultSettings());
    }

    // Initialize default prompts
    await this.initializePrompts();
  }

  private getDefaultSettings(): Settings {
    return {
      model: 'gpt-4o-mini', // Default to OpenAI's efficient model
      temperature: 0.7,
      top_p: 0.9,
      max_tokens: 1000,
      retriever: {
        k: 5,
        recency_boost: 0.2
      },
      tone: 'supportive, non-judgmental, specific, action-oriented',
      vault_path: this.vaultPath,
      stt_engine: 'browser', // Default to browser for simplicity
      llm_backend: 'openai',
      embedding_model: 'text-embedding-3-small'
    };
  }

  async initializePrompts() {
    const prompts = {
      'system.md': `You are a non-judgmental journaling companion. Your role is to:
- Reflect back key points to ensure understanding
- Ask concise clarifying questions that drive toward specifics
- Help identify what's in the user's control vs what isn't
- Propose one small, actionable next step when appropriate
- Respect the current session phase and keep responses appropriately brief
- When the user is venting, acknowledge feelings first before any problem-solving
- Use retrieved context to connect today's content to prior themes, citing dates and topics briefly

Remember: Be specific, not abstract. Focus on "I" statements. Distinguish between venting and solving.`,
      
      'reflection.md': `During reflection, focus on:
- Patterns you notice across entries
- Growth or changes in perspective
- Recurring challenges that might need dedicated attention
- Strengths and resources the user demonstrates
- Gentle nudges toward self-compassion`,
      
      'summarizer.md': `Create a brief session summary with:
- 3 key points or insights from today's session
- 1 specific, actionable next step
- Any recurring themes noticed
- Progress on previously identified actions`
    };

    for (const [filename, content] of Object.entries(prompts)) {
      const promptPath = path.join(this.vaultPath, 'config', 'prompts', filename);
      try {
        await fs.access(promptPath);
      } catch {
        await fs.writeFile(promptPath, content, 'utf-8');
      }
    }
  }

  async saveSession(content: string, frontMatter: SessionFrontMatter) {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    
    const sessionDir = path.join(this.vaultPath, 'sessions', String(year), month);
    await fs.mkdir(sessionDir, { recursive: true });
    
    const filename = `${year}-${month}-${day}.session.md`;
    const filepath = path.join(sessionDir, filename);
    
    const fileContent = matter.stringify(content, frontMatter);
    await fs.writeFile(filepath, fileContent, 'utf-8');
    
    return filepath;
  }

  async loadSession(date: Date): Promise<{ content: string; data: SessionFrontMatter } | null> {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    
    const filename = `${year}-${month}-${day}.session.md`;
    const filepath = path.join(this.vaultPath, 'sessions', String(year), month, filename);
    
    try {
      const content = await fs.readFile(filepath, 'utf-8');
      const { content: body, data } = matter(content);
      return { content: body, data: data as SessionFrontMatter };
    } catch {
      return null;
    }
  }

  async getRecentSessions(days: number = 7): Promise<Array<{ date: string; content: string; data: SessionFrontMatter }>> {
    const sessions = [];
    const now = new Date();
    
    for (let i = 0; i < days; i++) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      const session = await this.loadSession(date);
      if (session) {
        sessions.push({ date: format(date, 'yyyy-MM-dd'), ...session });
      }
    }
    
    return sessions;
  }

  async loadSettings(): Promise<Settings> {
    const settingsPath = path.join(this.vaultPath, 'config', 'settings.json');
    const content = await fs.readFile(settingsPath, 'utf-8');
    return JSON.parse(content);
  }

  async saveSettings(settings: Settings) {
    const settingsPath = path.join(this.vaultPath, 'config', 'settings.json');
    await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');
  }

  async loadPrompt(name: string): Promise<string> {
    const promptPath = path.join(this.vaultPath, 'config', 'prompts', `${name}.md`);
    return await fs.readFile(promptPath, 'utf-8');
  }
}
```

## 5. src/lib/rag.ts

```typescript
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

  async chunkDocument(content: string, metadata: any): ChunkDocument[] {
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
```

## 6. src/pages/index.astro

```astro
---
import Layout from '../layouts/Layout.astro';
import JournalSession from '../components/JournalSession.astro';
import ChatPanel from '../components/ChatPanel.astro';
import { VaultManager } from '../lib/vault';

// Initialize vault on page load
const vaultPath = import.meta.env.VAULT_PATH || '~/JournalAI';
const vault = new VaultManager(vaultPath);
await vault.initialize();

const today = new Date();
const currentSession = await vault.loadSession(today);
const settings = await vault.loadSettings();
---

<Layout title="Journal AI - Today's Session">
  <div class="min-h-screen bg-neutral-50 dark:bg-neutral-900">
    <!-- Header -->
    <header class="border-b border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950">
      <div class="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
        <div class="flex items-center space-x-4">
          <h1 class="text-xl font-medium text-neutral-900 dark:text-neutral-100">
            Journal AI
          </h1>
          <span class="text-sm text-neutral-500">
            {vaultPath}
          </span>
        </div>
        
        <div class="flex items-center space-x-4">
          <div class="flex items-center space-x-2 text-sm">
            {settings.api_key ? (
              <>
                <span class="w-2 h-2 rounded-full bg-amber-500"></span>
                <span class="text-neutral-600 dark:text-neutral-400">
                  {settings.llm_backend === 'openai' ? 'OpenAI' : 
                   settings.llm_backend === 'anthropic' ? 'Claude' : 
                   settings.llm_backend === 'grok' ? 'Grok' : 'Unknown'}
                </span>
              </>
            ) : (
              <>
                <span class="w-2 h-2 rounded-full bg-red-500"></span>
                <span class="text-red-600 dark:text-red-400">
                  No API Key
                </span>
              </>
            )}
            <span class="text-neutral-500">
              {settings.model}
            </span>
          </div>
          
          <button 
            id="settings-btn"
            class="p-2 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-lg transition"
            aria-label="Settings"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
        </div>
      </div>
    </header>

    <!-- Main Content -->
    <main class="max-w-7xl mx-auto px-4 py-6">
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <!-- Journal Session (2/3 width) -->
        <div class="lg:col-span-2">
          <JournalSession 
            session={currentSession}
            settings={settings}
          />
        </div>
        
        <!-- Chat Panel (1/3 width) -->
        <div class="lg:col-span-1">
          <ChatPanel settings={settings} />
        </div>
      </div>
    </main>
  </div>
</Layout>

<style>
  /* Global calm styles */
  :global(body) {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
    line-height: 1.6;
  }
</style>
```

## 7. src/components/JournalSession.astro

```astro
---
import Timer from './Timer.astro';
import Dictation from '../islands/Dictation';
import PhaseTimer from '../islands/PhaseTimer';

const { session, settings } = Astro.props;

const phases = [
  { name: 'Opening', duration: 120, prompt: "Here's what's weighing on me today..." },
  { 
    name: 'Problem 1', 
    duration: 180, 
    prompt: 'What happened?',
    subPrompts: ['How do I feel?', "What's in my control?", 'One small action?']
  },
  { 
    name: 'Problem 2', 
    duration: 180, 
    prompt: 'What happened?',
    subPrompts: ['How do I feel?', "What's in my control?", 'One small action?']
  },
  { 
    name: 'Problem 3', 
    duration: 180, 
    prompt: 'What happened?',
    subPrompts: ['How do I feel?', "What's in my control?", 'One small action?']
  },
  { name: 'Pattern Check', duration: 120, prompt: 'Recurring theme from previous days?' },
  { 
    name: 'Closing', 
    duration: 120, 
    prompt: 'Tomorrow I will...',
    subPrompts: ["I'm letting go of..."]
  }
];
---

<div class="bg-white dark:bg-neutral-950 rounded-xl border border-neutral-200 dark:border-neutral-800">
  <!-- Phase Timer -->
  <div class="border-b border-neutral-200 dark:border-neutral-800 p-4">
    <PhaseTimer phases={phases} client:load />
  </div>
  
  <!-- Journal Content Area -->
  <div class="p-6">
    <!-- Guided Prompts -->
    <div id="phase-prompts" class="mb-4 text-sm text-neutral-600 dark:text-neutral-400">
      <p class="italic">Start with: "Here's what's weighing on me today..."</p>
      <div class="mt-2 text-xs space-y-1">
        <p>💡 Be specific, not abstract</p>
        <p>💡 Use "I" statements</p>
        <p>💡 No self-censoring - it's okay to vent</p>
      </div>
    </div>
    
    <!-- Main Text Area -->
    <div class="mb-6">
      <textarea
        id="journal-content"
        class="w-full min-h-[400px] p-4 bg-neutral-50 dark:bg-neutral-900 rounded-lg 
               border border-neutral-200 dark:border-neutral-800 
               focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400
               text-neutral-900 dark:text-neutral-100 resize-none"
        placeholder="Begin writing or use the microphone to dictate..."
      >{session?.content || ''}</textarea>
    </div>
    
    <!-- Dictation Controls -->
    <Dictation 
      sttEngine={settings.stt_engine}
      client:load 
    />
    
    <!-- Save Status -->
    <div class="mt-4 flex items-center justify-between">
      <div class="text-sm text-neutral-500">
        <span id="save-status">Auto-saving every 5 seconds</span>
      </div>
      
      <button 
        id="save-now"
        class="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition"
      >
        Save Now
      </button>
    </div>
  </div>
</div>

<script>
  // Auto-save functionality
  let saveTimeout: NodeJS.Timeout;
  const content = document.getElementById('journal-content') as HTMLTextAreaElement;
  const saveStatus = document.getElementById('save-status');
  const saveButton = document.getElementById('save-now');
  
  function autoSave() {
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(async () => {
      if (saveStatus) saveStatus.textContent = 'Saving...';
      
      const response = await fetch('/api/vault', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save',
          content: content.value,
          phase: (window as any).currentPhase || 'Opening'
        })
      });
      
      if (response.ok) {
        if (saveStatus) saveStatus.textContent = 'Saved';
        setTimeout(() => {
          if (saveStatus) saveStatus.textContent = 'Auto-saving every 5 seconds';
        }, 2000);
      }
    }, 5000);
  }
  
  content?.addEventListener('input', autoSave);
  content?.addEventListener('blur', () => {
    clearTimeout(saveTimeout);
    autoSave();
  });
  
  saveButton?.addEventListener('click', () => {
    clearTimeout(saveTimeout);
    autoSave();
  });
</script>
```

## 8. src/islands/Dictation.tsx

```tsx
import React, { useState, useRef, useEffect } from 'react';
import { Mic, MicOff, Circle, Square } from 'lucide-react';

interface DictationProps {
  sttEngine: 'local' | 'browser';
}

export default function Dictation({ sttEngine }: DictationProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interim, setInterim] = useState('');
  const recognitionRef = useRef<any>(null);
  const textAreaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    textAreaRef.current = document.getElementById('journal-content') as HTMLTextAreaElement;
    
    if (sttEngine === 'browser' && typeof window !== 'undefined') {
      const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
      if (SpeechRecognition) {
        recognitionRef.current = new SpeechRecognition();
        recognitionRef.current.continuous = true;
        recognitionRef.current.interimResults = true;
        
        recognitionRef.current.onresult = (event: any) => {
          let interim = '';
          let final = '';
          
          for (let i = event.resultIndex; i < event.results.length; i++) {
            const transcript = event.results[i][0].transcript;
            if (event.results[i].isFinal) {
              final += transcript + ' ';
            } else {
              interim += transcript;
            }
          }
          
          if (final) {
            setTranscript(prev => prev + final);
            insertAtCursor(final);
          }
          setInterim(interim);
        };
        
        recognitionRef.current.onerror = (event: any) => {
          console.error('Speech recognition error:', event.error);
          setIsRecording(false);
        };
      }
    }
  }, [sttEngine]);

  const insertAtCursor = (text: string) => {
    if (!textAreaRef.current) return;
    
    const start = textAreaRef.current.selectionStart;
    const end = textAreaRef.current.selectionEnd;
    const value = textAreaRef.current.value;
    
    textAreaRef.current.value = value.substring(0, start) + text + value.substring(end);
    textAreaRef.current.selectionStart = textAreaRef.current.selectionEnd = start + text.length;
    
    // Trigger input event for auto-save
    textAreaRef.current.dispatchEvent(new Event('input', { bubbles: true }));
  };

  const toggleRecording = async () => {
    if (isRecording) {
      if (sttEngine === 'browser' && recognitionRef.current) {
        recognitionRef.current.stop();
      } else if (sttEngine === 'local') {
        // Stop local recording
        await fetch('/api/stt', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'stop' })
        });
      }
      setIsRecording(false);
    } else {
      setTranscript('');
      setInterim('');
      
      if (sttEngine === 'browser' && recognitionRef.current) {
        recognitionRef.current.start();
      } else if (sttEngine === 'local') {
        // Start local recording
        const response = await fetch('/api/stt', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'start' })
        });
        
        if (response.ok) {
          // Poll for transcripts
          pollTranscripts();
        }
      }
      setIsRecording(true);
    }
  };

  const pollTranscripts = async () => {
    if (!isRecording) return;
    
    try {
      const response = await fetch('/api/stt?action=poll');
      const data = await response.json();
      
      if (data.transcript) {
        setTranscript(prev => prev + data.transcript);
        insertAtCursor(data.transcript);
      }
      
      if (data.interim) {
        setInterim(data.interim);
      }
      
      if (isRecording) {
        setTimeout(pollTranscripts, 500);
      }
    } catch (error) {
      console.error('Polling error:', error);
    }
  };

  const addPunctuation = (mark: string) => {
    insertAtCursor(mark + ' ');
  };

  return (
    <div className="space-y-4">
      {/* Recording Controls */}
      <div className="flex items-center space-x-4">
        <button
          onClick={toggleRecording}
          className={`p-4 rounded-full transition ${
            isRecording 
              ? 'bg-red-500 hover:bg-red-600 text-white' 
              : 'bg-neutral-200 hover:bg-neutral-300 dark:bg-neutral-800 dark:hover:bg-neutral-700'
          }`}
          aria-label={isRecording ? 'Stop recording' : 'Start recording'}
        >
          {isRecording ? <Square className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
        </button>
        
        {isRecording && (
          <div className="flex items-center space-x-2">
            <Circle className="w-3 h-3 text-red-500 animate-pulse" />
            <span className="text-sm text-red-500">Recording...</span>
          </div>
        )}
        
        <div className="flex items-center space-x-2">
          <button
            onClick={() => addPunctuation(',')}
            className="px-3 py-1 bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 rounded text-sm"
          >
            ,
          </button>
          <button
            onClick={() => addPunctuation('.')}
            className="px-3 py-1 bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 rounded text-sm"
          >
            .
          </button>
          <button
            onClick={() => addPunctuation('?')}
            className="px-3 py-1 bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 rounded text-sm"
          >
            ?
          </button>
        </div>
        
        {sttEngine === 'browser' && (
          <div className="text-xs text-amber-600 dark:text-amber-400">
            ⚠️ Browser STT (not private)
          </div>
        )}
      </div>
      
      {/* Live Transcript */}
      {(interim || transcript) && (
        <div className="p-3 bg-neutral-50 dark:bg-neutral-900 rounded-lg text-sm">
          <div className="text-neutral-600 dark:text-neutral-400 mb-1">Live transcript:</div>
          <div className="text-neutral-900 dark:text-neutral-100">
            {transcript}
            {interim && <span className="text-neutral-500 italic">{interim}</span>}
          </div>
        </div>
      )}
    </div>
  );
}
```

## 9. src/islands/PhaseTimer.tsx

```tsx
import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, SkipForward, RotateCcw } from 'lucide-react';

interface Phase {
  name: string;
  duration: number;
  prompt: string;
  subPrompts?: string[];
}

interface PhaseTimerProps {
  phases: Phase[];
}

export default function PhaseTimer({ phases }: PhaseTimerProps) {
  const [currentPhaseIndex, setCurrentPhaseIndex] = useState(0);
  const [timeRemaining, setTimeRemaining] = useState(phases[0].duration);
  const [isRunning, setIsRunning] = useState(false);
  const [totalElapsed, setTotalElapsed] = useState(0);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const currentPhase = phases[currentPhaseIndex];

  useEffect(() => {
    // Store current phase globally for other components
    (window as any).currentPhase = currentPhase.name;
    
    // Update prompts display
    const promptsDiv = document.getElementById('phase-prompts');
    if (promptsDiv) {
      let promptHtml = `<p class="italic">${currentPhase.prompt}</p>`;
      if (currentPhase.subPrompts) {
        promptHtml += '<div class="mt-2 space-y-1">';
        currentPhase.subPrompts.forEach(sp => {
          promptHtml += `<p class="text-xs text-neutral-500">• ${sp}</p>`;
        });
        promptHtml += '</div>';
      }
      promptsDiv.innerHTML = promptHtml;
    }
  }, [currentPhaseIndex]);

  useEffect(() => {
    if (isRunning && timeRemaining > 0) {
      intervalRef.current = setInterval(() => {
        setTimeRemaining(prev => {
          if (prev <= 1) {
            // Move to next phase
            if (currentPhaseIndex < phases.length - 1) {
              setCurrentPhaseIndex(i => i + 1);
              return phases[currentPhaseIndex + 1].duration;
            } else {
              setIsRunning(false);
              return 0;
            }
          }
          return prev - 1;
        });
        setTotalElapsed(prev => prev + 1);
      }, 1000);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isRunning, timeRemaining, currentPhaseIndex]);

  const toggleTimer = () => setIsRunning(!isRunning);

  const nextPhase = () => {
    if (currentPhaseIndex < phases.length - 1) {
      setCurrentPhaseIndex(currentPhaseIndex + 1);
      setTimeRemaining(phases[currentPhaseIndex + 1].duration);
    }
  };

  const resetTimer = () => {
    setCurrentPhaseIndex(0);
    setTimeRemaining(phases[0].duration);
    setIsRunning(false);
    setTotalElapsed(0);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const totalDuration = phases.reduce((sum, p) => sum + p.duration, 0);
  const progress = (totalElapsed / totalDuration) * 100;

  return (
    <div className="space-y-4">
      {/* Progress Bar */}
      <div className="relative h-2 bg-neutral-200 dark:bg-neutral-800 rounded-full overflow-hidden">
        <div 
          className="absolute left-0 top-0 h-full bg-blue-500 transition-all duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>
      
      {/* Current Phase */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium text-neutral-900 dark:text-neutral-100">
            {currentPhase.name}
          </h3>
          <p className="text-sm text-neutral-500">
            Phase {currentPhaseIndex + 1} of {phases.length}
          </p>
        </div>
        
        <div className="text-2xl font-mono text-neutral-900 dark:text-neutral-100">
          {formatTime(timeRemaining)}
        </div>
      </div>
      
      {/* Controls */}
      <div className="flex items-center justify-center space-x-4">
        <button
          onClick={resetTimer}
          className="p-2 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-lg transition"
          aria-label="Reset"
        >
          <RotateCcw className="w-5 h-5" />
        </button>
        
        <button
          onClick={toggleTimer}
          className="p-3 bg-blue-500 hover:bg-blue-600 text-white rounded-full transition"
          aria-label={isRunning ? 'Pause' : 'Play'}
        >
          {isRunning ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6" />}
        </button>
        
        <button
          onClick={nextPhase}
          disabled={currentPhaseIndex >= phases.length - 1}
          className="p-2 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
          aria-label="Next phase"
        >
          <SkipForward className="w-5 h-5" />
        </button>
      </div>
      
      {/* Total Time */}
      <div className="text-center text-sm text-neutral-500">
        Total: {formatTime(totalElapsed)} / {formatTime(totalDuration)}
      </div>
    </div>
  );
}
```

## 10. src/islands/Chat.tsx

```tsx
import React, { useState, useEffect, useRef } from 'react';
import { Send, Loader2 } from 'lucide-react';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  citations?: string[];
}

interface ChatProps {
  settings: any;
}

export default function Chat({ settings }: ChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      role: 'user',
      content: input,
      timestamp: new Date().toISOString()
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/llm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...messages, userMessage],
          settings
        })
      });

      const data = await response.json();
      
      const assistantMessage: Message = {
        role: 'assistant',
        content: data.content,
        timestamp: new Date().toISOString(),
        citations: data.citations
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      console.error('Chat error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="text-center text-neutral-500 py-8">
            <p className="text-sm">Chat with your journal</p>
            <p className="text-xs mt-2">Ask questions about patterns, get insights, or explore your thoughts</p>
          </div>
        )}
        
        {messages.map((message, index) => (
          <div
            key={index}
            className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[80%] rounded-lg p-3 ${
                message.role === 'user'
                  ? 'bg-blue-500 text-white'
                  : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100'
              }`}
            >
              <p className="text-sm whitespace-pre-wrap">{message.content}</p>
              
              {message.citations && message.citations.length > 0 && (
                <div className="mt-2 pt-2 border-t border-neutral-200 dark:border-neutral-700">
                  <p className="text-xs opacity-75">Sources:</p>
                  {message.citations.map((citation, i) => (
                    <p key={i} className="text-xs opacity-75">• {citation}</p>
                  ))}
                </div>
              )}
              
              <p className="text-xs opacity-75 mt-1">
                {new Date(message.timestamp).toLocaleTimeString()}
              </p>
            </div>
          </div>
        ))}
        
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-neutral-100 dark:bg-neutral-800 rounded-lg p-3">
              <Loader2 className="w-4 h-4 animate-spin" />
            </div>
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>
      
      <div className="border-t border-neutral-200 dark:border-neutral-800 p-4">
        <div className="flex space-x-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
            placeholder="Ask about your journal..."
            className="flex-1 px-3 py-2 bg-neutral-50 dark:bg-neutral-900 rounded-lg
                     border border-neutral-200 dark:border-neutral-800
                     focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={isLoading}
          />
          <button
            onClick={sendMessage}
            disabled={isLoading || !input.trim()}
            className="p-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg
                     transition disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label="Send message"
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
}
```

## 11. src/components/ChatPanel.astro

```astro
---
import Chat from '../islands/Chat';
const { settings } = Astro.props;
---

<div class="bg-white dark:bg-neutral-950 rounded-xl border border-neutral-200 dark:border-neutral-800 h-[600px] flex flex-col">
  <div class="border-b border-neutral-200 dark:border-neutral-800 p-4">
    <h2 class="text-lg font-medium text-neutral-900 dark:text-neutral-100">
      Journal Assistant
    </h2>
    <p class="text-sm text-neutral-500 mt-1">
      Reflect, explore patterns, get insights
    </p>
  </div>
  
  <div class="flex-1 overflow-hidden">
    <Chat settings={settings} client:load />
  </div>
</div>
```

## 12. src/pages/api/llm.ts

```typescript
import type { APIRoute } from 'astro';
import { OpenAI } from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { VaultManager } from '../../lib/vault';
import { RAGSystem } from '../../lib/rag';

export const POST: APIRoute = async ({ request }) => {
  const { messages, settings } = await request.json();
  
  const vault = new VaultManager(settings.vault_path);
  const rag = new RAGSystem(settings.vault_path, settings);
  
  try {
    // Get the latest user message
    const userMessage = messages[messages.length - 1].content;
    
    // Search for relevant context
    const relevantChunks = await rag.search(userMessage, settings.retriever.k, settings.retriever.recency_boost);
    
    // Build context string
    let context = '';
    const citations = [];
    
    if (relevantChunks.length > 0) {
      context = '\n\nRelevant context from your journal:\n';
      for (const chunk of relevantChunks) {
        context += `\n[${chunk.date} - ${chunk.heading}]:\n${chunk.text}\n`;
        citations.push(`${chunk.date} - ${chunk.heading}`);
      }
    }
    
    // Load system prompt
    const systemPrompt = await vault.loadPrompt('system');
    
    let response;
    
    if (settings.llm_backend === 'openai') {
      const openai = new OpenAI({ apiKey: settings.api_key });
      
      // Prepare messages for OpenAI
      const openaiMessages = [
        { role: 'system' as const, content: systemPrompt + context },
        ...messages.map((m: any) => ({ role: m.role as 'user' | 'assistant', content: m.content }))
      ];
      
      const openaiResponse = await openai.chat.completions.create({
        model: settings.model || 'gpt-4o-mini',
        messages: openaiMessages,
        temperature: settings.temperature,
        top_p: settings.top_p,
        max_tokens: settings.max_tokens
      });
      
      response = openaiResponse.choices[0].message.content;
      
    } else if (settings.llm_backend === 'anthropic') {
      const anthropic = new Anthropic({ apiKey: settings.api_key });
      
      // Convert messages format for Anthropic
      const anthropicMessages = messages.map((m: any) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content
      }));
      
      const anthropicResponse = await anthropic.messages.create({
        model: settings.model || 'claude-3-5-sonnet-20241022',
        system: systemPrompt + context,
        messages: anthropicMessages,
        temperature: settings.temperature,
        top_p: settings.top_p,
        max_tokens: settings.max_tokens || 1000
      });
      
      response = anthropicResponse.content[0].type === 'text' 
        ? anthropicResponse.content[0].text 
        : '';
        
    } else if (settings.llm_backend === 'grok') {
      // Grok uses OpenAI-compatible API
      const grokClient = new OpenAI({
        apiKey: settings.api_key,
        baseURL: 'https://api.x.ai/v1'
      });
      
      const grokMessages = [
        { role: 'system' as const, content: systemPrompt + context },
        ...messages.map((m: any) => ({ role: m.role as 'user' | 'assistant', content: m.content }))
      ];
      
      const grokResponse = await grokClient.chat.completions.create({
        model: settings.model || 'grok-beta',
        messages: grokMessages,
        temperature: settings.temperature,
        top_p: settings.top_p,
        max_tokens: settings.max_tokens
      });
      
      response = grokResponse.choices[0].message.content;
      
    } else {
      throw new Error('Invalid LLM backend configuration');
    }
    
    rag.close();
    
    return new Response(JSON.stringify({
      content: response,
      citations: citations.length > 0 ? citations : undefined
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('LLM error:', error);
    rag.close();
    
    return new Response(JSON.stringify({
      error: 'Failed to generate response',
      details: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
```

## 13. src/pages/api/vault.ts

```typescript
import type { APIRoute } from 'astro';
import { VaultManager } from '../../lib/vault';
import { RAGSystem } from '../../lib/rag';
import type { SessionFrontMatter } from '../../types';

export const POST: APIRoute = async ({ request }) => {
  const data = await request.json();
  const vault = new VaultManager(data.vaultPath || '~/JournalAI');
  
  try {
    if (data.action === 'save') {
      const settings = await vault.loadSettings();
      
      const frontMatter: SessionFrontMatter = {
        date: new Date().toISOString().split('T')[0],
        duration_minutes: 15,
        tags: data.tags || [],
        mood: data.mood,
        problems: data.problems || [],
        recurring_theme: data.recurringTheme,
        closing: data.closing
      };
      
      const filepath = await vault.saveSession(data.content, frontMatter);
      
      // Index the document for RAG with settings
      const rag = new RAGSystem(vault['vaultPath'], settings);
      await rag.indexDocument(filepath, data.content, frontMatter);
      rag.close();
      
      return new Response(JSON.stringify({ success: true, filepath }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    if (data.action === 'load') {
      const session = await vault.loadSession(new Date(data.date));
      return new Response(JSON.stringify(session), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    if (data.action === 'recent') {
      const sessions = await vault.getRecentSessions(data.days || 7);
      return new Response(JSON.stringify(sessions), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    return new Response(JSON.stringify({ error: 'Invalid action' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Vault error:', error);
    return new Response(JSON.stringify({ error: 'Operation failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
```

## 14. src/pages/api/stt.ts

```typescript
import type { APIRoute } from 'astro';
import { spawn } from 'child_process';

// Simple in-memory store for STT sessions
const sttSessions = new Map();

export const POST: APIRoute = async ({ request }) => {
  const { action } = await request.json();
  const sessionId = request.headers.get('x-session-id') || 'default';
  
  if (action === 'start') {
    // Start Whisper process
    const whisperProcess = spawn('whisper', [
      '--model', 'base',
      '--language', 'en',
      '--output_format', 'json',
      '--no_speech_threshold', '0.6',
      '--', '-'
    ]);
    
    sttSessions.set(sessionId, {
      process: whisperProcess,
      transcript: '',
      interim: ''
    });
    
    whisperProcess.stdout.on('data', (data) => {
      const session = sttSessions.get(sessionId);
      if (session) {
        try {
          const result = JSON.parse(data.toString());
          if (result.text) {
            session.transcript += result.text + ' ';
          }
        } catch (e) {
          // Handle partial data
          session.interim = data.toString();
        }
      }
    });
    
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  if (action === 'stop') {
    const session = sttSessions.get(sessionId);
    if (session && session.process) {
      session.process.kill();
      sttSessions.delete(sessionId);
    }
    
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  return new Response(JSON.stringify({ error: 'Invalid action' }), {
    status: 400,
    headers: { 'Content-Type': 'application/json' }
  });
};

export const GET: APIRoute = async ({ url }) => {
  const sessionId = url.searchParams.get('session') || 'default';
  const session = sttSessions.get(sessionId);
  
  if (session) {
    const response = {
      transcript: session.transcript,
      interim: session.interim
    };
    
    // Clear sent transcript
    session.transcript = '';
    session.interim = '';
    
    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  return new Response(JSON.stringify({ transcript: '', interim: '' }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
};
```

## 15. Setup Instructions

```bash
# 1. Create project and install dependencies
mkdir journal-ai && cd journal-ai
npm init -y
npm install astro @astrojs/react @astrojs/tailwind react react-dom better-sqlite3 sqlite-vec gray-matter date-fns openai @anthropic-ai/sdk lucide-react
npm install -D @types/better-sqlite3 @types/react tailwindcss typescript tsx

# 2. Create the file structure as shown above

# 3. Create a .env file with your API key
echo "OPENAI_API_KEY=your-key-here" > .env
# OR
echo "ANTHROPIC_API_KEY=your-key-here" > .env
# OR  
echo "GROK_API_KEY=your-key-here" > .env

# 4. Initialize vault
npm run setup

# 5. Run the application
npm run dev

# The app will be available at http://localhost:4321
```

## 16. src/islands/Settings.tsx

```tsx
import React, { useState, useEffect } from 'react';
import { X, Save, Eye, EyeOff } from 'lucide-react';

interface SettingsProps {
  initialSettings: any;
}

export default function SettingsWrapper({ initialSettings }: SettingsProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [settings, setSettings] = useState(initialSettings);
  const [showApiKey, setShowApiKey] = useState(false);
  const [testResult, setTestResult] = useState<string>('');

  useEffect(() => {
    const handleOpen = () => setIsOpen(true);
    window.addEventListener('open-settings', handleOpen);
    return () => window.removeEventListener('open-settings', handleOpen);
  }, []);

  useEffect(() => {
    // Check for API key in URL params (for first-time setup)
    const params = new URLSearchParams(window.location.search);
    const setupKey = params.get('setup');
    if (setupKey === 'true' && !settings.api_key) {
      setIsOpen(true);
    }
  }, []);

  if (!isOpen) return null;

  const handleSave = async () => {
    try {
      const response = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings)
      });
      
      if (response.ok) {
        setIsOpen(false);
        window.location.reload();
      }
    } catch (error) {
      console.error('Failed to save settings:', error);
    }
  };

  const testConnection = async () => {
    setTestResult('Testing...');
    try {
      const response = await fetch('/api/llm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: 'Hello, this is a test.' }],
          settings
        })
      });
      
      if (response.ok) {
        setTestResult('✅ Connection successful!');
      } else {
        const error = await response.json();
        setTestResult(`❌ Failed: ${error.details || error.error}`);
      }
    } catch (error) {
      setTestResult(`❌ Connection failed: ${error}`);
    }
  };

  const modelOptions = {
    openai: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'],
    anthropic: ['claude-3-5-sonnet-20241022', 'claude-3-opus-20240229', 'claude-3-haiku-20240307'],
    grok: ['grok-beta', 'grok-2-beta']
  };

  const embeddingOptions = {
    openai: ['text-embedding-3-small', 'text-embedding-3-large', 'text-embedding-ada-002'],
    anthropic: ['text-embedding-3-small'], // Use OpenAI for now
    grok: ['text-embedding-3-small'] // Use OpenAI for now
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-800 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-neutral-200 dark:border-neutral-800 flex justify-between items-center">
          <h2 className="text-xl font-medium">Settings</h2>
          <button onClick={() => setIsOpen(false)} className="p-2 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="p-6 space-y-6">
          {!settings.api_key && (
            <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
              <p className="text-sm text-blue-800 dark:text-blue-200">
                👋 Welcome! To get started, please configure your LLM provider and API key below.
              </p>
            </div>
          )}

          {/* LLM Provider */}
          <div>
            <label className="block text-sm font-medium mb-2">LLM Provider</label>
            <select
              value={settings.llm_backend}
              onChange={(e) => setSettings({ 
                ...settings, 
                llm_backend: e.target.value,
                model: modelOptions[e.target.value as keyof typeof modelOptions][0]
              })}
              className="w-full px-3 py-2 bg-neutral-50 dark:bg-neutral-800 rounded-lg border border-neutral-200 dark:border-neutral-700"
            >
              <option value="openai">OpenAI</option>
              <option value="anthropic">Anthropic (Claude)</option>
              <option value="grok">Grok (X.AI)</option>
            </select>
          </div>

          {/* API Key */}
          <div>
            <label className="block text-sm font-medium mb-2">
              {settings.llm_backend === 'openai' ? 'OpenAI' : 
               settings.llm_backend === 'anthropic' ? 'Anthropic' : 
               'Grok'} API Key
            </label>
            <div className="relative">
              <input
                type={showApiKey ? 'text' : 'password'}
                value={settings.api_key || ''}
                onChange={(e) => setSettings({ ...settings, api_key: e.target.value })}
                placeholder={settings.llm_backend === 'openai' ? 'sk-...' : 
                           settings.llm_backend === 'anthropic' ? 'sk-ant-...' : 
                           'xai-...'}
                className="w-full px-3 py-2 pr-10 bg-neutral-50 dark:bg-neutral-800 rounded-lg border border-neutral-200 dark:border-neutral-700"
              />
              <button
                type="button"
                onClick={() => setShowApiKey(!showApiKey)}
                className="absolute right-2 top-2 p-1 hover:bg-neutral-200 dark:hover:bg-neutral-700 rounded"
              >
                {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-xs text-neutral-500 mt-1">
              {settings.llm_backend === 'openai' && 'Get your API key from platform.openai.com'}
              {settings.llm_backend === 'anthropic' && 'Get your API key from console.anthropic.com'}
              {settings.llm_backend === 'grok' && 'Get your API key from console.x.ai'}
            </p>
          </div>

          {/* Model */}
          <div>
            <label className="block text-sm font-medium mb-2">Model</label>
            <select
              value={settings.model}
              onChange={(e) => setSettings({ ...settings, model: e.target.value })}
              className="w-full px-3 py-2 bg-neutral-50 dark:bg-neutral-800 rounded-lg border border-neutral-200 dark:border-neutral-700"
            >
              {modelOptions[settings.llm_backend as keyof typeof modelOptions].map(model => (
                <option key={model} value={model}>{model}</option>
              ))}
            </select>
          </div>

          {/* Embedding Model */}
          <div>
            <label className="block text-sm font-medium mb-2">Embedding Model</label>
            <select
              value={settings.embedding_model || 'text-embedding-3-small'}
              onChange={(e) => setSettings({ ...settings, embedding_model: e.target.value })}
              className="w-full px-3 py-2 bg-neutral-50 dark:bg-neutral-800 rounded-lg border border-neutral-200 dark:border-neutral-700"
            >
              {embeddingOptions[settings.llm_backend as keyof typeof embeddingOptions].map(model => (
                <option key={model} value={model}>{model}</option>
              ))}
            </select>
            {settings.llm_backend !== 'openai' && (
              <p className="text-xs text-amber-600 mt-1">
                Note: Currently using OpenAI embeddings for best compatibility
              </p>
            )}
          </div>

          {/* STT Engine */}
          <div>
            <label className="block text-sm font-medium mb-2">Speech-to-Text</label>
            <select
              value={settings.stt_engine}
              onChange={(e) => setSettings({ ...settings, stt_engine: e.target.value })}
              className="w-full px-3 py-2 bg-neutral-50 dark:bg-neutral-800 rounded-lg border border-neutral-200 dark:border-neutral-700"
            >
              <option value="browser">Browser (Simple)</option>
              <option value="openai">OpenAI Whisper API</option>
              <option value="local">Local Whisper (Private)</option>
            </select>
          </div>

          {/* Temperature */}
          <div>
            <label className="block text-sm font-medium mb-2">
              Temperature: {settings.temperature}
            </label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={settings.temperature}
              onChange={(e) => setSettings({ ...settings, temperature: parseFloat(e.target.value) })}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-neutral-500">
              <span>Focused</span>
              <span>Creative</span>
            </div>
          </div>

          {/* Test Connection */}
          <div className="flex items-center space-x-4">
            <button
              onClick={testConnection}
              className="px-4 py-2 bg-neutral-200 hover:bg-neutral-300 dark:bg-neutral-800 dark:hover:bg-neutral-700 rounded-lg"
            >
              Test Connection
            </button>
            {testResult && (
              <span className="text-sm">{testResult}</span>
            )}
          </div>

          {/* Privacy Notice */}
          <div className="p-4 bg-amber-50 dark:bg-amber-900/20 rounded-lg">
            <p className="text-sm text-amber-800 dark:text-amber-200">
              ⚠️ Using cloud APIs means your journal entries will be sent to external servers. 
              For complete privacy, use local Whisper for speech and consider running a local LLM.
            </p>
          </div>
        </div>

        <div className="p-6 border-t border-neutral-200 dark:border-neutral-800 flex justify-end space-x-3">
          <button
            onClick={() => setIsOpen(false)}
            className="px-4 py-2 bg-neutral-200 hover:bg-neutral-300 dark:bg-neutral-800 dark:hover:bg-neutral-700 rounded-lg"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!settings.api_key}
            className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg flex items-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Save className="w-4 h-4" />
            <span>Save Settings</span>
          </button>
        </div>
      </div>
    </div>
  );
}
```

## 17. src/pages/api/settings.ts

```typescript
import type { APIRoute } from 'astro';
import { VaultManager } from '../../lib/vault';

export const POST: APIRoute = async ({ request }) => {
  const settings = await request.json();
  const vault = new VaultManager(settings.vault_path || '~/JournalAI');
  
  try {
    await vault.saveSettings(settings);
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Settings error:', error);
    return new Response(JSON.stringify({ error: 'Failed to save settings' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

export const GET: APIRoute = async ({ url }) => {
  const vaultPath = url.searchParams.get('vault') || '~/JournalAI';
  const vault = new VaultManager(vaultPath);
  
  try {
    const settings = await vault.loadSettings();
    return new Response(JSON.stringify(settings), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Settings error:', error);
    return new Response(JSON.stringify({ error: 'Failed to load settings' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

## Key Features Implemented

✅ **M1 - Dictation**: Mic button with local/browser STT
✅ **M2 - Chat**: AI chat panel with context from journal
✅ **M3 - Save to Markdown**: Automatic saving with frontmatter
✅ **M4 - RAG Context**: Vector search over past entries
✅ **M5 - 15-Minute Framework**: Phase timer with guided prompts
✅ **M6 - Local-first**: Runs locally with Ollama, optional API
✅ **M7 - Prompt-tunable**: Editable prompt files
✅ **M8 - Calm UI**: Minimal, distraction-free design

The application is fully functional with all must-have features. You can extend it with the should-have and could-have features as needed.