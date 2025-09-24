# Product scope (single-user, rapid delivery)

* **Primary goal:** a private, local-first AI journaling web app that supports **dictation**, **standard chat**, and **Markdown-based storage/indexing**.
* **Audience:** just you (single user). No auth, no multi-tenant.
* **Bias:** simplest thing that works; add knobs for dev-time flexibility.

---

# Must-have user stories (M)

* **M1 — Dictate an entry:** I can press/hold a mic button and speak. The app transcribes and inserts text into today’s journal session.
* **M2 — Chat about my day:** I can ask the AI questions in a chat panel during the session; it replies using my past Markdown as context.
* **M3 — Save everything to Markdown:** Each session is persisted as `.md` files (transcript, prompts, AI replies, and metadata).
* **M4 — Use my MD as context:** The AI automatically pulls relevant snippets from prior `.md` files to ground replies.
* **M5 — Follow the “15-Minute Framework”:** App guides me through Opening → Three-Problem Rule → Pattern Check → Closing, with simple timers.
* **M6 — Local-first + private:** Runs locally; nothing leaves my machine unless I paste in an API key intentionally.
* **M7 — Prompt-tunable:** Prompts live in editable files; I can easily tweak tone/role/goals without touching app code.
* **M8 — Calm UI:** Minimal, low-stimulus layout; dark/light toggle; one primary accent; distraction-free writing.

---

# Should-have user stories (S)

* **S1 — Quick search:** Search across Markdown by keyword and by semantic similarity.
* **S2 — “Recurring theme” nudge:** If topics appear ≥3 days in 24h windows, surface a gentle “dedicated session” suggestion.
* **S3 — Import existing Markdown:** Drop an existing MD folder to seed the context vault.
* **S4 — Export / backup:** Zip the vault; everything stays plain files.

---

# Could-have user stories (C)

* **C1 — On-device encryption:** Optional local encryption of the vault (file-level or disk/OS-level).
* **C2 — Tags & mood:** Quick tags and 1–5 mood slider stored in front-matter.

---

# Functional requirements

## A. Dictation

* **Primary STT path (local):** Use a local Whisper variant (e.g., `faster-whisper` or `whisper.cpp`) launched as a local service/process the app calls.
* **Fallback STT path (browser):** Web Speech API if available (clearly labeled as non-private and quality varies).
* **Controls:** start/stop button, live transcript, fix-typo quick actions (comma/period/undo last sentence).
* **Latency target:** <1.5s perceived delay for interim text; final text stabilized within a few seconds after pause.

## B. Chat

* **LLM backends (selectable):**

  * Local: **Ollama** (default) — model selectable (e.g., llama-3.\*), temperature/top-p sliders.
  * Remote: OpenAI-compatible endpoint via user-supplied API key (explicit opt-in).
* **Context injection:** RAG over the Markdown vault (see “Indexing & context”).
* **Threading:** Each day/session has a chat thread; messages appended to that day’s `.md` (or a paired `.chat.md`).

## C. The 15-Minute Framework flow

* **Timers:** 2m Opening, 9m “Three-Problem Rule” (3×3m), 2m Pattern Check, 2m Closing.
* **Guided prompts** (shown inline as gentle hints):

  * Opening prompt: “Here’s what’s weighing on me today…”
  * For each problem: what happened, feelings, control vs. not, one small action.
  * Pattern check: “Recurring theme from previous days?”
  * Closing: “Tomorrow I will… I’m letting go of…”
* **Rule hints:** “Be specific,” “Use ‘I’ statements,” “No self-censoring,” “Problem vs. vent,” “24-hour rule.”

## D. Markdown storage

* **Vault structure (default in `~/JournalAI`):**

  ```
  /vault
    /sessions/YYYY/MM/
      YYYY-MM-DD.session.md         # primary journal
      YYYY-MM-DD.chat.md            # chat transcript (optional; or embed in session)
    /indices/
      embeddings.sqlite             # local vector index (see below)
    /config/
      prompts/
        system.md
        reflection.md
        summarizer.md
      settings.json
  ```

