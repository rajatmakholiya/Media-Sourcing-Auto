# ScriptVideo — Comprehensive Project Documentation

> AI-powered video production platform that transforms scripts into fully-produced social media videos.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Tech Stack](#2-tech-stack)
3. [Project Structure](#3-project-structure)
4. [Environment Variables & API Keys](#4-environment-variables--api-keys)
5. [System Requirements](#5-system-requirements)
6. [Installation & Setup](#6-installation--setup)
7. [Core Workflow & Process Flow](#7-core-workflow--process-flow)
8. [API Endpoints Reference](#8-api-endpoints-reference)
9. [Core Libraries & Methods](#9-core-libraries--methods)
10. [Data Structures & Types](#10-data-structures--types)
11. [Remotion Video Rendering](#11-remotion-video-rendering)
12. [UI Components](#12-ui-components)
13. [Session & State Management](#13-session--state-management)
14. [Media Search Intelligence](#14-media-search-intelligence)
15. [Docker & Deployment](#15-docker--deployment)
16. [Scripts & npm Commands](#16-scripts--npm-commands)
17. [Error Handling & Resilience](#17-error-handling--resilience)
18. [Special Features](#18-special-features)

---

## 1. Project Overview

**ScriptVideo** is a Next.js full-stack application that automates the creation of social media videos from raw text scripts. It provides two primary tools:

| Tool | Purpose |
|------|---------|
| **Media Sourcing Assistant** | Find and organize media for MSN Slideshows and Videos |
| **Video Generator** | End-to-end script-to-video pipeline with AI segmentation, TTS voiceover, media selection, and automated Remotion rendering |

### High-Level Architecture

```
User (Browser)
  │
  ├─ Next.js Frontend (React 19, Tailwind CSS 4)
  │   ├─ Pipeline Shell (5-step wizard)
  │   ├─ Media Sourcing UI
  │   └─ SSE real-time updates
  │
  ├─ Next.js API Routes (Backend)
  │   ├─ Claude AI (Anthropic) — script segmentation
  │   ├─ ElevenLabs / OpenAI — TTS voiceover
  │   ├─ Google Serper — image/video search
  │   ├─ Firecrawl — deep web scraping
  │   └─ Upstash Redis — job state persistence
  │
  └─ Remotion Renderer (Child Process)
      ├─ Asset downloading
      ├─ Chromium-based frame rendering
      └─ H.264 MP4 output
```

---

## 2. Tech Stack

| Category | Technology | Version |
|----------|-----------|---------|
| Framework | Next.js | 16.2.1 |
| Frontend | React | 19.2.4 |
| Styling | Tailwind CSS | 4 |
| Language | TypeScript | 5 |
| Video Rendering | Remotion | 4.0.441 |
| State (Production) | Upstash Redis | — |
| Icons | Lucide React | — |
| Linting | ESLint | 9 |
| Containerization | Docker (multi-stage) | — |
| Deployment | Render.com | — |

### Key Dependencies

```
@anthropic-ai/sdk          — Claude API client
@remotion/cli              — Remotion CLI tools
@remotion/renderer         — Programmatic rendering
@remotion/bundler          — Bundle Remotion compositions
@upstash/redis             — Serverless Redis client
@mendable/firecrawl-js     — Web scraping API client
lucide-react               — Icon components
```

---

## 3. Project Structure

```
MSN Video Automation/
│
├── src/
│   ├── app/                              # Next.js App Router
│   │   ├── layout.tsx                    # Root layout (HTML shell)
│   │   ├── page.tsx                      # Home page with tool links
│   │   │
│   │   ├── api/                          # ── API Routes ──
│   │   │   ├── segment/route.ts          # POST — Claude script segmentation
│   │   │   ├── submit-script/route.ts    # POST — Submit script to pipeline
│   │   │   ├── save-segments/route.ts    # POST — Save edited segments
│   │   │   ├── voiceover/route.ts        # POST — TTS generation
│   │   │   ├── events/route.ts           # GET  — SSE real-time events
│   │   │   ├── state/route.ts            # GET  — Current pipeline state
│   │   │   ├── media-search/route.ts     # POST — Legacy media search
│   │   │   │
│   │   │   ├── media-sourcing/           # MSN-specific endpoints
│   │   │   │   ├── segment/route.ts      # POST — Claude segmentation (MSN)
│   │   │   │   └── search/route.ts       # POST — Serper + Firecrawl search
│   │   │   │
│   │   │   └── export/                   # Rendering endpoints
│   │   │       ├── route.ts              # POST — Start render / GET — Job status
│   │   │       └── download/route.ts     # GET  — Download rendered MP4
│   │   │
│   │   └── tools/                        # ── Page Routes ──
│   │       ├── media-sourcing/page.tsx    # Media Sourcing Assistant UI
│   │       └── video-generator/page.tsx   # Video Generator UI
│   │
│   ├── components/                        # ── React Components ──
│   │   ├── pipeline/
│   │   │   ├── PipelineShell.tsx          # Main 5-step pipeline orchestrator
│   │   │   ├── ScriptInput.tsx            # Step 0: Script input + AI segmentation
│   │   │   ├── SegmentEditor.tsx          # Step 1: Edit/merge/split segments
│   │   │   ├── VoiceoverStep.tsx          # Step 2: TTS voiceover generation
│   │   │   ├── MediaSelection.tsx         # Step 3: Image/video selection per segment
│   │   │   └── PreviewExport.tsx          # Step 4: Preview + export settings
│   │   └── ui/                            # Shared UI components (buttons, inputs, etc.)
│   │
│   ├── lib/                               # ── Core Business Logic ──
│   │   ├── pipeline-store.ts              # Session-aware pipeline state + SSE broadcasting
│   │   ├── job-store.ts                   # Redis-backed export job state
│   │   ├── session.ts                     # Client-side session ID management
│   │   ├── media-search.ts               # Media search engine (Serper + Firecrawl)
│   │   ├── search-optimizer.ts            # Query generation, scoring, deduplication
│   │   ├── remotion-config.ts             # Video composition builder
│   │   └── use-pipeline-events.ts         # React hook for SSE subscription
│   │
│   └── remotion/                          # ── Remotion Video Compositions ──
│       ├── index.ts                       # Remotion entry point
│       ├── Root.tsx                        # Composition registry
│       ├── compositions/
│       │   └── VideoComposition.tsx        # Main video composition (segments + overlays)
│       └── components/
│           ├── SegmentClip.tsx             # Media display with Ken Burns effect
│           ├── CaptionOverlay.tsx          # Captions with 4 animation styles
│           └── Transition.tsx              # 8+ transition types
│
├── scripts/
│   └── render.mjs                         # Standalone render script (child process)
│
├── public/                                # Static assets
├── package.json                           # Dependencies & scripts
├── next.config.ts                         # Next.js configuration
├── tsconfig.json                          # TypeScript configuration
├── Dockerfile                             # Multi-stage Docker build
├── render.yaml                            # Render.com deployment config
└── .env.example                           # Environment variable template
```

---

## 4. Environment Variables & API Keys

Create a `.env.local` file in the project root with the following variables:

### Required API Keys

| Variable | Service | Purpose | How to Obtain |
|----------|---------|---------|---------------|
| `ANTHROPIC_API_KEY` | Anthropic (Claude) | Script segmentation & content analysis | [console.anthropic.com](https://console.anthropic.com) |
| `SERPER_API_KEY` | Google Serper | Fast Google Images/Videos search | [serper.dev](https://serper.dev) |
| `FIRECRAWL_API_KEY` | Firecrawl | Deep web scraping for media extraction | [firecrawl.dev](https://firecrawl.dev) |

### Optional API Keys

| Variable | Service | Purpose | How to Obtain |
|----------|---------|---------|---------------|
| `ELEVENLABS_API_KEY` | ElevenLabs | High-quality TTS voiceover | [elevenlabs.io](https://elevenlabs.io) |
| `OPENAI_API_KEY` | OpenAI | Alternative TTS provider | [platform.openai.com](https://platform.openai.com) |
| `PEXELS_API_KEY` | Pexels | Stock media (images/videos) | [pexels.com/api](https://www.pexels.com/api/) |

### Infrastructure (Production)

| Variable | Service | Purpose | How to Obtain |
|----------|---------|---------|---------------|
| `UPSTASH_REDIS_REST_URL` | Upstash Redis | Distributed job state persistence | [upstash.com](https://upstash.com) |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis | Authentication token | [upstash.com](https://upstash.com) |

### Example `.env.local`

```env
# Required
ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxxx
SERPER_API_KEY=xxxxxxxxxxxxxxxxxxxxxxxx
FIRECRAWL_API_KEY=fc-xxxxxxxxxxxxx

# Optional — TTS
ELEVENLABS_API_KEY=xxxxxxxxxxxxx
OPENAI_API_KEY=sk-xxxxxxxxxxxxx

# Optional — Stock media
PEXELS_API_KEY=xxxxxxxxxxxxx

# Production only — Redis
UPSTASH_REDIS_REST_URL=https://xxx.upstash.io
UPSTASH_REDIS_REST_TOKEN=xxxxxxxxxxxxx
```

> **Note:** If no TTS API keys are configured, the voiceover step falls back to "demo mode" which estimates durations without generating audio. If no media search keys are configured, placeholder results are shown.

---

## 5. System Requirements

### Local Development

| Requirement | Minimum |
|-------------|---------|
| Node.js | v20+ |
| npm | v9+ |
| RAM | 4 GB (8 GB recommended for rendering) |
| Chromium | Auto-installed by Remotion |

### Docker / Production

| Requirement | Details |
|-------------|---------|
| Docker | For containerized builds |
| Chromium | Installed in Dockerfile for headless rendering |
| Build tools | Python 3, make, g++ (included in Docker builder stage) |
| Fonts | Liberation, Noto Color Emoji (installed in Docker) |

---

## 6. Installation & Setup

### Local Development

```bash
# 1. Clone the repository
git clone <repository-url>
cd "MSN Video Automation"

# 2. Install dependencies
npm install

# 3. Create environment file
cp .env.example .env.local
# Edit .env.local and add your API keys

# 4. Start development server
npm run dev
```

The app will be available at `http://localhost:3000`.

### Docker Build

```bash
# Build the image
docker build -t scriptvideo .

# Run the container
docker run -p 3000:3000 \
  -e ANTHROPIC_API_KEY=your_key \
  -e SERPER_API_KEY=your_key \
  -e FIRECRAWL_API_KEY=your_key \
  scriptvideo
```

---

## 7. Core Workflow & Process Flow

### Video Generator Pipeline (5 Steps)

```
┌─────────────────────────────────────────────────────────────────┐
│                    STEP 0: SCRIPT INPUT                         │
│                                                                 │
│  User pastes raw script text                                    │
│       │                                                         │
│       ▼                                                         │
│  POST /api/segment                                              │
│       │                                                         │
│       ▼                                                         │
│  Claude AI analyzes script:                                     │
│   • Breaks into 5-12 word segments at natural pauses            │
│   • Generates image_query (optimized for image search)          │
│   • Generates video_query (optimized for video search)          │
│   • Analyzes: topic, tone, recency, key_entities                │
│   • Estimates duration per segment (~150 words/min)             │
│       │                                                         │
│       ▼                                                         │
│  Returns: segments[], total_duration, segment_count             │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                   STEP 1: SEGMENT EDITOR                        │
│                                                                 │
│  User reviews AI-generated segments                             │
│   • Edit segment text                                           │
│   • Edit media search queries                                   │
│   • Merge adjacent segments                                     │
│   • Split segments                                              │
│   • Reorder segments                                            │
│       │                                                         │
│       ▼                                                         │
│  POST /api/save-segments (saves edited version)                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                  STEP 2: VOICEOVER GENERATION                   │
│                                                                 │
│  User selects TTS provider:                                     │
│   • ElevenLabs (high-quality, requires API key)                 │
│   • OpenAI TTS (alternative, requires API key)                  │
│   • Upload custom audio file                                    │
│   • Demo mode (duration estimation only, no audio)              │
│       │                                                         │
│       ▼                                                         │
│  POST /api/voiceover (for each segment)                         │
│       │                                                         │
│       ▼                                                         │
│  Returns: base64 audio + duration per segment                   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                   STEP 3: MEDIA SELECTION                       │
│                                                                 │
│  For each segment:                                              │
│   • Auto-searches using image_query and video_query             │
│   • POST /api/media-search (parallel requests)                  │
│   • Results from Serper (fast) + Firecrawl (supplementary)      │
│   • Displays thumbnails: images and videos                      │
│   • User clicks to select or uploads custom media               │
│   • Auto-advances to next unselected segment                    │
│   • Progress indicator: "X/Y segments selected"                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                  STEP 4: PREVIEW & EXPORT                       │
│                                                                 │
│  Configure export settings:                                     │
│   ├─ Resolution: 720p / 1080p / 4K                              │
│   ├─ Aspect Ratio: 9:16 (vertical) / 16:9 (landscape) / 1:1    │
│   ├─ FPS: 24 / 30 / 60                                         │
│   ├─ Transitions: crossfade, slide, wipe, zoom, blur-fade, etc. │
│   ├─ Captions: style, position, font size, color                │
│   ├─ Ken Burns: enabled/disabled, intensity                     │
│   ├─ Background music volume                                    │
│   └─ Voiceover volume                                           │
│       │                                                         │
│       ▼                                                         │
│  POST /api/export (builds composition, spawns render job)       │
│       │                                                         │
│       ▼                                                         │
│  Child process: node scripts/render.mjs                         │
│   1. Downloads all media assets to temp directory               │
│   2. Starts local HTTP server for assets                        │
│   3. Bundles Remotion composition                               │
│   4. Renders frames via Chromium → H.264 MP4                    │
│   5. Reports progress: PROGRESS:stage:percentage                │
│       │                                                         │
│       ▼                                                         │
│  GET /api/export/download?job_id={id} → MP4 file                │
└─────────────────────────────────────────────────────────────────┘
```

### Media Sourcing Assistant Pipeline

```
Phase 1: INPUT
  ├─ Select mode: "MSN Slideshow" (images only) or "MSN Video" (images + video)
  ├─ Paste article or script text
  └─ Click "Process"

Phase 2: AI PROCESSING
  ├─ POST /api/media-sourcing/segment
  ├─ Claude analyzes content → breaks into slides/segments
  └─ Returns: slides with image_query (+ video_query for video mode)

Phase 3: MEDIA SELECTION
  ├─ Expand each slide → triggers search
  ├─ POST /api/media-sourcing/search (Serper + Firecrawl)
  ├─ Select image/video per slide or upload custom
  └─ "Search all" button for batch searching

Phase 4: EXPORT
  ├─ "Export media list" → JSON download
  └─ Includes: slide_id, text, subject, queries, selected_media URLs
```

---

## 8. API Endpoints Reference

### `POST /api/segment`

Segments a script into media-ready chunks using Claude AI.

**Request Body:**
```json
{
  "script": "Your full script text here...",
  "mode": "video"
}
```

**Response:**
```json
{
  "segments": [
    {
      "id": 1,
      "text": "The stock market surged today",
      "keyword": "stock market surge",
      "image_query": "stock market trading floor rally",
      "video_query": "stock exchange traders celebrating",
      "word_count": 5,
      "estimated_duration_sec": 2.0
    }
  ],
  "total_duration_sec": 45.2,
  "segment_count": 15,
  "analysis": {
    "topic": "finance",
    "tone": "informative",
    "recency": "current",
    "key_entities": ["NYSE", "S&P 500"]
  }
}
```

**Notes:**
- Uses Claude with a detailed system prompt enforcing subject-first query rules
- Retry logic: 3 attempts for HTTP 429/529 (rate limit / overload)
- JSON recovery for truncated AI responses

---

### `POST /api/submit-script`

Submits raw script to the pipeline session.

**Request Body:**
```json
{
  "script": "Your script text...",
  "sessionId": "uuid-string"
}
```

**Response:**
```json
{ "ok": true }
```

---

### `POST /api/save-segments`

Saves user-edited segments back to the pipeline.

**Request Body:**
```json
{
  "segments": { /* SegmentationResult */ },
  "sessionId": "uuid-string"
}
```

---

### `POST /api/voiceover`

Generates TTS audio for script segments.

**Request Body:**
```json
{
  "segments": [
    { "id": 1, "text": "Segment text here" }
  ],
  "provider": "elevenlabs",
  "voice_id": "optional-voice-id"
}
```

**Response:**
```json
{
  "results": [
    {
      "id": 1,
      "audio_base64": "base64-encoded-audio...",
      "duration_sec": 2.5,
      "provider": "elevenlabs"
    }
  ]
}
```

**Providers:**
| Provider | Requires | Quality |
|----------|----------|---------|
| `elevenlabs` | `ELEVENLABS_API_KEY` | High (natural voices) |
| `openai` | `OPENAI_API_KEY` | Good (multiple voices) |
| `demo` | Nothing | No audio (duration estimation only) |

---

### `GET /api/events?session={sessionId}`

Server-Sent Events stream for real-time pipeline updates.

**Event Types:**
| Event | Payload | When |
|-------|---------|------|
| `script_submitted` | `{ script }` | User submits script |
| `segmentation_complete` | `{ segments }` | Claude finishes segmenting |
| `segments_edited` | `{ segments }` | User saves edits |
| `pipeline_step_changed` | `{ step }` | Pipeline advances |

---

### `GET /api/state?session={sessionId}`

Returns current pipeline state for a session.

**Response:**
```json
{
  "currentScript": "...",
  "segments": { /* SegmentationResult */ },
  "editedSegments": { /* SegmentationResult */ },
  "pipelineStep": "media_search"
}
```

---

### `POST /api/media-search`

Searches for images and videos matching a query.

**Request Body:**
```json
{
  "query": "stock market trading floor",
  "type": "image",
  "count": 10
}
```

**Response:**
```json
{
  "results": [
    {
      "id": "unique-id",
      "type": "image",
      "thumbnail": "https://...",
      "preview_url": "https://...",
      "full_url": "https://...",
      "source": "Google",
      "author": "Reuters",
      "width": 1920,
      "height": 1080
    }
  ]
}
```

---

### `POST /api/media-sourcing/segment`

Claude segmentation specifically for MSN content.

**Request Body:**
```json
{
  "text": "Article or script content...",
  "mode": "slideshow"
}
```

**Modes:** `"slideshow"` (images only) or `"video"` (images + video footage)

---

### `POST /api/media-sourcing/search`

Media search for the sourcing assistant (Serper + Firecrawl).

**Request Body:**
```json
{
  "query": "search query",
  "type": "image",
  "count": 12
}
```

---

### `POST /api/export`

Initiates a video rendering job.

**Request Body:**
```json
{
  "composition": { /* VideoComposition object */ },
  "sessionId": "uuid"
}
```

**Response:**
```json
{
  "job_id": "uuid",
  "status": "queued",
  "rendering_mode": "remotion"
}
```

---

### `GET /api/export?job_id={jobId}`

Returns the current status of a rendering job.

**Response:**
```json
{
  "id": "uuid",
  "status": "remotion_rendering",
  "progress": 65,
  "output_url": null,
  "error": null
}
```

**Job Statuses:** `queued` → `downloading` → `preparing` → `remotion_rendering` → `complete` / `error`

---

### `GET /api/export/download?job_id={jobId}`

Downloads the rendered MP4 video file.

**Response:** Binary MP4 file with `Content-Disposition: attachment` header.

---

## 9. Core Libraries & Methods

### `src/lib/pipeline-store.ts` — Pipeline State Management

| Method | Description |
|--------|-------------|
| `getState(sessionId)` | Get full pipeline state for a session |
| `submitScript(script, sessionId)` | Store script and reset pipeline |
| `submitSegments(result, sessionId)` | Store segmentation result from Claude |
| `saveEditedSegments(result, sessionId)` | Store user-edited segments |
| `updatePipelineStep(step, sessionId)` | Advance pipeline to a new step |
| `broadcast(sessionId, event, data)` | Send SSE event to all clients in session |
| `addClient(sessionId, clientId, controller)` | Register SSE client connection |
| `removeClient(sessionId, clientId)` | Unregister SSE client connection |

- Sessions older than **2 hours** are auto-garbage-collected every 30 minutes.

---

### `src/lib/media-search.ts` — Media Search Engine

| Method | Description |
|--------|-------------|
| `searchMedia(options)` | Main search API — parallel Serper + Firecrawl, returns deduplicated + scored results |
| `serperImages(query, count, age)` | Google Images search via Serper API |
| `serperVideos(query, count, age)` | Google Videos search via Serper API |
| `firecrawlGoogleImages(query, count)` | Deep image extraction from web pages |
| `firecrawlGoogleVideos(query, count)` | Video search targeting YouTube, Vimeo, etc. |

- **Timeout:** 10-12 seconds per API call
- **Demo fallback:** Returns placeholder results if no API keys configured

---

### `src/lib/search-optimizer.ts` — Query Intelligence

| Method | Description |
|--------|-------------|
| `generateVideoQueries(keyword, text, age)` | Generate multiple optimized video search queries |
| `generateImageQueries(keyword, text, age)` | Generate multiple optimized image search queries |
| `scoreResult(result)` | Score media results based on resolution, platform, title keywords |
| `deduplicateResults(results)` | Remove duplicate URLs from results |
| `cleanKeyword(keyword)` | Remove filler/abstract words for tighter searches |
| `classifyKeyword(keyword)` | Categorize keyword into domain (tech, business, nature, etc.) |
| `isBlockedDomain(url)` | Check against paywall domains (Shutterstock, Getty, iStock, etc.) |

---

### `src/lib/remotion-config.ts` — Video Composition Builder

| Method | Description |
|--------|-------------|
| `buildComposition(segments, voiceover, media, settings)` | Builds full Remotion composition from pipeline data |
| `assignTransitions(count, transitions)` | Deterministically assigns transitions to avoid consecutive repeats |
| `seededRandom(seed)` | Seeded RNG for reproducible randomization |

---

### `src/lib/job-store.ts` — Export Job State

| Method | Description |
|--------|-------------|
| `createJob(id)` | Create a new export job entry |
| `getJob(id)` | Retrieve job status |
| `updateJob(id, data)` | Update job progress/status |
| `deleteJob(id)` | Remove completed job |

- **Storage:** Redis (production via Upstash) or in-memory Map (development)
- **TTL:** Jobs auto-expire after 2 hours

---

### `src/lib/session.ts` — Client Session Management

| Method | Description |
|--------|-------------|
| `getSessionId()` | Get or create UUID session ID (persisted in localStorage) |

---

### `src/lib/use-pipeline-events.ts` — SSE Hook

| Method | Description |
|--------|-------------|
| `usePipelineEvents(handlers)` | React hook that subscribes to SSE events and calls handler callbacks |

---

## 10. Data Structures & Types

### Segment

```typescript
type Segment = {
  id: number;                        // Sequential ID
  text: string;                      // Segment narration text
  keyword: string;                   // Backward-compatible search keyword
  image_query: string;               // Optimized query for image search
  video_query: string;               // Optimized query for video search
  fallback_from_previous?: boolean;  // Uses previous segment's media as fallback
  word_count: number;                // Number of words in text
  estimated_duration_sec: number;    // Estimated speech duration (~150 WPM)
};
```

### Pipeline State

```typescript
type PipelineStep =
  | "idle"
  | "awaiting_segmentation"
  | "segmented"
  | "editing"
  | "editing_complete"
  | "voiceover"
  | "media_search"
  | "media_selected"
  | "rendering"
  | "done";

type PipelineState = {
  currentScript: string | null;
  segments: SegmentationResult | null;
  editedSegments: SegmentationResult | null;
  pipelineStep: PipelineStep;
};
```

### Video Composition (Remotion Input)

```typescript
type VideoComposition = {
  segments: SegmentComposition[];
  settings: ExportSettings;
  total_duration_sec: number;
  total_frames: number;
  background_music?: { url: string; name: string };
  voiceover_file?: { url: string; name: string };
};

type SegmentComposition = {
  id: number;
  text: string;
  duration_sec: number;
  duration_frames: number;
  media: {
    type: "image" | "video";
    url: string;
    source: string;
  };
  voiceover: {
    audio_base64: string | null;
    provider: string;
  } | null;
  ken_burns_direction: "zoom-in" | "zoom-out" | "pan-left" | "pan-right" | "pan-up" | "pan-down";
  transition_in: TransitionType;
};
```

### Export Settings

```typescript
type ExportSettings = {
  resolution: "720p" | "1080p" | "4k";
  aspect_ratio: "9:16" | "16:9" | "1:1";
  fps: 24 | 30 | 60;
  transitions: TransitionType[];
  captions: {
    enabled: boolean;
    style: "default" | "bold-highlight" | "word-by-word" | "karaoke";
    position: "top" | "center" | "bottom";
    font_size: number;
    color: string;
  };
  ken_burns: {
    enabled: boolean;
    intensity: number;
  };
  music_volume: number;
  voiceover_volume: number;
};
```

### Media Result

```typescript
type MediaResult = {
  id: string;
  type: "image" | "video";
  thumbnail: string;
  preview_url: string;
  full_url: string;
  source: string;              // "Google", "Firecrawl", "Pexels"
  author: string;
  width: number;
  height: number;
  duration_sec?: number;       // For videos only
  title?: string;
  platform?: string;           // "YouTube", "Vimeo", etc.
  page_url?: string;
};
```

### Export Job

```typescript
type ExportJob = {
  id: string;
  status: "queued" | "downloading" | "preparing" | "remotion_rendering" | "complete" | "error";
  progress: number;            // 0-100
  output_url?: string;
  error?: string;
  created_at: string;
};
```

---

## 11. Remotion Video Rendering

### Composition: `ScriptVideo`

The main Remotion composition renders segments sequentially with transitions, captions, and audio.

### Components

#### `VideoComposition.tsx`
- Sequences all segment clips with calculated frame offsets
- Applies global fade in (first 0.5s) and fade out (last 0.5s)
- Overlays vignette gradient for cinematic depth
- Mixes background music and voiceover audio tracks

#### `SegmentClip.tsx`
- Renders image or video media per segment
- Applies **Ken Burns effect** (6 directions cycling):
  - `zoom-in`, `zoom-out`, `pan-left`, `pan-right`, `pan-up`, `pan-down`
- Falls back to black background if media fails to load

#### `CaptionOverlay.tsx`
- Renders captions synchronized with segment timing
- **4 animation styles:**
  - `default` — Simple fade-in text
  - `bold-highlight` — Active word highlighted in bold
  - `word-by-word` — Words appear one at a time
  - `karaoke` — Words highlight sequentially like karaoke

#### `Transition.tsx`
- **8 transition types:**
  - `crossfade` — Opacity blend between segments
  - `slide-left`, `slide-right`, `slide-up` — Directional slides
  - `wipe` — Horizontal wipe reveal
  - `zoom` — Zoom in/out transition
  - `fade-zoom` — Combined fade + zoom
  - `blur-fade` — Blur dissolve effect
  - `none` — Hard cut

### Render Script (`scripts/render.mjs`)

The render script runs as a standalone Node.js child process:

```
Stage 1: DOWNLOAD ASSETS (0-20% progress)
  ├─ Fetch each segment's media URL
  ├─ Validate content-type (image/* or video/*)
  ├─ Save to temp directory (/tmp/exports/{jobId}/)
  └─ Track filename mapping

Stage 2: PREPARE (20-30% progress)
  ├─ Start local HTTP server on random port (9123-10122)
  ├─ Rebuild composition with local file:// URLs
  └─ Serve bundled Remotion app

Stage 3: REMOTION RENDER (30-95% progress)
  ├─ bundle() — Transpile React/TypeScript to JavaScript
  ├─ selectComposition("ScriptVideo") — Load composition
  ├─ renderMedia() — Render to H.264 MP4
  │   ├─ Uses headless Chromium (Puppeteer)
  │   ├─ Reports frame-by-frame progress
  │   └─ Output: /tmp/outputs/{jobId}.mp4
  └─ Cleanup temp files
```

---

## 12. UI Components

### `PipelineShell.tsx` — Pipeline Orchestrator

The main component managing the 5-step wizard:
- Tracks current step and manages navigation
- Passes state between steps
- Shows progress breadcrumbs
- Handles step validation (can't skip ahead without completing prerequisites)

### `ScriptInput.tsx` — Step 0

- Textarea for script input
- "Segment with AI" button triggers Claude API
- Loading spinner during segmentation
- Displays error messages on failure

### `SegmentEditor.tsx` — Step 1

- Editable list of segments
- Inline editing of text and media queries
- Merge and split controls
- Drag-to-reorder (optional)
- Word count and duration estimates per segment

### `VoiceoverStep.tsx` — Step 2

- Provider selection dropdown
- Voice selection (when applicable)
- Generate button per segment or "Generate All"
- Audio playback preview
- Duration display

### `MediaSelection.tsx` — Step 3

- Segment-by-segment media browser
- Search results grid with thumbnails
- Click to select / deselect
- Upload custom media option
- Progress counter: "X/Y selected"
- Auto-advance to next empty segment

### `PreviewExport.tsx` — Step 4

- Export settings panel (resolution, FPS, transitions, captions, etc.)
- "Export Video" button
- Progress bar during rendering
- Download button when complete
- Error display on failure

---

## 13. Session & State Management

### Client-Side Sessions

- Each browser tab generates a unique UUID stored in `localStorage`
- Session ID is sent with every API request
- Enables multiple users/tabs simultaneously

### Server-Side State

- **In-memory Map** stores `sessionId → PipelineState`
- Auto-cleanup: sessions older than 2 hours garbage collected every 30 minutes
- No persistence across server restarts (by design — state is transient)

### Real-Time Updates (SSE)

- Endpoint: `GET /api/events?session={sessionId}`
- Each session maintains a list of connected SSE clients
- `broadcast(sessionId, event, data)` pushes to all clients in that session
- Client-side: `usePipelineEvents(handlers)` hook subscribes and routes events

### Job State (Export)

- **Development:** In-memory Map
- **Production:** Upstash Redis with 2-hour TTL
- Polled by frontend during rendering for progress updates

---

## 14. Media Search Intelligence

### Domain Classification

Keywords are classified into domains for domain-specific search enhancement:

| Domain | Example Keywords | Added Terms |
|--------|-----------------|-------------|
| tech | "AI", "software", "crypto" | "digital interface", "technology" |
| business | "CEO", "revenue", "merger" | "corporate office", "business" |
| nature | "ocean", "forest", "wildlife" | "landscape", "scenic" |
| urban | "city", "skyline", "traffic" | "aerial view", "drone footage" |
| health | "hospital", "vaccine", "fitness" | "medical", "healthcare" |
| food | "restaurant", "recipe", "chef" | "gourmet", "culinary" |
| sports | "championship", "athlete", "goal" | "stadium", "action shot" |
| finance | "stock market", "banking", "inflation" | "financial district", "trading" |

### Scoring Algorithm

Results are scored based on:

| Factor | Points |
|--------|--------|
| 4K resolution (3840+) | +30 |
| Full HD (1920+) | +20 |
| HD (1280+) | +10 |
| Platform: Vimeo | +15 |
| Platform: YouTube | +5 |
| Title contains: "cinematic", "4k", "drone", "aerial" | +10 each |
| Title contains: "reaction", "unboxing", "compilation" | -20 each |
| Blocked domain (Getty, Shutterstock, etc.) | Filtered out |

### Blocked Domains

Media from these paywalled sources are automatically filtered:
- Shutterstock, Getty Images, iStock
- Adobe Stock, Alamy, Depositphotos
- 123RF, Dreamstime, BigStockPhoto

### Query Optimization

- **Abstract term removal:** Words like "concept", "idea", "important", "best" are stripped
- **Subject-first rule:** Queries lead with person/team/place, not action
- **Recency awareness:** Appends current year for current events
- **Multiple queries:** Generates 2-3 variant queries per segment for broader results

---

## 15. Docker & Deployment

### Dockerfile (Multi-Stage Build)

```
Stage 1: BUILDER
  ├─ Base: node:20-slim
  ├─ Install: python3, make, g++ (native module compilation)
  ├─ npm install (all dependencies)
  └─ npm run build (Next.js standalone output)

Stage 2: PRODUCTION
  ├─ Base: node:20-slim
  ├─ Install: chromium, fonts, graphics libraries
  ├─ Copy: standalone build, static assets, scripts, remotion source, node_modules
  ├─ Create: tmp/exports, tmp/outputs directories
  ├─ User: nextjs (non-root)
  ├─ Expose: port 3000
  └─ CMD: node server.js
```

### Key Docker Environment Variables

```dockerfile
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV CHROME_PATH=/usr/bin/chromium
ENV REMOTION_CHROME_EXECUTABLE=/usr/bin/chromium
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
```

### Render.com Deployment (`render.yaml`)

| Setting | Value |
|---------|-------|
| Runtime | Docker |
| Plan | Starter ($7/mo — 512 MB RAM, 0.5 CPU) |
| Region | Oregon (us-west) |
| Health Check | `GET /` |
| Persistent Disk | None (videos are temporary) |

API keys are set manually in the Render dashboard (not synced from repo).

---

## 16. Scripts & npm Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Next.js development server (`http://localhost:3000`) |
| `npm run build` | Build Next.js standalone production output |
| `npm run start` | Start production server |
| `npm run lint` | Run ESLint checks |

### `scripts/render.mjs`

- Standalone Node.js script (not bundled by Next.js)
- Spawned as child process by `POST /api/export`
- Communicates progress via stdout: `PROGRESS:stage:percentage`
- Exit code 0 = success, 1 = failure

---

## 17. Error Handling & Resilience

| Scenario | Handling |
|----------|----------|
| Claude API rate limit (429) | Retry up to 3 times with backoff |
| Claude overload (529) | Retry up to 3 times with backoff |
| Truncated JSON from AI | Attempts JSON repair/recovery |
| Missing API keys | Falls back to demo mode (placeholders) |
| Media download failure | Falls back to black background in video |
| TTS key missing | Demo mode (duration estimation only) |
| Rendering failure | Job status set to "error" with message |
| Session expiry | Auto-cleanup after 2 hours |
| Redis unavailable | Falls back to in-memory Map |
| Search timeout | 10-12s timeout per API call, partial results returned |

---

## 18. Special Features

### Intelligent Ken Burns Effect
- 6-direction cycle: zoom-in → pan-left → zoom-out → pan-right → pan-up → pan-down
- Configurable intensity
- Smooth easing curves

### Caption Styles
- **Default** — Clean fade-in text overlay
- **Bold Highlight** — Active word emphasized in bold
- **Word-by-Word** — Words appear progressively
- **Karaoke** — Sequential word highlighting (karaoke-style)

### Transition Variety
- 8 built-in transitions with deterministic assignment (no consecutive repeats)
- Seeded random distribution for reproducible results

### Multi-Provider TTS
- ElevenLabs for premium natural voices
- OpenAI TTS as alternative
- Custom audio upload support
- Demo mode for quick previews without API keys

### Real-Time Pipeline
- Server-Sent Events for live progress updates
- Per-session broadcasting (multi-user safe)
- Automatic reconnection on connection drop

---

*This document was auto-generated from the ScriptVideo codebase analysis.*
