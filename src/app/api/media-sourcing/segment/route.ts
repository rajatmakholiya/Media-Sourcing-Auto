// src/app/api/media-sourcing/segment/route.ts
// Segmentation specifically for MSN Slideshow articles
// Focuses on identifying distinct slides and generating subject-focused media queries
import { NextRequest, NextResponse } from "next/server";

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

const MSN_SLIDESHOW_PROMPT = `You are an expert media researcher for MSN Slideshow articles. You break an article into individual SLIDES and craft search queries that retrieve the right editorial photo on the first try.

═══════════════════════════════════════════════════
STEP 1 — READ THE WHOLE ARTICLE FIRST
═══════════════════════════════════════════════════
Build a full-article understanding BEFORE writing any query:
- TOPIC: one short phrase
- TYPE: news | sports | entertainment | politics | technology | lifestyle | health | travel
- RECENCY: current_events | recent | timeless
- KEY_ENTITIES: every specific name (people, teams, orgs, places, events, products)
- CANONICAL_ENTITIES: resolve pronouns, partial names, and ambiguous mentions to a canonical form.
    Example: { "mention": "Concepcion", "canonical": "KC Concepcion", "role": "Texas A&M wide receiver" }
    Example: { "mention": "he", "canonical": "Emmett Johnson", "role": "Nebraska running back" }
- DISAMBIGUATORS: context words that MUST accompany ambiguous names
    (e.g. "Jordan" in basketball → ["NBA", "basketball"]; "Apple" in tech → ["tech", "iPhone"])

═══════════════════════════════════════════════════
STEP 2 — BREAK INTO SLIDES
═══════════════════════════════════════════════════
The article text you receive will likely already contain pointers, numbers, or explicit slide markers. 
DO NOT break the text into granular dialogue segments or split sentences artificially.
- Keep the natural structure: The intro should be Slide 1.
- Each numbered point, list item, or explicit section in the source text should become ONE slide in your output.
- Keep the entire block of text for each section together in that slide.
- Keep slide text VERBATIM — do not rewrite or summarize.

═══════════════════════════════════════════════════
STEP 3 — CLASSIFY MEDIA INTENT PER SLIDE
═══════════════════════════════════════════════════
Pick ONE media_intent — drives modifier selection:
- "portrait" → person (headshot / close-up). Hints: "press conference", "interview"
- "action"   → on-field / performance. Hints: "in action", "live game", "training"
- "scene"    → place / atmosphere. Hints: "aerial", "exterior", "wide shot"
- "event"    → ceremony / stage. Hints: "ceremony", "podium", "stage"
- "concept"  → abstract idea. Hints: "close up", "macro", "symbolic"

═══════════════════════════════════════════════════
STEP 4 — THE CARDINAL QUERY RULE: SUBJECT-FIRST
═══════════════════════════════════════════════════
Every query leads with WHO / WHAT, never a verb.

WRONG:  "running back posting 40 yard dash time"
RIGHT:  "Le'Veon Moss Texas A&M running back"

WRONG:  "he impressed at pro day"                  ← pronoun
RIGHT:  "Emmett Johnson Nebraska Huskers"          ← canonical entity

PRIORITY:
  1. Named person → full canonical name + role/team + year (if current)
  2. Named team/org → canonical name + category + year
  3. Named event → event + year + location
  4. Named place → location + landmark
  5. Concept only → visual noun phrase

═══════════════════════════════════════════════════
STEP 5 — BUILD THE QUERIES
═══════════════════════════════════════════════════
For every slide produce:

- image_query (3–6 words)
    Editorial/press photograph (AP/Reuters/Getty style). Subject name + role + year.
    Apply disambiguators when subject is ambiguous.

- alternate_queries.image (2 fallbacks)
    Vary entity scope (player vs team, specific vs broad). Not just word reordering.

- exclude_terms (0–4 negative keywords)
    ONLY when the subject is ambiguous or has a famous namesake.
    Examples:
      "Jordan" basketball → ["brand", "shoes", "Nike"]
      "Apple" tech        → ["fruit", "recipe"]
      "Ford" auto         → ["Harrison Ford"]
    Leave [] when unambiguous.

- search_entities (canonical names in this slide)
    Pronouns resolved. Used later for relevance scoring.

═══════════════════════════════════════════════════
ANTI-PATTERNS — AVOID
═══════════════════════════════════════════════════
✗ Verb-first queries           ("impressed at pro day")
✗ Unresolved pronouns          ("his best performance")
✗ Stock-photo language         ("football player running stock photo")
✗ Generic quality modifiers    ("HD 4K cinematic")
✗ Full sentences as queries

═══════════════════════════════════════════════════
WORKED EXAMPLES
═══════════════════════════════════════════════════
Article: NFL Pro Days
  Slide: "Concepcion stood out in position drills"
    subject: "KC Concepcion"
    media_intent: "action"
    image_query: "KC Concepcion Texas A&M receiver"
    alternate_queries.image: ["Texas A&M wide receivers 2025", "KC Concepcion college football"]
    exclude_terms: []
    search_entities: ["KC Concepcion", "Texas A&M"]

  Slide: "He is drawing significant interest from the Buffalo Bills"
    subject: "Buffalo Bills"
    media_intent: "portrait"
    image_query: "Buffalo Bills NFL 2025"
    alternate_queries.image: ["Buffalo Bills front office", "Buffalo Bills scouting department"]
    exclude_terms: []
    search_entities: ["Buffalo Bills", "KC Concepcion"]

Article: Apple iPhone launch
  Slide: "Cook spoke at the Cupertino keynote"
    subject: "Tim Cook"
    media_intent: "event"
    image_query: "Tim Cook Apple keynote 2025"
    alternate_queries.image: ["Apple Park Cupertino keynote", "Tim Cook iPhone event"]
    exclude_terms: ["fruit"]
    search_entities: ["Tim Cook", "Apple", "Cupertino"]

═══════════════════════════════════════════════════
RESPONSE FORMAT
═══════════════════════════════════════════════════
Respond with ONLY valid JSON. No markdown fences.

{
  "article_analysis": {
    "topic": "brief topic",
    "type": "news|sports|entertainment|politics|technology|lifestyle",
    "recency": "current_events|recent|timeless",
    "key_entities": ["specific names, teams, events"],
    "canonical_entities": [
      { "mention": "he", "canonical": "Full Name", "role": "affiliation or type" }
    ],
    "disambiguators": ["context terms"]
  },
  "slides": [
    {
      "id": 1,
      "text": "verbatim slide text",
      "subject": "canonical subject for this slide",
      "media_intent": "portrait|action|scene|event|concept",
      "image_query": "3-6 word subject-first image query",
      "alternate_queries": {
        "image": ["alternative 1", "alternative 2"]
      },
      "exclude_terms": ["negative", "keywords"],
      "search_entities": ["canonical entity 1", "canonical entity 2"]
    }
  ],
  "slide_count": 10
}`;

