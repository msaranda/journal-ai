import React, { useState, useRef, useEffect } from 'react';
import { Mic, MicOff, Circle, Square } from 'lucide-react';

interface DictationProps {
  sttEngine: 'local' | 'browser' | 'openai';
  sttLanguage?: string;
}

export default function Dictation({ sttEngine, sttLanguage }: DictationProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interim, setInterim] = useState('');
  const recognitionRef = useRef<any>(null);
  const textAreaRef = useRef<HTMLTextAreaElement>(null);
  const silenceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Network and availability states
  const [isOnline, setIsOnline] = useState(true); // Default to online, will be updated in useEffect
  const [whisperAvailable, setWhisperAvailable] = useState<boolean | null>(null);
  const [actualEngine, setActualEngine] = useState<string>(sttEngine);
  const [statusMessage, setStatusMessage] = useState<string>('');
  
  // Audio recording refs for server-side STT
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const processingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  
  // Import timing configuration
  const TIMING_CONFIG = {
    dictation_silence_timeout: 10,
    page_leave_timeout: 5,
    typing_inactivity_timeout: 120
  };

  useEffect(() => {
    // Only run in browser environment
    if (typeof window === 'undefined') return;
    
    console.log('🎤 Dictation component initializing with:', { sttEngine, sttLanguage });
    
    // Initialize online status from navigator
    if (typeof navigator !== 'undefined') {
      setIsOnline(navigator.onLine);
    }
    
    const textArea = document.getElementById('journal-content') as HTMLTextAreaElement;
    if (textArea) {
      (textAreaRef as any).current = textArea;
      console.log('✅ Found textarea element');
    } else {
      console.error('❌ Could not find textarea with id "journal-content"');
    }
    
    // Set up network detection
    const handleOnline = () => {
      setIsOnline(true);
      console.log('🌐 Network connection restored');
      checkAvailabilityAndSetEngine();
    };
    
    const handleOffline = () => {
      setIsOnline(false);
      console.log('📵 Network connection lost');
      checkAvailabilityAndSetEngine();
    };
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    // Initial availability check (with small delay to ensure component is mounted)
    setTimeout(() => {
      checkAvailabilityAndSetEngine();
    }, 100);
    
    if (sttEngine === 'browser' && typeof window !== 'undefined') {
      const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
      console.log('🔍 Speech recognition support:', !!SpeechRecognition);
      
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
          
          // Reset silence timeout when speech is detected
          if (final || interim) {
            startSilenceTimeout();
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
          clearSilenceTimeout();
          document.dispatchEvent(new CustomEvent('dictation-finished'));
        };
        
        recognitionRef.current.onend = () => {
          console.log('Speech recognition ended');
          setIsRecording(false);
          clearSilenceTimeout();
          document.dispatchEvent(new CustomEvent('dictation-finished'));
        };
      }
    }
    
    // Cleanup function
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
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
    console.log('🎤 Toggle recording called, current state:', isRecording);
    
    if (isRecording) {
      if (actualEngine === 'browser' && recognitionRef.current) {
        recognitionRef.current.stop();
      } else if (actualEngine === 'local' || actualEngine === 'openai') {
        // Stop audio recording and streaming
        stopAudioRecording();
      }
      setIsRecording(false);
      
      // Clear silence timeout when stopping
      clearSilenceTimeout();
      
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
      
      if (actualEngine === 'browser' && recognitionRef.current) {
        try {
          console.log('🎤 Starting browser speech recognition...');
          recognitionRef.current.start();
          // Start silence timeout for auto-stop
          startSilenceTimeout();
          // Emit event to start session timer
          document.dispatchEvent(new CustomEvent('dictation-started'));
          console.log('✅ Speech recognition started successfully');
        } catch (error) {
          console.error('❌ Failed to start speech recognition:', error);
          setIsRecording(false);
          return;
        }
      } else if (actualEngine === 'local' || actualEngine === 'openai') {
        try {
          console.log(`🎤 Starting ${actualEngine} STT with audio streaming...`);
          await startAudioRecording();
          startSilenceTimeout();
          console.log(`✅ ${actualEngine} STT started successfully`);
        } catch (error) {
          console.error(`❌ ${sttEngine} STT failed:`, error);
          console.log('🔄 Falling back to browser STT...');
          
          // Fallback to browser STT
          const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
          if (SpeechRecognition && !recognitionRef.current) {
            recognitionRef.current = new SpeechRecognition();
            recognitionRef.current.continuous = true;
            recognitionRef.current.interimResults = true;
            recognitionRef.current.lang = sttLanguage || 'en-US';
            
            // Set up event handlers for fallback
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
              
              if (final || interim) {
                startSilenceTimeout();
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
              clearSilenceTimeout();
            };
            
            recognitionRef.current.onend = () => {
              setIsRecording(false);
              clearSilenceTimeout();
            };
          }
          
          if (recognitionRef.current) {
            try {
              recognitionRef.current.start();
              startSilenceTimeout();
              console.log('✅ Fallback browser STT started');
            } catch (fallbackError) {
              console.error('❌ Fallback browser STT also failed:', fallbackError);
              setIsRecording(false);
              return;
            }
          } else {
            console.error('❌ No STT options available');
            setIsRecording(false);
            return;
          }
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
        // Reset silence timeout when we get new transcript
        startSilenceTimeout();
      }
      
      if (data.interim) {
        setInterim(data.interim);
        // Reset silence timeout for interim results too
        startSilenceTimeout();
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

  const startSilenceTimeout = () => {
    // Clear any existing timeout
    if (silenceTimeoutRef.current) {
      clearTimeout(silenceTimeoutRef.current);
    }
    
    // Start configurable timeout
    const timeout = TIMING_CONFIG.dictation_silence_timeout * 1000; // Convert to milliseconds
    silenceTimeoutRef.current = setTimeout(() => {
      console.log(`Stopping dictation due to ${TIMING_CONFIG.dictation_silence_timeout} seconds of silence`);
      if (isRecording) {
        // Stop recording due to silence
        toggleRecording();
      }
    }, timeout);
  };

  const clearSilenceTimeout = () => {
    if (silenceTimeoutRef.current) {
      clearTimeout(silenceTimeoutRef.current);
      silenceTimeoutRef.current = null;
    }
  };

  // Audio recording functions for server-side STT
  const startAudioRecording = async () => {
    try {
      console.log('🎤 Requesting microphone access...');
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true
        } 
      });
      
      streamRef.current = stream;
      console.log('✅ Microphone access granted');

      // Generate session ID
      const sessionId = generateSessionId();
      sessionIdRef.current = sessionId;

      // Start STT session on server
      const startResponse = await fetch('/api/stt-stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'start',
          sessionId,
          language: sttLanguage || 'en'
        })
      });

      if (!startResponse.ok) {
        throw new Error('Failed to start STT session');
      }

      const startResult = await startResponse.json();
      console.log('✅ STT session started:', startResult);

      // Create MediaRecorder for audio capture
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus'
      });
      
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      // Handle audio data - collect chunks but don't send individually
      mediaRecorder.ondataavailable = async (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
          console.log(`📦 Collected audio chunk: ${event.data.size} bytes (total: ${audioChunksRef.current.length} chunks)`);
        }
      };

      mediaRecorder.onstop = () => {
        console.log('🛑 MediaRecorder stopped');
      };

      // Start recording with chunks for streaming
      mediaRecorder.start(1000); // 1 second chunks
      console.log('🎤 Audio recording started');

      // Start periodic processing
      startPeriodicProcessing();
      
      return true;
    } catch (error) {
      console.error('❌ Failed to start audio recording:', error);
      throw error;
    }
  };

  const stopAudioRecording = async () => {
    console.log('🛑 Stopping audio recording...');
    
    // Stop periodic processing
    if (processingIntervalRef.current) {
      clearInterval(processingIntervalRef.current);
      processingIntervalRef.current = null;
    }
    
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    
    // End STT session and get final transcript
    if (sessionIdRef.current && audioChunksRef.current.length > 0) {
      try {
        // Send final complete audio for processing
        const completeBlob = new Blob(audioChunksRef.current, { type: 'audio/webm;codecs=opus' });
        const arrayBuffer = await completeBlob.arrayBuffer();
        const audioData = Array.from(new Uint8Array(arrayBuffer));
        
        console.log(`🎵 Sending final audio: ${completeBlob.size} bytes from ${audioChunksRef.current.length} chunks`);
        
        const endResponse = await fetch('/api/stt-stream', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'end',
            sessionId: sessionIdRef.current,
            audioData: audioData
          })
        });
        
        if (endResponse.ok) {
          const result = await endResponse.json();
          if (result.finalTranscript) {
            console.log('📝 Adding final transcript:', result.finalTranscript);
            // Clear interim and add final transcript
            setInterim('');
            setTranscript(prev => prev + result.finalTranscript + ' ');
            insertAtCursor(result.finalTranscript + ' ');
          }
        }
      } catch (error) {
        console.error('❌ Failed to end STT session:', error);
      }
    }
    
    mediaRecorderRef.current = null;
    sessionIdRef.current = null;
    audioChunksRef.current = [];
    
    console.log('✅ Audio recording stopped');
  };

  const startPeriodicProcessing = () => {
    let lastProcessedChunkCount = 0;
    let lastTranscript = '';
    
    // Process audio every 3 seconds for real-time transcription
    processingIntervalRef.current = setInterval(async () => {
      if (sessionIdRef.current && audioChunksRef.current.length > lastProcessedChunkCount) {
        try {
          // Create a complete WebM blob from all chunks
          const completeBlob = new Blob(audioChunksRef.current, { type: 'audio/webm;codecs=opus' });
          const arrayBuffer = await completeBlob.arrayBuffer();
          const audioData = Array.from(new Uint8Array(arrayBuffer));
          
          console.log(`🎵 Sending complete audio: ${completeBlob.size} bytes from ${audioChunksRef.current.length} chunks (last processed: ${lastProcessedChunkCount})`);
          
          const processResponse = await fetch('/api/stt-stream', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'process',
              sessionId: sessionIdRef.current,
              audioData: audioData
            })
          });
          
          if (processResponse.ok) {
            const result = await processResponse.json();
            if (result.transcript && result.transcript.trim()) {
              console.log('📝 Received transcript:', result.transcript);
              
              // Simply replace the interim content with the latest transcript
              setInterim(result.transcript);
              
              console.log('📝 Updated transcript:', result.transcript);
              
              // Reset silence timeout on new transcript
              startSilenceTimeout();
              
              // Update tracking variables
              lastTranscript = result.transcript;
              lastProcessedChunkCount = audioChunksRef.current.length;
              
              // Don't trim chunks as it breaks WebM structure
              // Instead, we'll rely on the text extraction logic to avoid duplication
            }
          }
        } catch (error) {
          console.error('❌ Failed to process audio:', error);
        }
      }
    }, 4000); // Process every 4 seconds
  };

  const generateSessionId = (): string => {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  };

  const checkAvailabilityAndSetEngine = async () => {
    // Only run in browser environment
    if (typeof window === 'undefined') return;
    
    console.log('🔍 Checking STT availability...');
    
    let finalEngine = sttEngine;
    let message = '';
    
    // Get current online status
    const currentOnlineStatus = typeof navigator !== 'undefined' ? navigator.onLine : true;
    setIsOnline(currentOnlineStatus);
    
    // Check network status first
    if (!currentOnlineStatus) {
      console.log('📵 Offline - forcing browser STT');
      finalEngine = 'browser';
      message = '🔴 Offline - Using browser STT';
      setWhisperAvailable(false);
    } else {
      // Online - check server-side options
      if (sttEngine === 'local' || sttEngine === 'openai') {
        try {
          // Test server connectivity and Whisper availability
          const response = await fetch('/api/stt-stream', {
            method: 'GET',
            signal: AbortSignal.timeout(3000) // 3 second timeout
          });
          
          if (response.ok) {
            // Server is reachable, check if Whisper is available
            const testSession = generateSessionId();
            const testResponse = await fetch('/api/stt-stream', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                action: 'start',
                sessionId: testSession,
                language: sttLanguage || 'en'
              }),
              signal: AbortSignal.timeout(3000)
            });
            
            if (testResponse.ok) {
              const result = await testResponse.json();
              
              if (sttEngine === 'local') {
                // Try to detect if local Whisper is available
                setWhisperAvailable(true);
                finalEngine = 'local';
                message = '🟢 Local Whisper available';
              } else if (sttEngine === 'openai') {
                setWhisperAvailable(true);
                finalEngine = 'openai';
                message = '🟢 OpenAI Whisper available';
              }
              
              // Clean up test session
              await fetch('/api/stt-stream', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  action: 'end',
                  sessionId: testSession
                })
              }).catch(() => {}); // Ignore cleanup errors
              
            } else {
              throw new Error('STT session creation failed');
            }
          } else {
            throw new Error('Server not reachable');
          }
        } catch (error) {
          console.log(`❌ ${sttEngine} STT not available:`, error);
          setWhisperAvailable(false);
          
          if (sttEngine === 'local') {
            message = '🟡 Local Whisper unavailable - Using browser STT';
          } else if (sttEngine === 'openai') {
            message = '🟡 OpenAI Whisper unavailable - Using browser STT';
          }
          
          finalEngine = 'browser';
        }
      } else {
        // Browser STT selected
        finalEngine = 'browser';
        message = '🔵 Browser STT selected';
        setWhisperAvailable(null);
      }
    }
    
    setActualEngine(finalEngine);
    setStatusMessage(message);
    
    console.log(`🎯 Final STT engine: ${finalEngine} (requested: ${sttEngine})`);
    
    // Ensure browser STT is initialized if we're using it
    if (finalEngine === 'browser') {
      initializeBrowserSTT();
    }
  };

  const initializeBrowserSTT = () => {
    if (typeof window !== 'undefined' && !recognitionRef.current) {
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
          
          if (final || interim) {
            startSilenceTimeout();
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
          clearSilenceTimeout();
          document.dispatchEvent(new CustomEvent('dictation-finished'));
        };
        
        recognitionRef.current.onend = () => {
          console.log('Speech recognition ended');
          setIsRecording(false);
          clearSilenceTimeout();
          document.dispatchEvent(new CustomEvent('dictation-finished'));
        };
        
        console.log('✅ Browser STT initialized');
      } else {
        console.error('❌ Browser STT not supported');
      }
    }
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
        
        {/* STT Engine Status */}
        <div className="flex flex-col text-xs">
          {statusMessage && (
            <div className={`px-2 py-1 rounded text-xs font-medium ${
              statusMessage.includes('🔴') 
                ? 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300'
                : statusMessage.includes('🟡')
                ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300'
                : statusMessage.includes('🟢')
                ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
                : 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
            }`}>
              {statusMessage}
            </div>
          )}
          
          {actualEngine === 'browser' && (
            <div className="text-amber-600 dark:text-amber-400 mt-1">
              ⚠️ Browser STT (not private)
            </div>
          )}
          
          {!isOnline && (
            <div className="text-red-600 dark:text-red-400 mt-1">
              📵 No internet connection
            </div>
          )}
          
          {/* Retry button for failed connections */}
          {(whisperAvailable === false || !isOnline) && (
            <button
              onClick={checkAvailabilityAndSetEngine}
              className="mt-1 px-2 py-1 text-xs bg-neutral-200 hover:bg-neutral-300 dark:bg-neutral-700 dark:hover:bg-neutral-600 rounded"
              disabled={isRecording}
            >
              🔄 Retry
            </button>
          )}
        </div>
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
