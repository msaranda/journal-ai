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

          {/* STT Language */}
          <div>
            <label className="block text-sm font-medium mb-2">Dictation Language</label>
            <select
              value={settings.stt_language || 'en-US'}
              onChange={(e) => setSettings({ ...settings, stt_language: e.target.value })}
              className="w-full px-3 py-2 bg-neutral-50 dark:bg-neutral-800 rounded-lg border border-neutral-200 dark:border-neutral-700"
            >
              <option value="en-US">English (US)</option>
              <option value="en-GB">English (UK)</option>
              <option value="es-ES">Spanish (Spain)</option>
              <option value="es-MX">Spanish (Mexico)</option>
              <option value="fr-FR">French</option>
              <option value="de-DE">German</option>
              <option value="it-IT">Italian</option>
              <option value="pt-BR">Portuguese (Brazil)</option>
              <option value="pt-PT">Portuguese (Portugal)</option>
              <option value="ru-RU">Russian</option>
              <option value="ja-JP">Japanese</option>
              <option value="ko-KR">Korean</option>
              <option value="zh-CN">Chinese (Simplified)</option>
              <option value="zh-TW">Chinese (Traditional)</option>
              <option value="ar-SA">Arabic</option>
              <option value="hi-IN">Hindi</option>
              <option value="nl-NL">Dutch</option>
              <option value="sv-SE">Swedish</option>
              <option value="no-NO">Norwegian</option>
              <option value="da-DK">Danish</option>
              <option value="fi-FI">Finnish</option>
              <option value="pl-PL">Polish</option>
              <option value="tr-TR">Turkish</option>
              <option value="he-IL">Hebrew</option>
            </select>
            <p className="text-xs text-neutral-500 mt-1">
              {settings.stt_engine === 'browser' && 'Browser STT will use the selected language (if supported by your browser)'}
              {settings.stt_engine === 'local' && 'Language for local Whisper transcription'}
              {settings.stt_engine === 'openai' && 'Language for OpenAI Whisper API'}
            </p>
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
