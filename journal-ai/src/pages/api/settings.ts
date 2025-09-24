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
