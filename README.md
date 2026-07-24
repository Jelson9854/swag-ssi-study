# SWAG (Iowa fork)
**Student Writing with Accountable Generative AI**

A research tool for tracking and analyzing student writing processes with LLM assistance. This is a fork of the original SWAG project, adapted for a PID-based research study with no email/password signup and no assignment deadlines.

## Overview

SWAG captures character-level writing interactions to help researchers understand how participants use LLM tools during writing tasks. The system records editing patterns, LLM conversations, and copy-paste behaviors, then provides an interactive replay interface for analysis.

## Key Features

### Participant Portal
- ✅ **PID-based access** - Participants enter a Participant ID (PID) instead of signing up; the same PID resumes their existing sessions
- ✅ **Character-level tracking** - BlockNote document snapshots every 5 steps or 10 seconds
- ✅ **Rich text editor** - BlockNote with headings, lists, code blocks, and formatting
- ✅ **Assignment chat** - One ongoing AI conversation per assignment, with a read-only dropdown to review chats from the participant's other assignments
- ✅ **Copy-paste validation** - Detects and blocks external content, allows chatbot responses
- ✅ **Auto-save** - Batched event storage every 30 seconds or 10 events
- ✅ **Resizable split view** - Adjustable editor/chat panel widths, chat visibly bordered from the editor
- ✅ **Assignment instructions** - Shown by default above the editor, can be hidden
- ✅ **Real-time chat timestamps** - User messages saved immediately, not after AI response
- ✅ **Always-open assignments** - No deadlines; assignments stay accessible until an assignment is manually removed

### Researcher Portal
- ✅ **PID-based access** - A fixed allowlist of admin PIDs (`ADMIN_PIDS`) reaches the researcher dashboard; no login form
- ✅ **Assignment management** - Create assignments with a default AI system prompt (editable per assignment)
- ✅ **Participant progress dashboard** - View all participant sessions with word counts and activity
- ✅ **Interactive replay** - Full-fidelity BlockNote rendering with all block types
- ✅ **Conversation management** - View chat history alongside writing process
- ✅ **Timeline visualization** - Chat messages, paste events, and typing activity markers
- ✅ **SCORE** - Intent-based classification/rating layer for analyzing chat queries (see `docs/`)

## Tech Stack

- **Framework**: Next.js 15 + React 19
- **Editor**: BlockNote 0.42 (Notion-like UX)
- **Chat**: OpenAI API (default model: `gpt-5.6-luna`, configurable via `OPENAI_MODEL`)
- **Database**: PostgreSQL (Neon, via Vercel)
- **ORM**: Drizzle ORM
- **Deployment**: Vercel

## Getting Started

### Prerequisites
- Node.js 18+
- OpenAI API key
- A PostgreSQL database (Neon recommended; see Vercel setup below)

### Installation

```bash
# Install dependencies
npm install

# Setup environment variables
cp .env.example .env.local
# Edit .env.local with your configuration

# Push the schema to your database (requires POSTGRES_URL / DATABASE_URL)
npx drizzle-kit push

# Start development server
npm run dev
```

The dev server runs on **http://localhost:3030**.

### Environment Variables

Required variables (see `.env.example`):
- `POSTGRES_URL` / `DATABASE_URL` - PostgreSQL connection string
- `OPENAI_API_KEY` - Your OpenAI API key
- `OPENAI_MODEL` - Chat model to use (e.g. `gpt-5.6-luna`)
- `NEXT_PUBLIC_APP_URL` - Application URL
- `ADMIN_PIDS` - Comma-separated list of PIDs that get researcher/admin access (e.g. `"jelson-admin,researcher2"`)
- `SCORE_LLM_CONCURRENCY` - Max concurrent OpenAI calls for SCORE classification batches (optional, defaults to 32)

There is no email service, JWT secret, or password-related configuration in this fork — identity is entirely PID-based.

### Deploying on Vercel

1. Create a Vercel project linked to your fork of this repo.
2. Add a Postgres database from the Storage tab (Neon-backed) — this auto-injects `POSTGRES_URL`/`DATABASE_URL` and related vars into your project's environment variables.
3. Add the remaining variables above (`OPENAI_API_KEY`, `OPENAI_MODEL`, `ADMIN_PIDS`, `NEXT_PUBLIC_APP_URL`) via `vercel env add <NAME> <environment>` or the dashboard, for Production, Preview, and Development.
4. Push the schema to the new database: `npx drizzle-kit push` (with `DATABASE_URL` set in your shell).
5. Push to `main` — Vercel auto-deploys on every push once the GitHub repo is connected to the project.

### Accessing the Application

**Root URL:**
- `http://localhost:3030/` - PID entry screen

**Researcher / Admin:**
- Enter a PID listed in `ADMIN_PIDS` at the root → routes to `/instructor/dashboard`
- `http://localhost:3030/instructor/assignments/[id]/replay/[sessionId]` - Participant session replay

**Participant Portal:**
- Enter any other PID at the root → routes to `/participant`, a list of all assignments
- Selecting an assignment shows its instructions, then opens the editor with AI chat
- The same PID always resumes that participant's existing sessions

