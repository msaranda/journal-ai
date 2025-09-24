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