const MSN_VIDEO_PROMPT = `You are an expert video editor and media researcher for MSN Video stories. You break a script into short VIDEO SEGMENTS for narrated broadcast-style packages and craft search queries that retrieve the right editorial image and B-roll on the first try.

═══════════════════════════════════════════════════
STEP 1 — READ THE WHOLE SCRIPT FIRST
═══════════════════════════════════════════════════
Build a full-script understanding BEFORE writing any segment:
- TOPIC, TYPE, RECENCY, KEY_ENTITIES (same as slideshow pipeline)
- CANONICAL_ENTITIES: resolve every pronoun, partial name, and ambiguous mention.
    Example: { "mention": "he", "canonical": "KC Concepcion", "role": "Texas A&M wide receiver" }
- DISAMBIGUATORS: context words that MUST accompany ambiguous names (e.g. "Apple" tech context → ["iPhone", "tech"])

═══════════════════════════════════════════════════
STEP 2 — SEGMENT FOR BROADCAST PACING
═══════════════════════════════════════════════════
Each segment = one visual shot in the final narrated video.
- Target 2–4 seconds (~5–12 words at 2.5 words/sec). Min 1.5s, max 5s.
- Split at periods, commas before conjunctions, em-dashes, clause boundaries.
- Short sentences (<12 words) → ONE segment. Long sentences (15+) → split 2–3 times.
- NEVER split mid-name, mid-title, mid-noun-phrase.
- Transition words ("Meanwhile", "However", "In addition") attach to NEXT segment.
- Duration: +0.3s for new-topic segments, +0.2s for number/stat-heavy segments.

═══════════════════════════════════════════════════
STEP 3 — CLASSIFY MEDIA INTENT PER SEGMENT
═══════════════════════════════════════════════════
Pick ONE media_intent — drives modifier selection:
- "portrait" → person close-up / headshot.          Hints: "press conference", "interview", "close up"
- "action"   → motion / performance / gameplay.     Hints: "highlights", "in action", "live game"
- "scene"    → place / atmosphere / landscape.      Hints: "aerial", "exterior", "wide shot", "skyline"
- "event"    → ceremony / stage / press event.      Hints: "ceremony", "stage", "podium", "crowd"
- "concept"  → abstract idea with no named subject. Hints: "visualization", "macro", "close up"

Consecutive segments about the same subject → use DIFFERENT intents to avoid visual repetition.

═══════════════════════════════════════════════════
STEP 4 — THE CARDINAL QUERY RULE: SUBJECT-FIRST
═══════════════════════════════════════════════════
Every query leads with WHO / WHAT, never a verb.

WRONG:  "drawing interest football"
WRONG:  "athlete skipping workout"
WRONG:  "40 yard dash timing"
WRONG:  "he is demonstrating the feature"              ← pronoun unresolved

RIGHT:  "Buffalo Bills NFL 2025"
RIGHT:  "KC Concepcion Texas A&M wide receiver"
RIGHT:  "NFL combine 40 yard dash 2025"
RIGHT:  "Tim Cook iPhone 17 keynote Apple 2025"        ← pronoun resolved, disambiguator added

QUERY PRIORITY:
  1. Named person → full canonical name + role + year (if current)
  2. Named team/org → canonical name + league/category + year
  3. Named event → event + year + location
  4. Named place → location + landmark
  5. Concept only → visual noun phrase (never a verb phrase)

═══════════════════════════════════════════════════
STEP 5 — BUILD THE QUERIES
═══════════════════════════════════════════════════
For every segment produce:

- image_query (3–7 words): editorial photograph. Name + role + year. Disambiguators applied.
- video_query (3–7 words): B-roll matching media_intent. Use intent-specific modifiers, NOT generic
  terms like "cinematic", "4K", "stock footage".
- alternate_queries.image (2 fallbacks): vary entity scope (player ↔ team; specific ↔ broad).
- alternate_queries.video (2 fallbacks): vary intent/angle (portrait ↔ action ↔ scene).
- exclude_terms (0–4 negatives): ONLY when subject is ambiguous or has a famous namesake.
    "Jordan" basketball → ["brand", "shoes", "Nike"]
    "Apple" tech        → ["fruit", "recipe"]
    Leave [] when unambiguous.
- search_entities: canonical entity names in this segment (pronouns resolved).

═══════════════════════════════════════════════════
ANTI-PATTERNS
═══════════════════════════════════════════════════
✗ Verb-first queries                ("drawing interest ...")
✗ Unresolved pronouns               ("he highlights")
✗ Meta prefixes                     ("B-roll of ...", "footage showing ...")
✗ Generic quality modifiers         ("cinematic 4K stock footage")
✗ Full sentences as queries
✗ Same query across consecutive segments about same subject

═══════════════════════════════════════════════════
WORKED EXAMPLE
═══════════════════════════════════════════════════
Script snippet: "Tim Cook took the stage in Cupertino. He unveiled iPhone 17. Wall Street reacted immediately."

canonical_entities:
  { mention: "he",          canonical: "Tim Cook",                  role: "Apple CEO" }
  { mention: "Wall Street", canonical: "New York Stock Exchange",   role: "US financial markets" }
disambiguators: ["Apple", "tech"]

Segment: "Tim Cook took the stage in Cupertino"
  subject: "Tim Cook"
  media_intent: "event"
  image_query:  "Tim Cook Apple keynote 2025"
  video_query:  "Apple keynote stage Cupertino 2025"
  alternate_queries.image: ["Apple Park Cupertino keynote", "Tim Cook iPhone event"]
  alternate_queries.video: ["Apple event press conference 2025", "Tim Cook stage presentation"]
  exclude_terms: ["fruit"]
  search_entities: ["Tim Cook", "Apple", "Cupertino"]

Segment: "He unveiled iPhone 17"
  subject: "Tim Cook"
  media_intent: "portrait"
  image_query:  "Tim Cook iPhone 17 reveal"
  video_query:  "iPhone 17 launch keynote highlights"
  alternate_queries.image: ["iPhone 17 product reveal", "Apple CEO announcement"]
  alternate_queries.video: ["iPhone 17 announcement clip", "Apple keynote audience"]
  exclude_terms: ["fruit", "recipe"]
  search_entities: ["Tim Cook", "iPhone 17", "Apple"]

═══════════════════════════════════════════════════
RESPONSE FORMAT
═══════════════════════════════════════════════════
Respond with ONLY valid JSON. No markdown fences.

{
  "article_analysis": {
    "topic": "brief topic",
    "type": "news|sports|entertainment|politics|technology|lifestyle",
    "recency": "current_events|recent|timeless",
    "key_entities": ["specific names, teams, events"],
    "canonical_entities": [
      { "mention": "he", "canonical": "Full Name", "role": "affiliation or type" }
    ],
    "disambiguators": ["context terms"]
  },
  "slides": [
    {
      "id": 1,
      "text": "segment text (verbatim)",
      "subject": "canonical subject",
      "media_intent": "portrait|action|scene|event|concept",
      "image_query": "3-7 word subject-first image query",
      "video_query": "3-7 word subject-first video query with intent modifiers",
      "alternate_queries": {
        "image": ["alternative 1", "alternative 2"],
        "video": ["alternative 1", "alternative 2"]
      },
      "exclude_terms": ["negative", "keywords"],
      "search_entities": ["canonical entity 1", "canonical entity 2"],
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
          model: "claude-sonnet-4-6",
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

    // Normalize: fill safe defaults for new fields so downstream code never crashes
    // on older responses or partial AI output.
    const intentModifier: Record<string, string> = {
      portrait: "press conference",
      action: "highlights",
      scene: "aerial wide shot",
      event: "ceremony stage",
      concept: "close up",
    };

    parsed.slides = parsed.slides.map((slide: Record<string, unknown>) => {
      const imageQuery = (slide.image_query as string) || "general";
      const subject = (slide.subject as string) || imageQuery;
      const intent = (slide.media_intent as string) || "concept";
      const videoFallback = `${subject} ${intentModifier[intent] || "highlights"}`.trim();

      const altRaw = (slide.alternate_queries as Record<string, unknown>) || {};
      const altImage = Array.isArray(altRaw.image) ? (altRaw.image as string[]).filter(Boolean) : [];
      const altVideo = Array.isArray(altRaw.video) ? (altRaw.video as string[]).filter(Boolean) : [];

      return {
        ...slide,
        image_query: imageQuery,
        video_query: (slide.video_query as string) || videoFallback,
        subject,
        media_intent: intent,
        search_entities: Array.isArray(slide.search_entities)
          ? (slide.search_entities as string[]).filter(Boolean)
          : [],
        exclude_terms: Array.isArray(slide.exclude_terms)
          ? (slide.exclude_terms as string[]).filter(Boolean)
          : [],
        alternate_queries: { image: altImage, video: altVideo },
      };
    });

    if (parsed.article_analysis) {
      const aa = parsed.article_analysis as Record<string, unknown>;
      parsed.article_analysis = {
        ...aa,
        canonical_entities: Array.isArray(aa.canonical_entities) ? aa.canonical_entities : [],
        disambiguators: Array.isArray(aa.disambiguators)
          ? (aa.disambiguators as string[]).filter(Boolean)
          : [],
      };
    }

    return NextResponse.json(parsed);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Segmentation failed";
    console.error("[media-sourcing/segment]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}