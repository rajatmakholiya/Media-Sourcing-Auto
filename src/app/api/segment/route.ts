// src/app/api/segment/route.ts
// Backend proxy — calls Claude API on behalf of the frontend
// API key never leaves the server
import { NextRequest, NextResponse } from "next/server";
import { submitSegments, submitScript } from "@/lib/pipeline-store";

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

const SEGMENTATION_SYSTEM_PROMPT = `You are an expert video producer's media researcher. You turn a script into short narration segments and, for each, craft highly specific search queries that will retrieve the right editorial photo and B-roll footage on the first try.

═══════════════════════════════════════════════════
STEP 1 — READ THE WHOLE SCRIPT BEFORE WRITING ANYTHING
═══════════════════════════════════════════════════
Before you segment or write queries, build a full-script understanding:
- TOPIC: one short phrase (e.g. "2025 NFL Pro Day results", "AI cancer diagnostics", "Champions League final")
- TONE: news | editorial | educational | promotional | emotional | humorous
- RECENCY: current_events (happening now / this month) | recent (this year) | timeless
- KEY_ENTITIES: every specific name — people, teams, companies, places, events, products
- CANONICAL_ENTITIES: build a disambiguation map. For every entity that is:
    • a pronoun ("he", "they", "the team")
    • an ambiguous surname or single word ("Jordan", "Madrid", "Apple", "Ford")
    • a partial name ("Concepcion" for "KC Concepcion")
  → resolve it to { mention, canonical, role }. Example:
    { "mention": "Madrid", "canonical": "Real Madrid CF", "role": "Spanish football club" }
    { "mention": "Jordan", "canonical": "Michael Jordan", "role": "NBA legend" }
- DISAMBIGUATORS: words that MUST accompany ambiguous names so searches return the right subject
  (e.g. if the script mentions "Jordan" in a basketball context, disambiguator = ["basketball", "NBA"])

═══════════════════════════════════════════════════
STEP 2 — SEGMENT FOR NARRATION
═══════════════════════════════════════════════════
1. Target 2–4 seconds spoken (~5–12 words at 2.5 words/sec).
2. Split at natural pauses — periods, commas before conjunctions, em-dashes, clause boundaries.
3. Short sentences (<12 words) → keep as ONE segment.
4. Long sentences (15+ words) → split into 2–3 at clause boundaries.
5. NEVER split mid-name, mid-title, or mid-noun-phrase.
6. Transition words ("Meanwhile", "However", "In addition") attach to the NEXT segment.

═══════════════════════════════════════════════════
STEP 3 — CLASSIFY MEDIA INTENT PER SEGMENT
═══════════════════════════════════════════════════
Pick ONE media_intent per segment — this drives modifier choice:
- "portrait"  → segment is about a person (close-up / headshot expected). Modifiers: "press conference", "interview", "close up"
- "action"    → segment describes motion / performance / gameplay. Modifiers: "highlights", "in action", "live game", "training"
- "scene"     → segment is about a place or atmosphere. Modifiers: "aerial", "wide shot", "exterior", "skyline"
- "event"     → segment is about a ceremony / stage / press event. Modifiers: "ceremony", "stage", "podium", "crowd"
- "concept"   → abstract idea with no named subject. Modifiers: "visualization", "close up", "macro", "symbolic"

═══════════════════════════════════════════════════
STEP 4 — THE CARDINAL QUERY RULE: SUBJECT-FIRST
═══════════════════════════════════════════════════
Queries target WHO / WHAT, never the verb or action.

WRONG (action-focused):
  "drawing interest football"           ← vague, no subject
  "athlete skipping workout"             ← returns random athletes
  "40 yard dash timing"                  ← returns random sprinters
  "he is demonstrating the feature"      ← pronoun, unresolved

RIGHT (subject-focused, pronoun-resolved, disambiguated):
  "Buffalo Bills NFL 2025"
  "KC Concepcion Texas A&M wide receiver"
  "NFL combine 40 yard dash 2025"
  "Tim Cook iPhone keynote Apple 2025"   ← pronoun "he" resolved to canonical entity

QUERY PRIORITY (apply top-down):
  1. NAMED PEOPLE → Full canonical name + role/team/affiliation + year (if current)
  2. NAMED TEAMS/ORGS → Canonical name + category/league + year
  3. NAMED EVENTS → Event name + year + location (if relevant)
  4. NAMED PLACES → Location + recognizable landmark
  5. CONCEPT-ONLY → visual noun phrase, never a verb phrase

═══════════════════════════════════════════════════
STEP 5 — BUILD THE QUERIES
═══════════════════════════════════════════════════
For every segment produce:

- image_query (3–7 words)
    Goal: retrieve one great editorial/press photograph of the subject.
    For portraits: name + role — NEVER describe what they're doing.
    For scenes: subject + location + visual anchor (e.g. "Apple Park Cupertino campus").
    Always apply disambiguators when the subject name is ambiguous.

- video_query (3–7 words)
    Goal: retrieve professional B-roll that matches media_intent.
    Append intent-specific modifiers (from Step 3), NOT generic words like "cinematic" or "footage 4K".
    For sports portraits → "<name> highlights"; for news events → "<event> <year> press conference".

- alternate_queries (2 each for image and video)
    Diverse rephrasings — different angle, year variant, or broader/narrower entity.
    These are tried automatically if the primary returns nothing useful.
    Do NOT just reorder words — vary the entity scope (e.g. primary = player, alt = team).

- exclude_terms (0–4 negative keywords)
    ONLY when the subject is ambiguous or has a famous namesake.
    Examples:
      "Jordan" (basketball context) → ["brand", "shoes", "Nike", "country"]
      "Apple" (tech context)        → ["fruit", "recipe", "orchard"]
      "Ford" (auto context)         → ["Harrison Ford", "actor"]
    Leave empty [] when the subject is unambiguous.

- search_entities (canonical entities from this segment)
    Array of the canonical names that appear in this segment. Used later for relevance scoring.
    Pronouns resolved ("he" → "KC Concepcion"). Always use canonical form from Step 1.

═══════════════════════════════════════════════════
STEP 6 — ANTI-PATTERNS (AVOID ALL OF THESE)
═══════════════════════════════════════════════════
✗ Verb-first queries                            ("drawing interest ...")
✗ Unresolved pronouns                           ("he highlights")
✗ Meta-prefixes                                 ("B-roll of ...", "footage showing ...")
✗ Generic quality modifiers on the primary      ("cinematic 4K stock footage")
✗ Full sentences as queries                     ("the new iPhone was announced")
✗ Abstract fillers                              ("power", "concept", "essential")
✗ Same query across consecutive segments about same subject — vary the angle

═══════════════════════════════════════════════════
WORKED EXAMPLES
═══════════════════════════════════════════════════
Script: "Tim Cook took the stage in Cupertino. He unveiled the new iPhone 17 to thunderous applause. Wall Street responded immediately — Apple stock jumped 4%."

canonical_entities:
  { mention: "he",  canonical: "Tim Cook", role: "Apple CEO" }
  { mention: "Wall Street", canonical: "New York Stock Exchange", role: "US financial markets" }
disambiguators: ["Apple", "tech"]

Segment 1: "Tim Cook took the stage in Cupertino"
  media_intent: "event"
  image_query:  "Tim Cook Apple keynote 2025"
  video_query:  "Apple keynote stage Cupertino 2025"
  alternate_queries.image: ["Apple Park Cupertino keynote", "Tim Cook iPhone event"]
  alternate_queries.video: ["Apple event press conference 2025", "Tim Cook stage presentation"]
  exclude_terms: ["fruit"]
  search_entities: ["Tim Cook", "Cupertino", "Apple"]

Segment 2: "He unveiled the new iPhone 17 to thunderous applause"
  media_intent: "portrait"
  image_query:  "Tim Cook iPhone 17 reveal"
  video_query:  "iPhone 17 launch keynote highlights"
  alternate_queries.image: ["iPhone 17 product shot", "Apple CEO iPhone announcement"]
  alternate_queries.video: ["iPhone 17 announcement clip", "Apple keynote audience reaction"]
  exclude_terms: ["fruit", "recipe"]
  search_entities: ["Tim Cook", "iPhone 17", "Apple"]

Segment 3: "Wall Street responded immediately — Apple stock jumped 4%"
  media_intent: "scene"
  image_query:  "Apple stock ticker NYSE 2025"
  video_query:  "Wall Street NYSE floor 2025"
  alternate_queries.image: ["Apple AAPL stock chart", "NYSE trading floor"]
  alternate_queries.video: ["stock market trading floor", "AAPL ticker footage"]
  exclude_terms: ["fruit", "orchard"]
  search_entities: ["Apple", "New York Stock Exchange"]

═══════════════════════════════════════════════════
RESPONSE FORMAT
═══════════════════════════════════════════════════
Respond with ONLY valid JSON. No markdown fences. No preamble.

{
  "script_analysis": {
    "topic": "brief topic description",
    "tone": "news|editorial|educational|promotional|emotional|humorous",
    "recency": "current_events|recent|timeless",
    "key_entities": ["specific names, places, events"],
    "canonical_entities": [
      { "mention": "he", "canonical": "Full Name", "role": "affiliation or type" }
    ],
    "disambiguators": ["context-fixing terms"]
  },
  "segments": [
    {
      "id": 1,
      "text": "segment text (verbatim from script)",
      "subject": "canonical subject of this segment",
      "media_intent": "portrait|action|scene|event|concept",
      "image_query": "3-7 word subject-first image query",
      "video_query": "3-7 word subject-first video query with intent modifiers",
      "alternate_queries": {
        "image": ["alternative 1", "alternative 2"],
        "video": ["alternative 1", "alternative 2"]
      },
      "exclude_terms": ["negative", "keywords"],
      "search_entities": ["canonical entity 1", "canonical entity 2"],
      "word_count": 8,
      "estimated_duration_sec": 3.2
    }
  ],
  "total_duration_sec": 15.5,
  "segment_count": 5
}`;

