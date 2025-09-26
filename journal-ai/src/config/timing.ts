/**
 * System Timing Configuration
 * 
 * WARNING: These settings control automatic behavior that can affect:
 * - API usage and costs (especially for dictation services)
 * - User experience and data loss prevention
 * - System resource usage
 * 
 * Only modify these values if you understand the implications.
 */

export const TIMING_CONFIG = {
  /**
   * Dictation silence timeout (seconds)
   * How long to wait for speech before auto-stopping dictation
   * 
   * COST IMPACT: Longer timeouts = higher API costs for cloud STT services
   * Recommended: 8-15 seconds for most users
   */
  dictation_silence_timeout: 10,

  /**
   * Page leave timeout (seconds)
   * How long after leaving the page before auto-stopping the timer
   * 
   * UX IMPACT: Too short = timer stops during brief tab switches
   * Recommended: 3-10 seconds
   */
  page_leave_timeout: 5,

  /**
   * Typing inactivity timeout (seconds)
   * How long without typing before auto-stopping the timer
   * 
   * UX IMPACT: Too short = timer stops during thinking pauses
   * Recommended: 60-300 seconds (1-5 minutes)
   */
  typing_inactivity_timeout: 120, // 2 minutes
} as const;

/**
 * Validation function to ensure timing values are within safe ranges
 */
export function validateTimingConfig(config: typeof TIMING_CONFIG): boolean {
  const { dictation_silence_timeout, page_leave_timeout, typing_inactivity_timeout } = config;
  
  // Dictation: 5-60 seconds (prevent runaway costs)
  if (dictation_silence_timeout < 5 || dictation_silence_timeout > 60) {
    console.error(`Invalid dictation_silence_timeout: ${dictation_silence_timeout}. Must be 5-60 seconds.`);
    return false;
  }
  
  // Page leave: 1-30 seconds (prevent accidental stops vs runaway sessions)
  if (page_leave_timeout < 1 || page_leave_timeout > 30) {
    console.error(`Invalid page_leave_timeout: ${page_leave_timeout}. Must be 1-30 seconds.`);
    return false;
  }
  
  // Typing inactivity: 30-600 seconds (prevent accidental stops vs runaway sessions)
  if (typing_inactivity_timeout < 30 || typing_inactivity_timeout > 600) {
    console.error(`Invalid typing_inactivity_timeout: ${typing_inactivity_timeout}. Must be 30-600 seconds.`);
    return false;
  }
  
  return true;
}

// Validate config on import
if (!validateTimingConfig(TIMING_CONFIG)) {
  throw new Error('Invalid timing configuration detected. Please check src/config/timing.ts');
}
