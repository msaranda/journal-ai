export interface EntryMetadata {
  entry_number: number;
  started_at: string;
  first_keystroke_at: string;
  finished_at: string;
  duration_seconds: number;
  total_keystrokes: number;
  backspaces: number;
  paste_events: number;
  pauses: number[];
  max_pause: number;
  time_since_last_entry: number;
  word_count: number;
  char_count: number;
  line_count: number;
}

export interface SessionFrontMatter {
  date: string;
  entries_metadata: EntryMetadata[];
  // Legacy fields for backward compatibility
  duration_seconds?: number;
  tags?: string[];
  mood?: number;
  problems?: Problem[];
  recurring_theme?: string;
  closing?: {
    tomorrow: string;
    letting_go: string;
  };
  phase?: string;
  session_start?: string;
  appended_sessions?: Array<{
    timestamp: string;
    duration_seconds: number;
    phase: string;
  }>;
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
  stt_language: string;
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
