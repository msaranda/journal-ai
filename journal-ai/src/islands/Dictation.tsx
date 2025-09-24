import React, { useState, useRef, useEffect } from 'react';
import { Mic, MicOff, Circle, Square } from 'lucide-react';

interface DictationProps {
  sttEngine: 'local' | 'browser';
  sttLanguage?: string;
}

export default function Dictation({ sttEngine, sttLanguage }: DictationProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interim, setInterim] = useState('');
  const recognitionRef = useRef<any>(null);
  const textAreaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const textArea = document.getElementById('journal-content') as HTMLTextAreaElement;
    if (textArea) {
      (textAreaRef as any).current = textArea;
    }
    
    if (sttEngine === 'browser' && typeof window !== 'undefined') {
      const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
      if (SpeechRecognition) {
        recognitionRef.current = new SpeechRecognition();
        recognitionRef.current.continuous = true;
        recognitionRef.current.interimResults = true;
        recognitionRef.current.lang = sttLanguage || 'en-US';
        
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
          document.dispatchEvent(new CustomEvent('dictation-finished'));
        };
        
        recognitionRef.current.onend = () => {
          console.log('Speech recognition ended');
          setIsRecording(false);
          document.dispatchEvent(new CustomEvent('dictation-finished'));
        };
      }
    }
  }, [sttEngine, sttLanguage]);

  const insertAtCursor = (text: string) => {
    if (!textAreaRef.current) return;
    
    const textarea = textAreaRef.current;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const value = textarea.value;
    
    // If no selection and cursor is at position 0, append to end instead
    const insertPosition = (start === 0 && end === 0 && value.length > 0) ? value.length : start;
    const insertEnd = (start === 0 && end === 0 && value.length > 0) ? value.length : end;
    
    // Add space before new text if we're appending and there's existing content
    const needsSpace = insertPosition > 0 && value.length > 0 && !value.endsWith(' ') && !text.startsWith(' ');
    const textToInsert = needsSpace ? ' ' + text : text;
    
    textarea.value = value.substring(0, insertPosition) + textToInsert + value.substring(insertEnd);
    textarea.selectionStart = textarea.selectionEnd = insertPosition + textToInsert.length;
    
    // Trigger input event for auto-save
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
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
      
      // Emit event when dictation finishes
      document.dispatchEvent(new CustomEvent('dictation-finished'));
    } else {
      setTranscript('');
      setInterim('');
      
      // Position cursor at end of text when starting dictation
      if (textAreaRef.current) {
        const textarea = textAreaRef.current;
        textarea.focus();
        textarea.selectionStart = textarea.selectionEnd = textarea.value.length;
      }
      
      if (sttEngine === 'browser' && recognitionRef.current) {
        recognitionRef.current.start();
        // Emit event to start session timer
        document.dispatchEvent(new CustomEvent('dictation-started'));
      } else if (sttEngine === 'local') {
        // Start local recording
        const response = await fetch('/api/stt', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'start', language: sttLanguage || 'en' })
        });
        
        if (response.ok) {
          // Poll for transcripts
          pollTranscripts();
        }
      }
      setIsRecording(true);
      
      // Emit event to start session timer
      document.dispatchEvent(new CustomEvent('dictation-started'));
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