* **Front-matter schema (YAML) for `*.session.md`:**

  ```yaml
  ---
  date: 2025-09-24
  duration_minutes: 15
  tags: [work, personal]         # optional
  mood: 3                        # optional 1..5
  problems:
    - title: "ImmoPass discount requirements"
      control: ["scope clarification", "timebox"]
      not_in_control: ["deadline change"]
      action: "Draft clarifying email to PM"
    - ...
  recurring_theme: "Deadline + unclear requirements"
  closing:
    tomorrow: "Send clarification email by 10:00"
    letting_go: "Scope anxiety outside control"
  ---
  ```

* **Body content:** Sections match the framework, with dictated text and AI summaries inline, e.g.:

  ```
  ## Opening
  [transcribed text]

  ## Three Problems
  ### 1) ...
  ```

* **Chat file (`*.chat.md`) front-matter:**

  ```yaml
  ---
  date: 2025-09-24
  session_file: "./YYYY-MM-DD.session.md"
  model: "llama3:instruct"
  ---
  ```

  Body alternates **User**/**Assistant** blocks in Markdown for readability.

## E. Indexing & context (RAG)

* **Chunking:** Markdown split by headings and paragraphs; target 400–800 tokens per chunk.
* **Embeddings:** Local embedding model (via Ollama) if available; otherwise OpenAI embeddings when API key provided.
* **Store:** Local **SQLite** (single file) with a vector extension (e.g., `sqlite-vss` or `sqlite-vec`) to keep dependencies simple.
* **Retrieval:** Top-k (k=5–8) by cosine similarity + recency boost (e.g., decayed score).
* **Safety rails:** Never leak the entire vault; only inject retrieved snippets + citations (file + heading) into the prompt.

## F. Prompting system (developer-friendly)

* **Prompt files:** Editable Markdown under `/config/prompts`.
* **Composition:** Final system prompt = `system.md` + dynamic context headers + user message; selectable “mode” prompts (e.g., `reflection.md`).
* **Tuning knobs in `settings.json`:**

  * `model`, `temperature`, `top_p`, `max_tokens`
  * `retriever.k`, `retriever.recency_boost`
  * `tone`: “supportive, non-judgmental, specific, action-oriented”
* **Prompt goals (must):**

  * Active listening (“reflect, paraphrase, clarify”)
  * Gentle constraint to the 15-minute phases
  * Distinguish “vent” vs “solve”
  * Ask focused follow-ups; prioritize **specifics** and **one small next action**
  * Encourage recognition of control vs. not-control
  * Nudge for recurring themes if evidence appears

---

# Non-functional requirements

## Performance

* App load <1s after warm cache.
* New response round-trip (LLM) under 5s with context (dependent on model).
* STT interim text updates at least every \~500ms when streaming is available.

## Privacy & security

* Default **no network calls** unless:

  * User toggles “Use remote LLM/STT” and provides an API key.
* API keys stored **only** in a local config file (`settings.json`) or OS keychain.
* Clear banner when remote services are active.

## Reliability

* Auto-save every 5 seconds and on blur.
* Write-safe Markdown (atomic writes or write-to-temp then rename).
* Index rebuild command available from UI.

## Simplicity / Maintainability

* Minimal services: Astro server, local STT process, optional Ollama.
* Single binary/process orchestration via `npm run dev` (spawns child STT if configured).
* Code structured for small, testable units.

---

# Tech & architecture

## Stack

* **UI:** **Astro** + **TypeScript** (with minimal islands for interactive controls).
* **Styles:** Tailwind (muted palette; large whitespace; calm typography).
* **Server:** Astro API routes (Node) for:

  * STT proxy (to local Whisper server or child process)
  * LLM proxy (Ollama / OpenAI-compatible)
  * RAG endpoints (embed, upsert, query)
  * File I/O (read/write Markdown, list vault)
* **Local processes:**

  * **Ollama** (optional): `ollama run llama3:instruct`
  * **Whisper local**: `faster-whisper` HTTP server or child process via CLI
* **Index:** SQLite + vector extension; schema:

  ```
  documents(id PK, path, title, date, hash)
  chunks(id PK, document_id FK, heading, text, tokens, created_at)
  embeddings(chunk_id FK, vec VECTOR)
  ```

## Directory layout (repo)

```
/app
  /src
    /pages (Astro)
    /components
    /islands
    /server (API routes: stt, llm, rag, files)
    /lib (chunking, embeddings, retrieval, md parser)
    /prompts (dev copies; synced to /vault/config/prompts on first run)
  /scripts (indexer CLI)
  /types
  /styles
/vault (created at first run or user-selected path)
```

---

# UX requirements (calm & simple)

* **Home = Today’s Session**

  * Clock/timer showing current phase; next/prev controls
  * Big text area for transcript; mic button; transcription status
  * Right sidebar “Chat with your journal” (messages, send box)
* **Header:** Vault path, model indicator (local/remote), quick search.
* **Colors:** neutral background, single accent, low saturation.
* **Typography:** readable, larger line height, no animation except subtle focus/hover.
* **Accessibility:** keyboard shortcuts (mic toggle, start next phase, save), aria labels, prefers-color-scheme.

---

# Configuration & operations

* **First-run flow:**

  * Choose vault folder (or accept default).
  * Pick LLM: Ollama (recommended) or API key.
  * Pick STT: local Whisper (recommended) or browser STT.
  * Seed prompts into `/vault/config/prompts`.
* **Settings UI:**

  * Model & decoding params
  * RAG params
  * Dictation engine & mic source
  * Vault location
* **Commands:**

  * `npm run dev` — start Astro, spin up child STT if configured
  * `npm run index` — (re)index vault
  * `npm run build && npm run preview` — production

---

# Testing & acceptance criteria

## Functional acceptance (MVP)

* **Dictation:** Speaking for 10s yields text in Opening section; stop places text at cursor; punctuation hotkeys work.
* **Chat grounding:** Ask “What did I struggle with yesterday?” → reply includes cited snippets from previous day’s `.md` (by heading).
* **Save behavior:** When the timer ends, files `YYYY-MM-DD.session.md` (and optionally `YYYY-MM-DD.chat.md`) exist with correct front-matter and content.
* **Framework flow:** Phase timers advance; UI shows the current phase’s guiding prompt; Closing captures two declarations.
* **Prompt editing:** Editing `/vault/config/prompts/system.md` measurably changes assistant behavior on next message (smoke test).
* **Local-only mode:** With no API keys and Ollama+Whisper running, the app works fully offline.

## Quality checks

* **Index integrity:** After `npm run index`, embeddings count == chunks count; RAG query returns top-k with sensible scores.
* **Theme recurrence:** If a tag or embedding cluster appears ≥3 times across 3 consecutive days, show a “24-hour rule” nudge in the next session.
* **Crash safety:** Simulate app crash while typing; content is present on reopen (auto-save tested).

---

# Prompts (content requirements, not code)

* **System prompt core (must cover):**

  * “You are a non-judgmental journaling companion. Reflect back key points, ask concise clarifying questions, favor specifics over abstractions, help identify what’s in the user’s control, and propose one small next action.”
  * “Respect the session phase (Opening, Three-Problem, Pattern Check, Closing). Keep responses short during time-boxed phases.”
  * “If user is venting, acknowledge feelings first; do not problem-solve until requested.”
  * “Use retrieved context to connect today’s content to prior themes; cite the session date(s) and heading(s) briefly.”
* **Reflection prompt (phase-aware):** tailored bullets for each phase.
* **Summarizer prompt:** end-of-session 3-bullet summary + 1 actionable next step; append to the session file.

---

# Risks & mitigations

* **STT accuracy:** Provide easy correction and “tap to fix punctuation” controls. Allow model size switch (tiny→base→small).
* **Model context limits:** Keep chunks small; limit k; summarize long snippets before injection.
* **Privacy drift:** Loud banner when any cloud key is configured; “Local-only mode” switch.

---

# Delivery plan (ruthlessly simple MVP)

1. **Day 1–2:** Astro shell, vault setup, Markdown write/read, basic session screen.
2. **Day 3:** Local STT wire-up; mic UI; live transcript.
3. **Day 4:** RAG indexer (SQLite + embeddings) + simple retrieval.
4. **Day 5:** LLM chat wired to RAG + system prompt; timers + phase UI.
5. **Day 6:** Prompt files + settings; save flows; acceptance tests.
6. **Day 7:** Polish, nudge rule, search, docs.

