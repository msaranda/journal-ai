# Simplified Journal Specification - Pure Thought Capture

## Core Principle
**Single Purpose:** Dump thoughts and save behavioral metadata. No structure, no prompts, no editing.

## What to REMOVE from Current Implementation

### Components to Delete:
- ❌ All timer components (`Timer.astro`, `PhaseTimer.tsx`)
- ❌ Phase system (6 phases with durations)
- ❌ Structured problem forms
- ❌ Session framework logic

### UI Elements to Remove:
- ❌ Phase progress bars
- ❌ Timer controls (play, pause, skip)
- ❌ Structured input forms

## What to KEEP from Current Implementation

### Core Components:
- ✅ Main textarea for input
- ✅ Markdown file storage system
- ✅ Vault directory structure
- ✅ Auto-save mechanism (modify for append-only)
- ✅ Basic layout structure
- ✅ Dark/light theme toggle

### Modified to Keep:
- ✅ Dictation component (simplify - just mic on/off)
- ✅ Save functionality (change to append-only)
- ✅ Date-based file organization

## What to ADD (New Requirements)

### Behavioral Metadata Tracking:
```javascript
interface EntryMetadata {
  // Timing
  started_at: string;        // ISO timestamp when textarea focused
  first_keystroke_at: string; // When actual typing began
  finished_at: string;        // When save clicked
  duration_seconds: number;   
  
  // Typing behavior
  total_keystrokes: number;
  backspaces: number;
  paste_events: number;
  pauses: number[];          // Gaps > 3 seconds between keystrokes (in seconds)
  max_pause: number;         // Longest pause in seconds
  
  // Context
  entry_number: number;      // Nth entry of the day
  time_since_last_entry: number; // Milliseconds since previous entry
  
  // Content metrics
  word_count: number;
  char_count: number;
  line_count: number;
}
```

### Silent Tracking System:
```javascript
// Background tracking without UI
class EntryTracker {
  private metrics = {
    started_at: null,
    keystrokes: 0,
    backspaces: 0,
    paste_events: 0,
    last_keystroke_time: null,
    pauses: []
  };
  
  startTracking() { /* on textarea focus */ }
  trackKeystroke(event) { /* count and track pauses */ }
  finishTracking() { /* return complete metrics */ }
}
```

## File Structure

### Daily Markdown File:
```markdown
---
date: 2025-01-27
entries_metadata:
  - entry_number: 1
    started_at: "2025-01-27T10:23:45.123Z"
    finished_at: "2025-01-27T10:31:12.456Z"
    duration_seconds: 447
    keystrokes: 1823
    backspaces: 43
    paste_events: 2
    pauses: [12, 34, 8, 45]
    word_count: 234
  - entry_number: 2
    started_at: "2025-01-27T14:15:33.789Z"
    finished_at: "2025-01-27T14:17:01.234Z"
    duration_seconds: 88
    keystrokes: 245
    backspaces: 12
    paste_events: 0
    pauses: [5, 12]
    word_count: 67
---

# 2025-01-27

## 10:23 - Entry 1
[Actual journal text here]

---

## 14:15 - Entry 2
[Actual journal text here]

---
```

## UI Layout

```
┌─────────────────────────────────────┐
│ Journal AI - 2025-01-27             │
├─────────────────────────────────────┤
│ ▼ 10:23-10:31 (447s, 234 words)    │
│   "First line of entry..."          │
│                                     │
│ ▼ 14:15-14:17 (88s, 67 words)      │
│   "First line of entry..."          │
│                                     │
├─────────────────────────────────────┤
│ ┌─────────────────────────────────┐ │
│ │                                 │ │
│ │     [Active Text Area]          │ │
│ │                                 │ │
│ │                                 │ │
│ └─────────────────────────────────┘ │
│                                     │
│ [🎤] [Save Entry (Ctrl+Enter)]     │
│                                     │
│ Currently: 143 words, 2:34         │
└─────────────────────────────────────┘
```

## Functional Requirements

### Entry Creation:
1. **Start:** Focus textarea → Start tracking
2. **During:** Track all keystrokes, pauses, edits
3. **Save:** 
   - Append to today's .md file
   - Save metadata to frontmatter
   - Clear textarea
   - Add to collapsed list above
4. **Immutable:** Once saved, no editing through UI

### Display Previous Entries:
- Show today's entries in collapsed format
- Display: Time range, duration, word count, first line
- Click to expand and read (read-only)
- No edit buttons or options

### Metadata Collection Rules:
- **Pause Detection:** Gap > 3 seconds = pause
- **Session Start:** First focus OR first keystroke (whichever is clearer)
- **Session End:** Save button click
- **Background:** Track even if window loses focus

## Technical Implementation Notes

### State Management:
```javascript
// Minimal state - just current entry tracking
const state = {
  currentEntry: {
    text: '',
    metadata: EntryMetadata
  },
  todaysEntries: Entry[] // Read from file on load
}
```

### File Operations:
- **Read:** Load today's file on app start
- **Append:** Add new entry to file
- **Create:** If no file exists for today
- **No Delete/Edit** operations exposed

### Event Handlers:
```javascript
textarea.addEventListener('focus', startTracking);
textarea.addEventListener('blur', pauseTracking);
textarea.addEventListener('keydown', trackKeystroke);
textarea.addEventListener('paste', trackPaste);
saveButton.addEventListener('click', saveEntry);
```

## What NOT to Build (Yet)

- ❌ Search functionality
- ❌ AI analysis or insights  
- ❌ Chat/conversation features
- ❌ Entry categorization
- ❌ Export features
- ❌ Multi-day views
- ❌ Statistics dashboard
- ❌ Cloud sync
- ❌ Entry templates

## Success Criteria

The feature is successful if:
1. Opening the app and starting to type takes < 2 seconds
2. No decisions required before typing
3. Saves complete metadata without user awareness
4. Previous entries visible but not editable
5. Works offline completely
6. Creates human-readable .md files

## Migration Path from Current Code

1. **Strip Phase System:**
   - Remove all timer-related state
   - Delete phase components
   - Remove guided prompt displays

2. **Simplify Text Input:**
   - Keep textarea
   - Remove all structured input fields
   - Make previous entries read-only

3. **Add Tracking:**
   - Implement EntryTracker class
   - Add keystroke listeners
   - Track pauses and timing

4. **Modify Save:**
   - Change from overwrite to append
   - Add metadata to frontmatter
   - Clear textarea after save

5. **Update Display:**
   - Create collapsed entry list component
   - Remove all editing capabilities
   - Show only time, duration, word count

---

## Implementation Checklist

### Phase 1 - Strip (30 min)
- [ ] Remove timer components
- [ ] Remove phase system
- [ ] Remove structured forms
- [ ] Remove prompt files

### Phase 2 - Modify (45 min)
- [ ] Convert save to append-only
- [ ] Make entries read-only
- [ ] Update file structure
- [ ] Simplify UI to single textarea

### Phase 3 - Add (45 min)
- [ ] Implement EntryTracker
- [ ] Add keystroke monitoring
- [ ] Save metadata to frontmatter
- [ ] Create collapsed entry display

### Phase 4 - Test (30 min)
- [ ] Test multiple entries per day
- [ ] Verify metadata accuracy
- [ ] Check file format
- [ ] Ensure no data loss

**Total: ~2.5 hours to migrate existing code**