import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, SkipForward, RotateCcw } from 'lucide-react';

interface Phase {
  name: string;
  duration: number;
  prompt: string;
  subPrompts?: string[];
}

interface PhaseTimerProps {
  phases: Phase[];
}

export default function PhaseTimer({ phases }: PhaseTimerProps) {
  const [currentPhaseIndex, setCurrentPhaseIndex] = useState(0);
  const [timeRemaining, setTimeRemaining] = useState(phases[0].duration);
  const [isRunning, setIsRunning] = useState(false);
  const [totalElapsed, setTotalElapsed] = useState(0);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const currentPhase = phases[currentPhaseIndex];

  useEffect(() => {
    // Store current phase globally for other components
    (window as any).currentPhase = currentPhase.name;
    
    // Store timer state and controls globally
    (window as any).phaseTimerState = {
      isRunning,
      totalElapsed,
      currentPhase: currentPhase.name
    };
    
    // Expose timer controls globally
    (window as any).phaseTimerControls = {
      start: () => setIsRunning(true),
      stop: () => setIsRunning(false),
      toggle: () => setIsRunning(!isRunning),
      isRunning: isRunning
    };
    
    // Update prompts display
    const promptsDiv = document.getElementById('phase-prompts');
    if (promptsDiv) {
      let promptHtml = `<p class="italic">${currentPhase.prompt}</p>`;
      if (currentPhase.subPrompts) {
        promptHtml += '<div class="mt-2 space-y-1">';
        currentPhase.subPrompts.forEach(sp => {
          promptHtml += `<p class="text-xs text-neutral-500">• ${sp}</p>`;
        });
        promptHtml += '</div>';
      }
      promptsDiv.innerHTML = promptHtml;
    }
  }, [currentPhaseIndex, isRunning, totalElapsed]);

  useEffect(() => {
    if (isRunning && timeRemaining > 0) {
      intervalRef.current = setInterval(() => {
        setTimeRemaining(prev => {
          if (prev <= 1) {
            // Move to next phase
            if (currentPhaseIndex < phases.length - 1) {
              setCurrentPhaseIndex(i => i + 1);
              return phases[currentPhaseIndex + 1].duration;
            } else {
              setIsRunning(false);
              return 0;
            }
          }
          return prev - 1;
        });
        setTotalElapsed(prev => prev + 1);
      }, 1000);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isRunning, timeRemaining, currentPhaseIndex]);

  const toggleTimer = () => setIsRunning(!isRunning);

  const nextPhase = () => {
    if (currentPhaseIndex < phases.length - 1) {
      setCurrentPhaseIndex(currentPhaseIndex + 1);
      setTimeRemaining(phases[currentPhaseIndex + 1].duration);
    }
  };

  const resetTimer = () => {
    setCurrentPhaseIndex(0);
    setTimeRemaining(phases[0].duration);
    setIsRunning(false);
    setTotalElapsed(0);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const totalDuration = phases.reduce((sum, p) => sum + p.duration, 0);
  const progress = (totalElapsed / totalDuration) * 100;

  return (
    <div className="space-y-4">
      {/* Progress Bar */}
      <div className="relative h-2 bg-neutral-200 dark:bg-neutral-800 rounded-full overflow-hidden">
        <div 
          className="absolute left-0 top-0 h-full bg-blue-500 transition-all duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>
      
      {/* Current Phase */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium text-neutral-900 dark:text-neutral-100">
            {currentPhase.name}
          </h3>
          <p className="text-sm text-neutral-500">
            Phase {currentPhaseIndex + 1} of {phases.length}
          </p>
        </div>
        
        <div className="text-2xl font-mono text-neutral-900 dark:text-neutral-100">
          {formatTime(timeRemaining)}
        </div>
      </div>
      
      {/* Controls */}
      <div className="flex items-center justify-center space-x-4">
        <button
          onClick={resetTimer}
          className="p-2 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-lg transition"
          aria-label="Reset"
        >
          <RotateCcw className="w-5 h-5" />
        </button>
        
        <button
          onClick={toggleTimer}
          className="p-3 bg-blue-500 hover:bg-blue-600 text-white rounded-full transition"
          aria-label={isRunning ? 'Pause' : 'Play'}
        >
          {isRunning ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6" />}
        </button>
        
        <button
          onClick={nextPhase}
          disabled={currentPhaseIndex >= phases.length - 1}
          className="p-2 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
          aria-label="Next phase"
        >
          <SkipForward className="w-5 h-5" />
        </button>
      </div>
      
      {/* Total Time */}
      <div className="text-center text-sm text-neutral-500">
        Total: {formatTime(totalElapsed)} / {formatTime(totalDuration)}
      </div>
    </div>
  );
}
