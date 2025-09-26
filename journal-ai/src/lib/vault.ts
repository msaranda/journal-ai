import fs from 'fs/promises';
import path from 'path';
import matter from 'gray-matter';
import { format } from 'date-fns';
import type { SessionFrontMatter, Settings, EntryMetadata } from '../types';

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
      path.join(this.vaultPath, 'config')
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

    // Prompts are now part of the codebase in src/prompts/
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
      stt_language: 'en-US', // Default to English (US)
      llm_backend: 'openai',
      embedding_model: 'text-embedding-3-small'
    };
  }


  async saveSession(content: string, frontMatter: Partial<SessionFrontMatter>, isAppend: boolean = false, forceOverwrite: boolean = false) {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    
    const sessionDir = path.join(this.vaultPath, 'sessions', String(year), month);
    await fs.mkdir(sessionDir, { recursive: true });
    
    const filename = `${year}-${month}-${day}.session.md`;
    const filepath = path.join(sessionDir, filename);
    
    // Check if file already exists
    let existingSession = null;
    try {
      const existingContent = await fs.readFile(filepath, 'utf-8');
      existingSession = matter(existingContent);
    } catch {
      // File doesn't exist, continue with new session
    }
    
    // Show warning only on first save attempt (when neither append nor forceOverwrite is set)
    if (existingSession && !isAppend && !forceOverwrite) {
      // Return info about existing session for warning (first time save attempt)
      return { 
        filepath, 
        exists: true, 
        existingContent: existingSession.content,
        existingData: existingSession.data 
      };
    }
    
    let finalContent = content;
    let finalFrontMatter = { ...frontMatter };
    
    if (existingSession && isAppend) {
      // Append to existing session
      const appendTimestamp = new Date().toISOString();
      finalContent = existingSession.content + 
        `\n\n---\n**Appended at ${appendTimestamp}**\n` + 
        content;
      
      // Merge front matter, accumulating duration
      finalFrontMatter = {
        ...existingSession.data,
        ...frontMatter,
        duration_seconds: (existingSession.data.duration_seconds || 0) + (frontMatter.duration_seconds || 0),
        appended_sessions: [
          ...(existingSession.data.appended_sessions || []),
          {
            timestamp: appendTimestamp,
            duration_seconds: frontMatter.duration_seconds || 0,
            phase: frontMatter.phase || 'unknown'
          }
        ]
      };
    }
    
    const fileContent = matter.stringify(finalContent, finalFrontMatter);
    await fs.writeFile(filepath, fileContent, 'utf-8');
    
    return { filepath, exists: false };
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

  async saveEntry(content: string, metadata: EntryMetadata): Promise<{ filepath: string; success: boolean }> {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    
    const sessionDir = path.join(this.vaultPath, 'sessions', String(year), month);
    await fs.mkdir(sessionDir, { recursive: true });
    
    const filename = `${year}-${month}-${day}.session.md`;
    const filepath = path.join(sessionDir, filename);
    
    // Load existing session or create new one
    let existingSession: { content: string; data: SessionFrontMatter } | null = null;
    try {
      const existingContent = await fs.readFile(filepath, 'utf-8');
      const parsed = matter(existingContent);
      existingSession = { content: parsed.content, data: parsed.data as SessionFrontMatter };
    } catch {
      // File doesn't exist, will create new one
    }
    
    // Prepare the new entry content with proper time formatting
    const startDate = new Date(metadata.started_at);
    const entryTime = startDate.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit',
      hour12: false,
      timeZone: 'UTC' // Use UTC to avoid timezone issues
    });
    const entryContent = `## ${entryTime} - Entry ${metadata.entry_number}\n${content}\n`;
    
    let finalContent: string;
    let finalFrontMatter: SessionFrontMatter;
    
    if (existingSession) {
      // Append to existing session
      finalContent = existingSession.content + '\n---\n\n' + entryContent;
      finalFrontMatter = {
        ...existingSession.data,
        entries_metadata: [
          ...(existingSession.data.entries_metadata || []),
          metadata
        ]
      };
    } else {
      // Create new session
      const dateStr = `${year}-${month}-${day}`;
      finalContent = `# ${dateStr}\n\n${entryContent}`;
      finalFrontMatter = {
        date: dateStr,
        entries_metadata: [metadata]
      };
    }
    
    const fileContent = matter.stringify(finalContent, finalFrontMatter);
    await fs.writeFile(filepath, fileContent, 'utf-8');
    
    return { filepath, success: true };
  }

  async loadPrompt(name: string): Promise<string> {
    // Read prompts from the project codebase instead of vault
    const promptPath = path.join(process.cwd(), 'src', 'prompts', `${name}.md`);
    return await fs.readFile(promptPath, 'utf-8');
  }
}
