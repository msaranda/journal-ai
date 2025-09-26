# System Configuration

This directory contains system-level configuration files that control core application behavior.

## ⚠️ Important Warning

**These settings directly affect:**
- **API costs** (especially dictation services)
- **User experience** and data loss prevention
- **System resource usage**

**Only modify these values if you understand the implications.**

## Timing Configuration (`timing.ts`)

Controls automatic timer behavior throughout the application.

### Settings

#### `dictation_silence_timeout` (seconds)
- **Default**: 10 seconds
- **Range**: 5-60 seconds
- **Impact**: How long to wait for speech before auto-stopping dictation
- **Cost Warning**: Longer timeouts = higher API costs for cloud STT services
- **Recommendation**: 8-15 seconds for most users

#### `page_leave_timeout` (seconds)
- **Default**: 5 seconds  
- **Range**: 1-30 seconds
- **Impact**: How long after leaving the page before auto-stopping the timer
- **UX Warning**: Too short = timer stops during brief tab switches
- **Recommendation**: 3-10 seconds

#### `typing_inactivity_timeout` (seconds)
- **Default**: 120 seconds (2 minutes)
- **Range**: 30-600 seconds
- **Impact**: How long without typing before auto-stopping the timer
- **UX Warning**: Too short = timer stops during thinking pauses
- **Recommendation**: 60-300 seconds (1-5 minutes)

### How to Modify

1. **Edit the values** in `src/config/timing.ts`
2. **Restart the development server** (`npm run dev`)
3. **Test thoroughly** with your typical usage patterns
4. **Monitor costs** if using cloud STT services

### Validation

The configuration includes automatic validation:
- Values outside safe ranges will throw errors on startup
- Check the console for validation messages
- Invalid configurations prevent the app from starting

### Example Modification

```typescript
export const TIMING_CONFIG = {
  dictation_silence_timeout: 8,   // Shorter for cost savings
  page_leave_timeout: 3,          // Quicker response
  typing_inactivity_timeout: 180, // 3 minutes for longer thinking
} as const;
```

## Why These Are Not User Settings

These timing values are kept as developer configuration rather than user settings because:

1. **Cost Control**: Incorrect dictation timeouts can lead to unexpected API charges
2. **System Stability**: Extreme values can cause poor user experience or resource issues  
3. **Complexity**: Most users don't need to adjust these technical parameters
4. **Safety**: Prevents accidental changes that could disrupt workflows

## Testing Changes

After modifying timing values:

1. **Test dictation auto-stop** - speak, then remain silent
2. **Test page leave behavior** - switch tabs briefly vs. extended periods
3. **Test typing inactivity** - type, pause for thinking, resume typing
4. **Monitor console logs** - timing events are logged for debugging
5. **Check API usage** - if using cloud services, monitor costs

## Rollback

If you experience issues after changing values:

1. **Revert to defaults** shown above
2. **Restart the server**
3. **Clear browser cache** if needed
4. **Check console for errors**
