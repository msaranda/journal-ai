import type { APIRoute } from 'astro';
import { VaultManager } from '../../lib/vault';
import { RAGSystem } from '../../lib/rag';
import type { SessionFrontMatter, EntryMetadata } from '../../types';

export const POST: APIRoute = async ({ request }) => {
  const data = await request.json();
  const vault = new VaultManager(data.vaultPath || '~/JournalAI');
  
  try {
    if (data.action === 'save') {
      const settings = await vault.loadSettings();
      
      // Create frontMatter object, filtering out undefined values
      const frontMatter: Partial<SessionFrontMatter> = {
        date: new Date().toISOString().split('T')[0],
        duration_seconds: data.duration_seconds || 0,
        tags: data.tags || []
      };

      // Only add optional fields if they have values
      if (data.mood !== undefined) {
        frontMatter.mood = data.mood;
      }
      if (data.problems && data.problems.length > 0) {
        frontMatter.problems = data.problems;
      }
      if (data.recurringTheme) {
        frontMatter.recurring_theme = data.recurringTheme;
      }
      if (data.closing) {
        frontMatter.closing = data.closing;
      }
      if (data.phase) {
        frontMatter.phase = data.phase;
      }
      if (data.session_start) {
        frontMatter.session_start = data.session_start;
      }
      
      const result = await vault.saveSession(data.content, frontMatter, data.isAppend, data.forceOverwrite);
      
      // Check if session already exists and we need to warn user
      if (result.exists) {
        return new Response(JSON.stringify({ 
          success: false, 
          exists: true,
          message: 'A session already exists for today. Would you like to append to it?',
          existingContent: result.existingContent,
          existingData: result.existingData
        }), {
          status: 409, // Conflict
          headers: { 'Content-Type': 'application/json' }
        });
      }
      
      // Index the document for RAG with settings
      const rag = new RAGSystem(vault['vaultPath'], settings);
      await rag.indexDocument(result.filepath, data.content, frontMatter);
      rag.close();
      
      return new Response(JSON.stringify({ success: true, filepath: result.filepath }), {
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
    
    if (data.action === 'save_entry') {
      const metadata: EntryMetadata = data.metadata;
      const result = await vault.saveEntry(data.content, metadata);
      
      if (result.success) {
        // Index the document for RAG with settings
        const settings = await vault.loadSettings();
        const rag = new RAGSystem(vault['vaultPath'], settings);
        
        // Create a simple frontmatter for RAG indexing
        const simpleFrontMatter = {
          date: metadata.started_at.split('T')[0],
          duration_seconds: metadata.duration_seconds,
          entry_number: metadata.entry_number
        };
        
        await rag.indexDocument(result.filepath, data.content, simpleFrontMatter);
        rag.close();
        
        return new Response(JSON.stringify({ success: true, filepath: result.filepath }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      } else {
        return new Response(JSON.stringify({ error: 'Save failed' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
      }
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