## Project Structure

```
swag-ssi-study/
├── src/
│   ├── app/
│   │   ├── page.tsx                          # PID entry screen
│   │   ├── participant/page.tsx              # Participant's assignment list
│   │   ├── s/[shareToken]/                   # Assignment landing + editor
│   │   │   ├── page.tsx                      # Instructions + continue button
│   │   │   └── editor/[sessionId]/page.tsx   # Writing interface
│   │   ├── instructor/
│   │   │   ├── dashboard/page.tsx            # Assignment list (researcher)
│   │   │   ├── assignments/[id]/page.tsx     # Participant sessions
│   │   │   ├── assignments/[id]/score/       # SCORE viewer
│   │   │   └── replay/[sessionId]/           # Replay viewer
│   │   └── api/
│   │       ├── pid/                          # PID login/logout/me
│   │       ├── chat/route.ts                 # OpenAI streaming chat
│   │       ├── conversations/                # Chat CRUD operations
│   │       ├── participant/assignments/      # Cross-assignment chat listing
│   │       └── editor-events/save/route.ts   # Event batching endpoint
│   ├── components/
│   │   ├── editor/
│   │   │   ├── TrackedEditor.tsx             # BlockNote with event tracking
│   │   │   └── EditorClient.tsx              # Editor + chat split view
│   │   └── chat/
│   │       ├── ChatPanel.tsx                 # Chat container with conversations
│   │       ├── AssignmentChatSwitcher.tsx    # Read-only cross-assignment chat dropdown
│   │       └── ChatMessages.tsx              # Message rendering
│   ├── lib/
│   │   ├── event-tracker.ts                  # BlockNote transaction tracking
│   │   ├── copy-validator.ts                 # Paste detection and validation
│   │   ├── auth.ts                           # PID-based identity resolution
│   │   └── assignment-ai.ts                  # Default AI system prompt / guidance
│   └── db/
│       ├── schema.ts                         # PostgreSQL schema (Drizzle ORM)
│       └── migrations/                       # SQL migration files
```

## Architecture Highlights

### PID-Based Identity
- No passwords, email verification, or JWT sessions.
- Admin PIDs are a fixed env-var allowlist (`ADMIN_PIDS`); any other PID is treated as a participant.
- A participant's PID (`studentSessions.participantToken`) is the identity key — the same PID always resumes that participant's sessions, one row per `(assignment, PID)`.
- Logout (available on both the participant and researcher headers) clears the PID cookie so a different PID can be entered.

### Document Tracking System
**BlockNote Editor Integration:**
- Full document snapshots every 5 editor steps or 10 seconds
- Captures all block types: paragraphs, headings, lists, code blocks
- Preserves inline formatting: bold, italic, code, links
- JSON-based document structure for reliable replay

**Event Timeline:**
- User chat messages timestamped at send time (not after AI response)
- Editor snapshots with sequence numbers
- Paste events (internal vs external) with content validation
- All events stored with millisecond-precision timestamps

### Copy-Paste Detection
**Smart Content Validation:**
- Fuzzy matching (95% similarity) to identify AI-generated content
- Allows pasting from AI assistant, blocks external sources
- Toast notifications for blocked paste attempts
- Configurable content length thresholds

**Detection Modes:**
- Exact match: Character-for-character comparison
- Substring match: Finds AI content within larger selections (10+ chars)
- Fuzzy match: Levenshtein distance for edited AI responses (20+ chars)

### Real-Time Event Storage
**Batched Saves:**
- Client-side event queue with automatic batching
- Saves every 30 seconds or after 10 events (whichever comes first)
- Force save on tab close to prevent data loss
- Visual "Saved" indicator for user feedback

**Database Design:**
- PostgreSQL with Drizzle ORM
- Separate tables for editor events and chat messages
- Indexed by session ID and timestamp for fast replay queries
- Foreign key relationships for data integrity

### Interactive Replay
**Full-Fidelity Rendering:**
- Uses same BlockNote editor in read-only mode
- All formatting and block types displayed exactly as written
- Side-by-side editor and chat view
- Timeline scrubbing with visual event markers

**Playback Controls:**
- Variable speed: 0.5x to 10x
- Click timeline to jump to any point
- Pause/resume with keyboard shortcuts
- Color-coded markers for chat, internal paste, external paste attempts

### AI System Prompt
- Each assignment has a `customSystemPrompt` field (required, defaults to a research-scenario prompt guiding the AI to support research/reasoning without generating arguments for the participant).
- Researchers can override this per assignment when creating/editing it.
- Optionally, the assignment's instructions can also be injected into the prompt via a checkbox.

## Database Management

```bash
# Push schema changes directly to the database (no migration files)
npx drizzle-kit push

# Or generate a migration file first, then apply it
npx drizzle-kit generate
npx drizzle-kit migrate

# View database in Vercel dashboard
# Go to Storage → your database → Data tab

# Or connect with psql locally
psql $DATABASE_URL
```

## License

MIT

## Contact

For questions or collaboration opportunities, please open an issue on GitHub.
