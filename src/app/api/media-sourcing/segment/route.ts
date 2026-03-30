// src/app/api/media-sourcing/segment/route.ts
// Segmentation specifically for MSN Slideshow articles
// Focuses on identifying distinct slides and generating subject-focused media queries
import { NextRequest, NextResponse } from "next/server";

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

const MSN_SLIDESHOW_PROMPT = `You are an expert media researcher for MSN Slideshow articles. Your job is to break a script/article into individual SLIDES and for each slide, generate highly specific search queries to find the best editorial photographs.

STEP 1 — ANALYZE THE ARTICLE:
Determine:
- TOPIC: What is this article about?
- TYPE: News, sports, entertainment, politics, technology, lifestyle, health, travel?
- RECENCY: Is this about current/recent events? What time period?
- KEY ENTITIES: List all specific people, teams, organizations, places, events mentioned.

STEP 2 — BREAK INTO SLIDES:
Each slide represents one distinct point, fact, or subject in the article.
- A slide is typically 1-3 sentences that cover ONE topic/person/event.
- For sports articles: each player/team mention is usually its own slide.
- For news articles: each development or quote is usually its own slide.
- For list articles: each list item is its own slide.
- Keep slide text as-is from the original — don't rewrite or summarize.

STEP 3 — GENERATE MEDIA QUERIES:
For each slide, generate an "image_query" — this is the search term that will be used to find an editorial photograph on Imagn, Imago, and Google Images.

CRITICAL RULES FOR QUERIES:
1. SUBJECT-FIRST: Always lead with the main subject (person, team, place).
   - WRONG: "running back posting 40 yard dash time"
   - RIGHT: "Le'Veon Moss Texas A&M"

2. USE FULL NAMES: Always use the full name of people, not pronouns or partial names.
   - WRONG: "he impressed at pro day"
   - RIGHT: "Emmett Johnson Nebraska Huskers"

3. TEAMS/ORGS: Include the team or organization name.
   - WRONG: "wide receiver draft prospect"
   - RIGHT: "KC Concepcion Texas A&M wide receiver"

4. RECENCY: For current events, include the year.
   - WRONG: "NFL Draft"
   - RIGHT: "NFL Draft 2025"

5. EDITORIAL STYLE: These are for news/editorial photos, not stock photos. Think AP/Reuters/Getty style.
   - WRONG: "football player running stock photo"
   - RIGHT: "Tyler Onyedim Texas A&M defensive line"

6. KEEP IT SIMPLE: 3-6 words. The subject name + affiliation is usually enough.

EXAMPLES:
Article about NFL Pro Days:
- Slide about KC Concepcion → image_query: "KC Concepcion Texas A&M receiver"
- Slide about Buffalo Bills interest → image_query: "Buffalo Bills NFL 2025"
- Slide about Nebraska pro day → image_query: "Nebraska Huskers football 2025"
- Slide about Heinrich Haarberg → image_query: "Heinrich Haarberg Nebraska tight end"

Article about election:
- Slide about a candidate's speech → image_query: "Joe Biden speech 2025"
- Slide about poll results → image_query: "US election polls 2025"

Respond ONLY with valid JSON, no markdown fences:
{
  "article_analysis": {
    "topic": "brief topic",
    "type": "news|sports|entertainment|politics|technology|lifestyle",
    "recency": "current_events|recent|timeless",
    "key_entities": ["specific names, teams, events"]
  },
  "slides": [
    {
      "id": 1,
      "text": "original text for this slide",
      "image_query": "specific search query for editorial photo",
      "subject": "main subject name or entity for this slide"
    }
  ],
  "slide_count": 10
}`;

