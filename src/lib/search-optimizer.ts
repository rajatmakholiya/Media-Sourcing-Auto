// src/lib/search-optimizer.ts
// Generates multiple optimized search queries from a single keyword
// to maximize relevant, high-quality video and image results

type SearchQuery = {
  query: string;
  purpose: "broll" | "stock" | "social" | "editorial" | "cinematic";
  priority: number; // 1 = highest
};

type ContentAge = "any" | "24h" | "week" | "month" | "year";

// Domains that block direct media downloads (captchas, paywalls, login required)
const BLOCKED_DOMAINS = [
  "shutterstock.com",
  "gettyimages.com",
  "istockphoto.com",
  "stock.adobe.com",
  "depositphotos.com",
  "123rf.com",
  "dreamstime.com",
  "alamy.com",
  "bigstockphoto.com",
  "pond5.com",
  "dissolve.com",
  "storyblocks.com",
  "videohive.net",
  "envato.com",
  "artgrid.io",
  "motionarray.com",
  // Strictly prohibited — licensing issues
  "reuters.com",
  "reutersmedia.net",
  "gettyimages.co",
  "gettysportsmedia.com",
];

export function isBlockedDomain(url: string): boolean {
  const lower = url.toLowerCase();
  return BLOCKED_DOMAINS.some((domain) => lower.includes(domain));
}

// Words that produce poor visual search results — too abstract
const ABSTRACT_TERMS = new Set([
  "concept", "idea", "thing", "way", "power", "real", "future",
  "important", "essential", "key", "better", "best", "good",
  "new", "modern", "together", "today", "world",
]);

// Classify the keyword's visual domain — covers all MSN content types
function classifyKeyword(keyword: string): string[] {
  const kw = keyword.toLowerCase();
  const domains: string[] = [];

  if (/\b(ai|artificial intelligence|machine learning|deep learning|neural|algorithm|data|automation|robot)\b/.test(kw))
    domains.push("tech");
  if (/\b(business|team|office|meeting|company|startup|enterprise|corporate|work)\b/.test(kw))
    domains.push("business");
  if (/\b(nature|ocean|mountain|forest|sky|earth|planet|landscape|animal|wildlife)\b/.test(kw))
    domains.push("nature");
  if (/\b(city|urban|building|architecture|street|traffic|skyline)\b/.test(kw))
    domains.push("urban");
  if (/\b(health|medical|doctor|hospital|fitness|exercise|wellness)\b/.test(kw))
    domains.push("health");
  if (/\b(food|cooking|recipe|restaurant|kitchen|meal|chef|cuisine)\b/.test(kw))
    domains.push("food");
  if (/\b(sport|game|athlete|football|basketball|soccer|running|nfl|nba|mlb|nhl|tennis|golf|ufc|boxing|olympics)\b/.test(kw))
    domains.push("sports");
  if (/\b(education|school|university|learning|student|teacher|study)\b/.test(kw))
    domains.push("education");
  if (/\b(creative|art|design|music|film|photography|animation)\b/.test(kw))
    domains.push("creative");
  if (/\b(money|finance|invest|stock|crypto|bank|economy|market)\b/.test(kw))
    domains.push("finance");
  // Entertainment / pop culture — movies, TV, celebrities, music
  if (/\b(movie|film|actor|actress|celebrity|oscar|emmy|grammy|premiere|hollywood|netflix|disney|marvel|dc|series|tv show|streaming|award|concert|tour|album|singer|rapper|band|festival)\b/.test(kw))
    domains.push("entertainment");
  // Politics / government
  if (/\b(election|president|congress|senate|politics|democrat|republican|vote|government|policy|white house|supreme court|campaign|legislation)\b/.test(kw))
    domains.push("politics");
  // Fashion / lifestyle
  if (/\b(fashion|style|beauty|model|runway|designer|luxury|trend|lifestyle|travel|vacation)\b/.test(kw))
    domains.push("lifestyle");

  if (domains.length === 0) domains.push("general");
  return domains;
}

// Domain-specific visual synonyms for better B-roll results — all MSN content types
const DOMAIN_VISUAL_TERMS: Record<string, string[]> = {
  tech: ["computer screen code", "futuristic technology", "digital interface", "server room", "hands typing keyboard"],
  business: ["corporate office", "business meeting", "handshake deal", "whiteboard strategy", "professional workspace"],
  nature: ["aerial landscape", "slow motion nature", "cinematic scenery", "wildlife close up", "time lapse nature"],
  urban: ["drone city footage", "timelapse traffic", "aerial cityscape", "night city lights", "modern architecture"],
  health: ["hospital medical", "fitness workout", "wellness lifestyle", "medical research lab", "healthy lifestyle"],
  food: ["cooking close up", "food preparation", "restaurant kitchen", "plating food cinematic", "fresh ingredients"],
  sports: ["sports highlight", "athlete training", "stadium crowd", "slow motion sports", "competition footage"],
  education: ["classroom learning", "student studying", "university campus", "online learning", "books library"],
  creative: ["artist studio", "creative process", "design workspace", "music production", "film production"],
  finance: ["stock market trading", "financial charts", "bank vault", "cryptocurrency digital", "money business"],
  entertainment: ["red carpet premiere", "movie scene cinematic", "celebrity event", "concert stage performance", "award ceremony"],
  politics: ["capitol building", "press conference podium", "political rally crowd", "white house exterior", "voting election"],
  lifestyle: ["fashion runway show", "luxury lifestyle", "travel destination scenic", "beauty portrait", "street style photography"],
  general: ["cinematic footage", "professional footage"],
};

