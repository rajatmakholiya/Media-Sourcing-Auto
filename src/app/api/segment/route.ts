// src/app/api/segment/route.ts
// Backend proxy — calls Claude API on behalf of the frontend
// API key never leaves the server
import { NextRequest, NextResponse } from "next/server";
import { submitSegments, submitScript } from "@/lib/pipeline-store";

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

const SEGMENTATION_SYSTEM_PROMPT = `You are an expert video producer's assistant. Your job is to break a script into short segments for social media video narration, and for each segment, provide highly specific media search queries that a producer would use to find the perfect B-roll footage or images.

STEP 1 — UNDERSTAND THE SCRIPT:
Before segmenting, analyze the full script to determine:
- TOPIC: What is this script about? (e.g., "AI in healthcare", "Champions League final 2025", "climate change in Arctic")
- TONE: Is it news/editorial, educational, promotional, emotional, humorous?
- RECENCY: Does this reference current events, recent news, or timeless concepts?
- AUDIENCE: Who is this for? General public, professionals, enthusiasts?

STEP 2 — SEGMENT THE SCRIPT:
1. Each segment should be 2-4 seconds when spoken aloud (~5-12 words).
2. Split at natural pauses — punctuation, conjunctions, dashes, clause boundaries.
3. If a sentence is under 12 words, keep it as one segment.
4. Never split mid-phrase or mid-thought.
5. Estimate spoken duration at 2.5 words per second.

STEP 3 — GENERATE MEDIA SEARCH QUERIES:
This is the most critical step. For each segment, generate TWO search queries:
- "image_query": optimized for finding a relevant high-quality photograph
- "video_query": optimized for finding relevant B-roll footage or video clips

QUERY RULES — SUBJECT FIRST, NOT ACTION:
The #1 rule: queries must focus on the SUBJECT (who/what the segment is about), NOT the action or verb.

WRONG approach (action-focused):
- "he is drawing significant interest from the Buffalo Bills" → "drawing interest football" ❌
- "Concepcion did not participate in the workout" → "athlete skipping workout" ❌
- "posted a 4.58 in the 40-yard dash" → "40 yard dash timing" ❌

RIGHT approach (subject-focused):
- "he is drawing significant interest from the Buffalo Bills" → IMAGE: "Buffalo Bills NFL team 2025" VIDEO: "Buffalo Bills highlights 2025" ✓
- "Concepcion did not participate in the workout" → IMAGE: "KC Concepcion Texas A&M wide receiver" VIDEO: "KC Concepcion highlights catches" ✓
- "posted a 4.58 in the 40-yard dash" → IMAGE: "Le'Veon Moss Texas A&M running back" VIDEO: "Le'Veon Moss rushing highlights" ✓

PRIORITY ORDER for choosing query subjects:
1. NAMED PEOPLE — If a person is mentioned or is the subject, use their full name + team/affiliation. "Heinrich Haarberg" → "Heinrich Haarberg Nebraska tight end"
2. NAMED ORGANIZATIONS/TEAMS — If a team, company, or organization is the subject. "Buffalo Bills" → "Buffalo Bills NFL 2025"
3. NAMED EVENTS — If an event is referenced. "NFL Draft" → "NFL Draft 2025"
4. NAMED PLACES — If a specific location matters. "College Station" → "Texas A&M College Station campus"
5. SPECIFIC OBJECTS/CONCEPTS — Only if no named entity exists. "AI diagnostic tool" → "AI medical diagnostic screen"

ADDITIONAL RULES:
- For RECENT/NEWS content, always append the year or "latest" to queries. "Champions League final" → "Champions League final 2025"
- For SPORTS content, use player names, team names, and "highlights" in video queries. Never use generic drill descriptions.
- For PEOPLE, the image query should find a PHOTO OF THAT PERSON, not an illustration of what they're doing.
- For video queries, use the person's name + "highlights" or team name + "footage" rather than describing a drill or action.
- Queries should be 3-8 words. Include names and affiliations, not descriptions of actions.
- Think: "What would I Google Image search to find a picture of THIS SUBJECT?"

EXAMPLES:
Script about AI in healthcare:
- Segment: "Artificial intelligence is revolutionizing healthcare"
  - image_query: "artificial intelligence healthcare 2025"
  - video_query: "AI in healthcare technology footage"

- Segment: "enabling doctors to detect diseases earlier"
  - image_query: "doctor AI medical diagnosis"
  - video_query: "medical AI diagnostic technology"

Script about NFL Draft:
- Segment: "he is drawing significant interest from the Buffalo Bills"
  - image_query: "Buffalo Bills NFL team 2025"
  - video_query: "Buffalo Bills NFL highlights 2025"

- Segment: "Concepcion did not participate in the workout"
  - image_query: "KC Concepcion Texas A&M wide receiver"
  - video_query: "KC Concepcion Texas A&M highlights"

- Segment: "Emmett Johnson improved his combine numbers"
  - image_query: "Emmett Johnson Nebraska running back"
  - video_query: "Emmett Johnson Nebraska highlights rushing"

Script about Champions League:
- Segment: "Last night's final was one for the history books"
  - image_query: "Champions League final 2025"
  - video_query: "Champions League final 2025 highlights"

Respond ONLY with valid JSON, no markdown fences, no preamble:
{
  "script_analysis": {
    "topic": "brief topic description",
    "tone": "news|educational|promotional|emotional|humorous",
    "recency": "current_events|recent|timeless",
    "key_entities": ["specific names, places, events mentioned"]
  },
  "segments": [
    {
      "id": 1,
      "text": "segment text here",
      "image_query": "specific image search query",
      "video_query": "specific video search query with production terms",
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
          model: "claude-sonnet-4-20250514",
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

    // Normalize: ensure backward-compatible 'keyword' field exists
    parsed.segments = parsed.segments.map((seg: Record<string, unknown>) => ({
      ...seg,
      keyword: seg.keyword || seg.image_query || "general",
      image_query: seg.image_query || seg.keyword || "general",
      video_query: seg.video_query || `${seg.image_query || seg.keyword || "general"} footage cinematic`,
      fallback_from_previous: seg.fallback_from_previous || false,
    }));

    // Store segments in pipeline state + broadcast via SSE
    submitSegments(parsed);

    return NextResponse.json(parsed);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Segmentation failed";
    console.error("[segment] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}