const MSN_VIDEO_PROMPT = `You are an expert video editor and media researcher for MSN Video stories. Your job is to break a script into short VIDEO SEGMENTS optimized for narrated video packages, and for each segment generate TWO search queries: one for a still image and one for video footage.

STEP 1 — ANALYZE THE SCRIPT:
Determine:
- TOPIC: What is this script about?
- TYPE: News, sports, entertainment, politics, technology, lifestyle, health, travel?
- RECENCY: Is this about current/recent events? What time period?
- KEY ENTITIES: Every specific person, team, organization, place, event mentioned.

STEP 2 — SEGMENT FOR VIDEO:
Each segment = one visual shot in the final narrated video. You are cutting the script for broadcast pacing.

PACING RULES:
- Target: 2–4 seconds per segment (~5–12 words spoken at 2.5 words/sec)
- Split at natural pauses: periods, commas before conjunctions, em-dashes, clause boundaries
- Short punchy sentences (under 12 words) → keep as ONE segment
- Long sentences (15+ words) → split into 2–3 segments at clause boundaries
- NEVER split mid-name, mid-title, or mid-noun-phrase
- Transition words ("Meanwhile," "However," "In addition,") → attach to the NEXT segment

DURATION:
- Base: 2.5 words per second
- Add 0.3s for new-topic segments, 0.2s for segments with numbers/stats
- Min: 1.5s, Max: 5s

STEP 3 — GENERATE MEDIA QUERIES:
For each segment, generate TWO queries:
- "image_query": Find a high-resolution editorial photograph (AP/Reuters/Getty style)
- "video_query": Find professional B-roll footage, highlight clips, or press footage

THE CARDINAL RULE: SUBJECT-FIRST QUERIES
Queries must target WHO or WHAT the segment is about, never the action/verb.

WRONG (action-focused):
- "drawing interest football" — too vague
- "athlete skipping workout" — wrong person will appear
- "40 yard dash timing" — returns random sprinters

RIGHT (subject-focused):
- "Buffalo Bills NFL 2025"
- "KC Concepcion Texas A&M wide receiver"
- "NFL combine 40 yard dash 2025"

QUERY PRIORITY:
1. NAMED PEOPLE → Full name + role/affiliation + year. Image: find their FACE. Video: find HIGHLIGHTS.
2. NAMED TEAMS/ORGS → Name + category + year
3. NAMED EVENTS → Event name + year + location
4. NAMED PLACES → Location + landmark
5. CONCEPTS → Specific + visual terms (not abstract)

QUERY RULES:
- 3–7 words each
- Always include year for current events/sports
- Image queries: target a recognizable photo of the subject
- Video queries: use terms like "highlights", "footage", "press conference", "aerial"
- NEVER use generic verbs ("showing", "demonstrating") or meta terms ("B-roll of", "footage showing")
- Consecutive segments about the same subject → use DIFFERENT angles to avoid visual repetition

Respond ONLY with valid JSON, no markdown fences:
{
  "article_analysis": {
    "topic": "brief topic",
    "type": "news|sports|entertainment|politics|technology|lifestyle",
    "recency": "current_events|recent|timeless",
    "key_entities": ["specific names, teams, events"]
  },
  "slides": [
    {
      "id": 1,
      "text": "segment text",
      "image_query": "editorial photo search query 3-7 words",
      "video_query": "video footage search query 3-7 words",
      "subject": "main subject name or entity",
      "estimated_duration_sec": 3.2
    }
  ],
  "slide_count": 10
}`;

export async function POST(req: NextRequest) {
  try {
    const { script, script_type } = await req.json();

    if (!script || script.trim().length < 10) {
      return NextResponse.json({ error: "Script must be at least 10 characters" }, { status: 400 });
    }
    if (!ANTHROPIC_API_KEY) {
      return NextResponse.json({ error: "ANTHROPIC_API_KEY not configured" }, { status: 500 });
    }

    const isVideo = script_type === "MSN Video";
    const systemPrompt = isVideo ? MSN_VIDEO_PROMPT : MSN_SLIDESHOW_PROMPT;

    let lastError = "";
    let result = null;

    for (let attempt = 1; attempt <= 3; attempt++) {
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
          system: systemPrompt,
          messages: [
            { role: "user", content: `Article type: ${script_type || "MSN Slideshow"}\n\nArticle text:\n\n${script.trim()}` },
          ],
        }),
      });

      if (response.ok) {
        result = await response.json();
        break;
      }

      const err = await response.json().catch(() => ({}));
      lastError = err?.error?.message || `API error ${response.status}`;

      if ((response.status === 529 || response.status === 429) && attempt < 3) {
        await new Promise((r) => setTimeout(r, attempt * 2000));
        continue;
      }
      throw new Error(lastError);
    }

    if (!result) throw new Error(lastError || "Failed after retries");

    const text = result.content
      ?.filter((b: { type: string }) => b.type === "text")
      .map((b: { text: string }) => b.text)
      .join("");

    const clean = text.replace(/```json|```/g, "").trim();

    let parsed;
    try {
      parsed = JSON.parse(clean);
    } catch {
      // Recovery: extract complete slide objects
      const segMatch = clean.match(/"slides"\s*:\s*\[([\s\S]*)/);
      if (segMatch) {
        const segContent = segMatch[1];
        const segObjects: string[] = [];
        let depth = 0, start = -1;
        for (let i = 0; i < segContent.length; i++) {
          if (segContent[i] === "{") { if (depth === 0) start = i; depth++; }
          if (segContent[i] === "}") {
            depth--;
            if (depth === 0 && start >= 0) { segObjects.push(segContent.slice(start, i + 1)); start = -1; }
          }
        }
        if (segObjects.length > 0) {
          const slides = segObjects.map((s) => JSON.parse(s));
          parsed = { slides, slide_count: slides.length };
        } else {
          throw new Error("Could not parse AI response");
        }
      } else {
        throw new Error("AI returned invalid JSON");
      }
    }

    if (!parsed.slides || parsed.slides.length === 0) {
      throw new Error("No slides generated");
    }

    return NextResponse.json(parsed);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Segmentation failed";
    console.error("[media-sourcing/segment]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}