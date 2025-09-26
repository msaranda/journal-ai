import type { APIRoute } from 'astro';
import { spawn } from 'child_process';
import { VaultManager } from '../../lib/vault';
import { OpenAI } from 'openai';
import fs from 'fs';
import path from 'path';

interface STTSession {
  id: string;
  language: string;
  audioChunks: Buffer[];
  lastActivity: number;
  settings?: any;
}

// In-memory session storage (in production, use Redis or similar)
const sessions = new Map<string, STTSession>();

// Cleanup inactive sessions every 5 minutes
setInterval(() => {
  const now = Date.now();
  const timeout = 5 * 60 * 1000; // 5 minutes
  
  for (const [sessionId, session] of sessions.entries()) {
    if (now - session.lastActivity > timeout) {
      console.log(`🧹 Cleaning up inactive STT session: ${sessionId}`);
      sessions.delete(sessionId);
    }
  }
}, 5 * 60 * 1000);

export const POST: APIRoute = async ({ request }) => {
  try {
    const { action, sessionId, audioData, language, settings } = await request.json();
    
    switch (action) {
      case 'start':
        return handleStartSession(sessionId, language, settings);
        
      case 'audio':
        return handleAudioChunk(sessionId, audioData);
        
      case 'process':
        return handleProcessAudio(sessionId);
        
      case 'end':
        return handleEndSession(sessionId);
        
      default:
        return new Response(JSON.stringify({ error: 'Invalid action' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
    }
  } catch (error) {
    console.error('❌ STT API error:', error);
    return new Response(JSON.stringify({ 
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

const handleStartSession = async (sessionId: string, language: string, settings: any) => {
  console.log(`🎤 Starting STT session: ${sessionId}`);
  
  // Load vault settings if not provided
  let sttSettings = settings;
  if (!sttSettings) {
    try {
      const vault = new VaultManager('~/JournalAI');
      sttSettings = await vault.loadSettings();
    } catch (error) {
      console.error('❌ Failed to load settings:', error);
      return new Response(JSON.stringify({ 
        error: 'Failed to load settings' 
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }
  
  const session: STTSession = {
    id: sessionId,
    language: language || 'en',
    audioChunks: [],
    lastActivity: Date.now(),
    settings: sttSettings
  };
  
  sessions.set(sessionId, session);
  
  return new Response(JSON.stringify({
    success: true,
    sessionId,
    engine: sttSettings.stt_engine
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
};

const handleAudioChunk = async (sessionId: string, audioData: number[]) => {
  const session = sessions.get(sessionId);
  if (!session) {
    return new Response(JSON.stringify({ error: 'Session not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  session.lastActivity = Date.now();
  
  if (audioData && Array.isArray(audioData)) {
    const audioBuffer = Buffer.from(audioData);
    session.audioChunks.push(audioBuffer);
    console.log(`📦 Added audio chunk: ${audioBuffer.length} bytes (total: ${session.audioChunks.length} chunks)`);
  }
  
  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
};

const handleProcessAudio = async (sessionId: string) => {
  const session = sessions.get(sessionId);
  if (!session) {
    return new Response(JSON.stringify({ error: 'Session not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  session.lastActivity = Date.now();
  
  if (session.audioChunks.length === 0) {
    return new Response(JSON.stringify({ 
      transcript: '',
      is_final: false 
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  try {
    let transcript = '';
    
    if (session.settings.stt_engine === 'openai') {
      transcript = await processWithOpenAIWhisper(session);
    } else {
      // Default to local Whisper
      transcript = await processWithLocalWhisper(session);
    }
    
    // Clear processed chunks
    session.audioChunks = [];
    
    return new Response(JSON.stringify({
      transcript: transcript.trim(),
      is_final: true,
      confidence: 1.0
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    console.error('❌ Audio processing error:', error);
    return new Response(JSON.stringify({
      error: 'Processing failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

const handleEndSession = async (sessionId: string) => {
  const session = sessions.get(sessionId);
  if (!session) {
    return new Response(JSON.stringify({ error: 'Session not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  console.log(`🛑 Ending STT session: ${sessionId}`);
  
  // Process any remaining audio
  let finalTranscript = '';
  if (session.audioChunks.length > 0) {
    try {
      if (session.settings.stt_engine === 'openai') {
        finalTranscript = await processWithOpenAIWhisper(session);
      } else {
        finalTranscript = await processWithLocalWhisper(session);
      }
    } catch (error) {
      console.error('❌ Final processing error:', error);
    }
  }
  
  sessions.delete(sessionId);
  
  return new Response(JSON.stringify({
    success: true,
    finalTranscript: finalTranscript.trim()
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
};

const processWithLocalWhisper = async (session: STTSession): Promise<string> => {
  // Check if Whisper is available
  const whisperAvailable = await checkWhisperAvailability();
  if (!whisperAvailable) {
    throw new Error('Whisper CLI not available. Install with: pip install openai-whisper');
  }
  
  // Combine all audio chunks
  const audioData = Buffer.concat(session.audioChunks);
  
  if (audioData.length < 1000) {
    return ''; // Skip very small audio chunks
  }
  
  // Create temporary audio file
  const tempDir = '/tmp';
  const audioFile = path.join(tempDir, `stt_${session.id}_${Date.now()}.webm`);
  
  try {
    fs.writeFileSync(audioFile, audioData);
    
    return new Promise((resolve, reject) => {
      const whisperProcess = spawn('whisper', [
        audioFile,
        '--model', 'base',
        '--language', session.language,
        '--output_format', 'json',
        '--output_dir', tempDir,
        '--no_speech_threshold', '0.6'
      ]);
      
      let output = '';
      let errorOutput = '';
      
      whisperProcess.stdout.on('data', (data) => {
        output += data.toString();
      });
      
      whisperProcess.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });
      
      whisperProcess.on('close', (code) => {
        try {
          // Clean up audio file
          if (fs.existsSync(audioFile)) {
            fs.unlinkSync(audioFile);
          }
          
          if (code === 0) {
            // Look for JSON output file
            const jsonFile = audioFile.replace('.webm', '.json');
            if (fs.existsSync(jsonFile)) {
              const result = JSON.parse(fs.readFileSync(jsonFile, 'utf8'));
              
              // Clean up JSON file
              fs.unlinkSync(jsonFile);
              
              resolve(result.text || '');
            } else {
              resolve('');
            }
          } else {
            reject(new Error(`Whisper failed (code ${code}): ${errorOutput}`));
          }
        } catch (error) {
          reject(error);
        }
      });
      
      whisperProcess.on('error', (error) => {
        reject(new Error(`Whisper process error: ${error.message}`));
      });
    });
    
  } catch (error) {
    // Clean up on error
    if (fs.existsSync(audioFile)) {
      fs.unlinkSync(audioFile);
    }
    throw error;
  }
};

const processWithOpenAIWhisper = async (session: STTSession): Promise<string> => {
  if (!session.settings?.api_key) {
    throw new Error('OpenAI API key not configured');
  }
  
  const openai = new OpenAI({
    apiKey: session.settings.api_key
  });
  
  // Combine all audio chunks
  const audioData = Buffer.concat(session.audioChunks);
  
  if (audioData.length < 1000) {
    return ''; // Skip very small audio chunks
  }
  
  // Create temporary audio file for OpenAI
  const tempDir = '/tmp';
  const audioFile = path.join(tempDir, `stt_openai_${session.id}_${Date.now()}.webm`);
  
  try {
    fs.writeFileSync(audioFile, audioData);
    
    // Create readable stream for OpenAI
    const audioStream = fs.createReadStream(audioFile);
    
    const response = await openai.audio.transcriptions.create({
      file: audioStream,
      model: 'whisper-1',
      language: session.language,
      response_format: 'json'
    });
    
    return response.text || '';
    
  } finally {
    // Clean up temp file
    if (fs.existsSync(audioFile)) {
      fs.unlinkSync(audioFile);
    }
  }
};

const checkWhisperAvailability = async (): Promise<boolean> => {
  return new Promise((resolve) => {
    const whisperCheck = spawn('which', ['whisper']);
    
    whisperCheck.on('close', (code) => {
      resolve(code === 0);
    });
    
    whisperCheck.on('error', () => {
      resolve(false);
    });
  });
};

export const GET: APIRoute = async () => {
  return new Response(JSON.stringify({
    message: 'STT streaming API is running',
    active_sessions: sessions.size,
    endpoints: {
      POST: 'Send audio data and control commands',
      actions: ['start', 'audio', 'process', 'end']
    }
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
};