export async function POST(req: NextRequest) {
  try {
    const { script } = await req.json();

    if (!script || script.trim().length < 10) {
      return NextResponse.json(
        { error: "Script must be at least 10 characters" },
        { status: 400 }
      );
    }

    if (!ANTHROPIC_API_KEY || ANTHROPIC_API_KEY === "sk-ant-your-key-here") {
      return NextResponse.json(
        { error: "ANTHROPIC_API_KEY not configured. Add it to .env.local" },
        { status: 500 }
      );
    }

    // Store the script in pipeline state
    submitScript(script.trim());

    // Call Claude API with retry logic for overloaded errors
    let lastError = "";
    let result = null;
    const MAX_RETRIES = 3;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      const response = await fetch(ANTHROPIC_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 8192,
          system: SEGMENTATION_SYSTEM_PROMPT,
          messages: [
            { role: "user", content: `Segment this script:\n\n${script.trim()}` },
          ],
        }),
      });

      if (response.ok) {
        result = await response.json();
        break;
      }

      const err = await response.json().catch(() => ({}));
      lastError = err?.error?.message || `API error ${response.status}`;

      // Retry on overloaded (529) or rate limit (429)
      if ((response.status === 529 || response.status === 429) && attempt < MAX_RETRIES) {
        const waitMs = attempt * 2000; // 2s, 4s, 6s
        console.log(`[segment] Attempt ${attempt} got ${response.status}, retrying in ${waitMs}ms...`);
        await new Promise((r) => setTimeout(r, waitMs));
        continue;
      }

      throw new Error(lastError);
    }

    if (!result) {
      throw new Error(lastError || "Failed after retries");
    }

    const data = result;
    const text = data.content
      ?.filter((b: { type: string }) => b.type === "text")
      .map((b: { text: string }) => b.text)
      .join("");

    const clean = text.replace(/```json|```/g, "").trim();

    // Attempt to parse JSON, with recovery for truncated responses
    let parsed;
    try {
      parsed = JSON.parse(clean);
    } catch (parseErr) {
      console.log("[segment] JSON parse failed, attempting recovery...");
      // Try to repair truncated JSON by closing open structures
      let repaired = clean;

      // If truncated mid-string, close the string
      const lastQuote = repaired.lastIndexOf('"');
      const afterLastQuote = repaired.slice(lastQuote + 1).trim();
      if (afterLastQuote === "" || afterLastQuote.endsWith("\\")) {
        repaired = repaired.slice(0, lastQuote + 1);
      }

      // Close any open objects/arrays
      const opens = (repaired.match(/[{\[]/g) || []).length;
      const closes = (repaired.match(/[}\]]/g) || []).length;

      // Remove trailing comma if present
      repaired = repaired.replace(/,\s*$/, "");

      // Try to find the last complete segment and close the JSON
      const lastCompleteSegment = repaired.lastIndexOf("}");
      if (lastCompleteSegment > 0) {
        // Check if we're inside the segments array
        const segArrayStart = repaired.indexOf('"segments"');
        if (segArrayStart > -1) {
          // Find the segments array content up to last complete object
          const truncated = repaired.slice(0, lastCompleteSegment + 1);
          // Count brackets to determine what needs closing
          const remainingOpens = (truncated.match(/\[/g) || []).length - (truncated.match(/\]/g) || []).length;
          const remainingBraces = (truncated.match(/\{/g) || []).length - (truncated.match(/\}/g) || []).length;

          repaired = truncated;
          // Remove trailing comma
          repaired = repaired.replace(/,\s*$/, "");
          // Close arrays and objects
          for (let i = 0; i < remainingOpens; i++) repaired += "]";
          for (let i = 0; i < remainingBraces; i++) repaired += "}";
        }
      }

      try {
        parsed = JSON.parse(repaired);
        console.log("[segment] JSON recovery succeeded with", parsed.segments?.length || 0, "segments");
      } catch {
        // Last resort: try to extract just the segments array
        const segMatch = clean.match(/"segments"\s*:\s*\[([\s\S]*)/);
        if (segMatch) {
          try {
            // Find all complete segment objects
            const segContent = segMatch[1];
            const segObjects: string[] = [];
            let depth = 0;
            let start = -1;

            for (let i = 0; i < segContent.length; i++) {
              if (segContent[i] === "{") { if (depth === 0) start = i; depth++; }
              if (segContent[i] === "}") {
                depth--;
                if (depth === 0 && start >= 0) {
                  segObjects.push(segContent.slice(start, i + 1));
                  start = -1;
                }
              }
            }

            if (segObjects.length > 0) {
              const segments = segObjects.map((s) => JSON.parse(s));
              const totalDur = segments.reduce((a: number, s: { estimated_duration_sec?: number; word_count?: number }) =>
                a + (s.estimated_duration_sec || (s.word_count || 5) / 2.5), 0);
              parsed = {
                segments,
                segment_count: segments.length,
                total_duration_sec: Math.round(totalDur * 10) / 10,
              };
              console.log("[segment] Extracted", segments.length, "segments from truncated response");
            } else {
              throw new Error("Could not extract any segments from response");
            }
          } catch {
            throw new Error("AI response was truncated and could not be recovered. Try a shorter script.");
          }
        } else {
          throw new Error("AI returned invalid JSON that could not be parsed");
        }
      }
    }

    if (!parsed.segments || !Array.isArray(parsed.segments) || parsed.segments.length === 0) {
      throw new Error("AI returned empty or invalid segments");
    }

    // Normalize: ensure backward-compatible fields exist and new fields have safe defaults.
    // For the video_query fallback we use the subject / image_query directly rather than
    // tacking on "footage cinematic" — generic modifiers have been shown to dilute relevance.
    parsed.segments = parsed.segments.map((seg: Record<string, unknown>) => {
      const imageQuery = (seg.image_query as string) || (seg.keyword as string) || "general";
      const subject = (seg.subject as string) || "";
      const intent = (seg.media_intent as string) || "";
      // Intent-aware video fallback (only used if AI didn't supply a video_query).
      const intentModifier: Record<string, string> = {
        portrait: "press conference",
        action: "highlights",
        scene: "aerial wide shot",
        event: "ceremony stage",
        concept: "close up",
      };
      const videoFallback = `${subject || imageQuery} ${intentModifier[intent] || "highlights"}`.trim();

      const altRaw = (seg.alternate_queries as Record<string, unknown>) || {};
      const altImage = Array.isArray(altRaw.image) ? (altRaw.image as string[]).filter(Boolean) : [];
      const altVideo = Array.isArray(altRaw.video) ? (altRaw.video as string[]).filter(Boolean) : [];

      return {
        ...seg,
        keyword: (seg.keyword as string) || imageQuery,
        image_query: imageQuery,
        video_query: (seg.video_query as string) || videoFallback,
        subject: subject || imageQuery,
        media_intent: intent || "concept",
        search_entities: Array.isArray(seg.search_entities)
          ? (seg.search_entities as string[]).filter(Boolean)
          : [],
        exclude_terms: Array.isArray(seg.exclude_terms)
          ? (seg.exclude_terms as string[]).filter(Boolean)
          : [],
        alternate_queries: { image: altImage, video: altVideo },
        fallback_from_previous: seg.fallback_from_previous || false,
      };
    });

    // Normalize script_analysis new fields with safe defaults.
    if (parsed.script_analysis) {
      const sa = parsed.script_analysis as Record<string, unknown>;
      parsed.script_analysis = {
        ...sa,
        canonical_entities: Array.isArray(sa.canonical_entities) ? sa.canonical_entities : [],
        disambiguators: Array.isArray(sa.disambiguators)
          ? (sa.disambiguators as string[]).filter(Boolean)
          : [],
      };
    }

    // Store segments in pipeline state + broadcast via SSE
    submitSegments(parsed);

    return NextResponse.json(parsed);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Segmentation failed";
    console.error("[segment] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}