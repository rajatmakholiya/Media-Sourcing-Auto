// src/lib/pipeline-store.ts
// Server-side session-aware store — each user gets isolated pipeline state
// State is keyed by session ID so multiple users can work simultaneously

export type MediaIntent = "portrait" | "action" | "scene" | "event" | "concept";

export type Segment = {
  id: number;
  text: string;
  keyword: string; // kept for backward compat — defaults to image_query
  image_query: string;
  video_query: string;
  /** Canonical subject resolved from script context (pronouns resolved). */
  subject?: string;
  /** Canonical entity names present in this segment — used for relevance scoring. */
  search_entities?: string[];
  /** Negative keywords to filter noise when the subject is ambiguous. */
  exclude_terms?: string[];
  /** Fallback queries to try if the primary returns nothing. */
  alternate_queries?: {
    image?: string[];
    video?: string[];
  };
  /** Visual intent for the segment — drives modifier choice downstream. */
  media_intent?: MediaIntent;
  fallback_from_previous?: boolean;
  word_count: number;
  estimated_duration_sec: number;
};

export type CanonicalEntity = {
  /** The raw mention as it appears in the script (may equal canonical). */
  mention: string;
  /** Fully qualified name (e.g. "Real Madrid CF" for "Madrid"). */
  canonical: string;
  /** Role/affiliation/type (e.g. "Spanish football club", "NFL running back"). */
  role?: string;
};

export type ScriptAnalysis = {
  topic: string;
  tone: string;
  recency: string;
  key_entities: string[];
  /** Disambiguated entity map — resolves pronouns and ambiguous mentions. */
  canonical_entities?: CanonicalEntity[];
  /** Terms that must accompany ambiguous names for correct results. */
  disambiguators?: string[];
};

export type SegmentationResult = {
  script_analysis?: ScriptAnalysis;
  segments: Segment[];
  total_duration_sec: number;
  segment_count: number;
};

export type PipelineStep =
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

export type PipelineState = {
  currentScript: string | null;
  segments: SegmentationResult | null;
  editedSegments: SegmentationResult | null;
  pipelineStep: PipelineStep;
};

// ─── Per-session state store ────────────────────────────
const sessions = new Map<string, PipelineState>();

// Auto-cleanup stale sessions after 2 hours
const SESSION_TTL = 2 * 60 * 60 * 1000;
const sessionTimestamps = new Map<string, number>();

function cleanupStaleSessions() {
  const now = Date.now();
  for (const [id, ts] of sessionTimestamps) {
    if (now - ts > SESSION_TTL) {
      sessions.delete(id);
      sessionTimestamps.delete(id);
      sseClients.delete(id);
    }
  }
}

// Run cleanup every 30 minutes
setInterval(cleanupStaleSessions, 30 * 60 * 1000);

function getOrCreateSession(sessionId: string): PipelineState {
  sessionTimestamps.set(sessionId, Date.now());
  let state = sessions.get(sessionId);
  if (!state) {
    state = {
      currentScript: null,
      segments: null,
      editedSegments: null,
      pipelineStep: "idle",
    };
    sessions.set(sessionId, state);
  }
  return state;
}

// Default session ID for backward compatibility (MCP, etc.)
const DEFAULT_SESSION = "__default__";

// ─── State accessors ────────────────────────────────────

export function getState(sessionId = DEFAULT_SESSION): PipelineState {
  return { ...getOrCreateSession(sessionId) };
}

export function getScript(sessionId = DEFAULT_SESSION): string | null {
  return getOrCreateSession(sessionId).currentScript;
}

export function getSegments(sessionId = DEFAULT_SESSION): SegmentationResult | null {
  return getOrCreateSession(sessionId).segments;
}

export function getPipelineStep(sessionId = DEFAULT_SESSION): PipelineStep {
  return getOrCreateSession(sessionId).pipelineStep;
}

// ─── State mutators ─────────────────────────────────────

export function submitScript(script: string, sessionId = DEFAULT_SESSION) {
  const state = getOrCreateSession(sessionId);
  state.currentScript = script;
  state.segments = null;
  state.editedSegments = null;
  state.pipelineStep = "awaiting_segmentation";

  broadcast(sessionId, "script_submitted", {
    script: state.currentScript,
    wordCount: state.currentScript.split(/\s+/).length,
    pipelineStep: state.pipelineStep,
  });
}

export function submitSegments(result: SegmentationResult, sessionId = DEFAULT_SESSION) {
  const state = getOrCreateSession(sessionId);
  state.segments = result;
  state.pipelineStep = "segmented";

  broadcast(sessionId, "segmentation_complete", {
    segments: state.segments,
    pipelineStep: state.pipelineStep,
  });
}

export function saveEditedSegments(result: SegmentationResult, sessionId = DEFAULT_SESSION) {
  const state = getOrCreateSession(sessionId);
  state.editedSegments = result;
  state.pipelineStep = "editing_complete";

  broadcast(sessionId, "segments_edited", {
    segments: state.editedSegments,
    pipelineStep: state.pipelineStep,
  });
}

export function updatePipelineStep(step: PipelineStep, sessionId = DEFAULT_SESSION) {
  const state = getOrCreateSession(sessionId);
  state.pipelineStep = step;
  broadcast(sessionId, "pipeline_step_changed", { pipelineStep: step });
}

// ─── SSE broadcasting (per-session) ─────────────────────

type SSEClient = {
  id: string;
  controller: ReadableStreamDefaultController;
};

// Map: sessionId -> Map(clientId -> SSEClient)
const sseClients = new Map<string, Map<string, SSEClient>>();

export function addClient(sessionId: string, clientId: string, controller: ReadableStreamDefaultController) {
  if (!sseClients.has(sessionId)) {
    sseClients.set(sessionId, new Map());
  }
  sseClients.get(sessionId)!.set(clientId, { id: clientId, controller });
}

export function removeClient(sessionId: string, clientId: string) {
  sseClients.get(sessionId)?.delete(clientId);
}

function broadcast(sessionId: string, event: string, data: unknown) {
  const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  const encoder = new TextEncoder();
  const clients = sseClients.get(sessionId);

  if (!clients || clients.size === 0) return;

  console.log(`[SSE] Broadcasting "${event}" to ${clients.size} client(s) in session ${sessionId.slice(0, 8)}...`);

  for (const [id, client] of clients) {
    try {
      client.controller.enqueue(encoder.encode(message));
    } catch {
      console.log(`[SSE] Client ${id} disconnected, removing`);
      clients.delete(id);
    }
  }
}