// Clean the keyword — remove filler words for tighter search
function cleanKeyword(keyword: string): string {
  const words = keyword.toLowerCase().split(/\s+/);
  const cleaned = words.filter((w) => !ABSTRACT_TERMS.has(w) && w.length > 2);
  return cleaned.length > 0 ? cleaned.join(" ") : keyword;
}

// Generate optimized search queries for videos
export function generateVideoQueries(
  keyword: string,
  segmentText: string,
  contentAge: ContentAge
): SearchQuery[] {
  const clean = cleanKeyword(keyword);
  const domains = classifyKeyword(keyword + " " + segmentText);
  const queries: SearchQuery[] = [];

  // 1. Stock footage query — best for B-roll
  queries.push({
    query: `${clean} stock footage 4K`,
    purpose: "stock",
    priority: 1,
  });

  // 2. Cinematic B-roll query
  queries.push({
    query: `${clean} cinematic B-roll footage`,
    purpose: "cinematic",
    priority: 1,
  });

  // 3. Domain-specific visual query
  for (const domain of domains) {
    const visuals = DOMAIN_VISUAL_TERMS[domain] || DOMAIN_VISUAL_TERMS.general;
    // Pick the most relevant visual term
    const best = visuals.find((v) =>
      v.split(" ").some((w) => clean.includes(w))
    ) || visuals[0];
    queries.push({
      query: `${best} footage HD`,
      purpose: "broll",
      priority: 2,
    });
  }

  // 4. Social media query — for trending/editorial content
  if (contentAge !== "any") {
    queries.push({
      query: `${clean} trending video`,
      purpose: "social",
      priority: 3,
    });
  }

  // 5. Editorial / news-style query (when content is recent)
  if (contentAge === "24h" || contentAge === "week") {
    queries.push({
      query: `${clean} news footage latest`,
      purpose: "editorial",
      priority: 2,
    });
  }

  return queries;
}

// Generate optimized search queries for images
export function generateImageQueries(
  keyword: string,
  segmentText: string,
  contentAge: ContentAge
): SearchQuery[] {
  const clean = cleanKeyword(keyword);
  const domains = classifyKeyword(keyword + " " + segmentText);
  const queries: SearchQuery[] = [];

  // 1. High-res photo query
  queries.push({
    query: `${clean} high resolution photo`,
    purpose: "stock",
    priority: 1,
  });

  // 2. Editorial/journalistic image
  queries.push({
    query: `${clean} professional photograph`,
    purpose: "editorial",
    priority: 2,
  });

  // 3. Domain-specific
  for (const domain of domains) {
    const visuals = DOMAIN_VISUAL_TERMS[domain] || DOMAIN_VISUAL_TERMS.general;
    queries.push({
      query: `${visuals[0]} photograph`,
      purpose: "broll",
      priority: 2,
    });
  }

  return queries;
}

/**
 * Relevance context from the AI segmentation step. Used by scoreResult()
 * to boost matches on canonical entities and penalize known noise terms.
 */
export type QueryContext = {
  /** Canonical entity names expected in the result (e.g. "KC Concepcion"). */
  entities?: string[];
  /** Negative keywords — results whose title contains these are penalized. */
  excludeTerms?: string[];
  /** The primary query string — used for simple token-overlap scoring. */
  query?: string;
};

/** Basic English stop-words removed before token overlap scoring. */
const STOP_TOKENS = new Set([
  "the", "a", "an", "of", "in", "on", "at", "for", "to", "and", "or",
  "by", "with", "from", "is", "was", "are", "were", "be", "this", "that",
]);

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^\w\s']/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOP_TOKENS.has(t));
}

