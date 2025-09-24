import type { APIRoute } from 'astro';
import { spawn } from 'child_process';

// Simple in-memory store for STT sessions
const sttSessions = new Map();

export const POST: APIRoute = async ({ request }) => {
  const { action, language } = await request.json();
  const sessionId = request.headers.get('x-session-id') || 'default';
  
  if (action === 'start') {
    // Start Whisper process
    const whisperProcess = spawn('whisper', [
      '--model', 'base',
      '--language', language || 'en',
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