// Score and rank results based on quality + query-relevance signals.
export function scoreResult(
  result: {
    width?: number;
    height?: number;
    source?: string;
    title?: string;
    platform?: string;
    duration_sec?: number;
    type: string;
    full_url?: string;
  },
  allowNonLicensed = false,
  context?: QueryContext,
): number {
  let score = 0;

  // HARD PENALTY: URLs from stock agencies that block direct downloads
  // (skipped when allowNonLicensed is enabled)
  const url = (result.full_url || "").toLowerCase();
  if (!allowNonLicensed && isBlockedDomain(url)) return -1000;

  // Resolution bonus
  if (result.width) {
    if (result.width >= 3840) score += 30;       // 4K
    else if (result.width >= 1920) score += 20;   // Full HD
    else if (result.width >= 1280) score += 10;   // HD
    else if (result.width >= 1200) score += 5;
  }

  // Landscape orientation bonus — most segments render better with wide images
  if (result.type === "image" && result.width && result.height) {
    const ratio = result.width / result.height;
    if (ratio >= 1.3) score += 3;
    else if (ratio < 0.9) score -= 3; // portrait — worse fit for video frames
  }

  // For videos: prefer short clips (better for B-roll)
  if (result.type === "video" && result.duration_sec) {
    if (result.duration_sec <= 15) score += 15;       // Perfect for segments
    else if (result.duration_sec <= 30) score += 10;
    else if (result.duration_sec <= 60) score += 5;
    else if (result.duration_sec > 300) score -= 10;  // Too long, likely a full video
  }

  // Source quality bonus — tiered by licensing safety
  // Tier 1: Licensed editorial (you own the license)
  if (result.source === "Imago" || result.source === "Imagn") score += 30;
  // Tier 2: Google CC-filtered / free site targeted
  if (result.source === "Google CC") score += 16;
  if (result.source === "Google (Free Sites)") score += 14;
  // Firecrawl Editorial removed — covered by other sources
  // Tier 3: Royalty-free stock
  if (result.source === "Pexels") score += 12;
  // Tier 4: General web search
  if (result.source === "Google") score += 5;
  if (result.source === "Firecrawl") score += 3;

  // Platform bonus for videos
  if (result.platform === "YouTube") score += 5;
  if (result.platform === "Vimeo") score += 8; // Vimeo tends to be higher quality

  const title = (result.title || "").toLowerCase();

  // ── Query-relevance scoring ───────────────────────────────
  // This is the single biggest lever against off-topic results. The AI
  // segmentation step emits canonical entities and exclude_terms for each
  // segment; we use them here to boost on-topic matches and kill noise.
  if (context) {
    // Entity match — +12 per canonical entity name found in the title.
    // Entities are already fully-qualified (e.g. "KC Concepcion") so this
    // is a strong signal that the result is about the right subject.
    if (context.entities && context.entities.length > 0) {
      for (const ent of context.entities) {
        const low = ent.toLowerCase().trim();
        if (low.length >= 3 && title.includes(low)) score += 12;
      }
    }

    // Exclude-term penalty — -25 per negative keyword found in title.
    // AI only populates these when the subject is ambiguous.
    if (context.excludeTerms && context.excludeTerms.length > 0) {
      for (const term of context.excludeTerms) {
        const low = term.toLowerCase().trim();
        if (low.length >= 2 && title.includes(low)) score -= 25;
      }
    }

    // Soft token-overlap bonus on the primary query — small weight so it
    // doesn't overwhelm entity matches when the query and entities differ.
    if (context.query && title) {
      const qTokens = new Set(tokenize(context.query));
      const titleTokens = new Set(tokenize(title));
      let overlap = 0;
      for (const t of qTokens) if (titleTokens.has(t)) overlap++;
      if (qTokens.size > 0) {
        const ratio = overlap / qTokens.size;
        score += Math.round(ratio * 8); // 0–8 points
      }
    }
  }

  // Penalize likely low-quality results based on title
  if (title.includes("reaction") || title.includes("unboxing")) score -= 15;
  if (title.includes("compilation")) score -= 10;
  if (title.includes("meme") || title.includes("funny")) score -= 10;
  if (title.includes("tutorial") || title.includes("how to")) score -= 5;
  if (title.includes("stock footage") || title.includes("b-roll")) score += 10;
  if (title.includes("cinematic") || title.includes("4k")) score += 8;
  if (title.includes("drone") || title.includes("aerial")) score += 5;
  if (title.includes("timelapse") || title.includes("time-lapse")) score += 5;
  if (title.includes("slow motion") || title.includes("slowmo")) score += 5;

  return score;
}

/**
 * Build the negative-keyword suffix for Serper/Firecrawl queries from
 * AI-supplied exclude_terms. Returns a space-prefixed string suitable for
 * concatenation (or "" if no terms). Example: " -fruit -recipe"
 */
export function buildExcludeSuffix(excludeTerms?: string[]): string {
  if (!excludeTerms || excludeTerms.length === 0) return "";
  return (
    " " +
    excludeTerms
      .map((t) => t.trim())
      .filter((t) => t.length > 0 && !/\s/.test(t)) // single-token negatives only
      .slice(0, 6)
      .map((t) => `-${t}`)
      .join(" ")
  );
}

// Deduplicate results by visual similarity (URL-based)
export function deduplicateResults<T extends { full_url: string; thumbnail: string }>(
  results: T[]
): T[] {
  const seen = new Set<string>();
  return results.filter((r) => {
    // Normalize URL for dedup
    const key = r.full_url
      .replace(/^https?:\/\//, "")
      .replace(/[?#].*$/, "")
      .toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}