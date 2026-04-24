// src/app/api/media-sourcing/search/route.ts
// Media search for MSN articles — comprehensive multi-source search
// Sources: Serper (standard + CC + site-targeted) + Free providers (Wikimedia, Pexels, etc.)
//          + Licensed providers (Imago, Imagn) + Firecrawl (standard + editorial)
import { NextRequest, NextResponse } from "next/server";
import {
  isBlockedDomain,
  deduplicateResults,
  scoreResult,
  buildExcludeSuffix,
  type QueryContext,
} from "@/lib/search-optimizer";
import { searchImago } from "@/lib/imago-provider";
import { searchImagn } from "@/lib/imagn-provider";
import { searchFreeImages, type FreeImageResult } from "@/lib/free-image-providers";
// Sources: Imagn (5), Imago (5), Google/Serper (5), Firecrawl (5), Pexels (3)

type MediaResult = {
  id: string;
  type: "image" | "video";
  thumbnail: string;
  preview_url: string;
  full_url: string;
  source: string;
  author: string;
  width: number;
  height: number;
  title?: string;
  page_url?: string;
  platform?: string;
  duration_sec?: number;
};

/** Auto-detect content category from query for licensed providers */
function detectCategory(query: string): string {
  const q = query.toLowerCase();
  if (/\b(nfl|nba|mlb|nhl|soccer|football|basketball|baseball|hockey|tennis|golf|athlete|draft|playoff|championship|olympics|world cup|ufc|boxing)\b/.test(q))
    return "sport";
  if (/\b(movie|film|actor|actress|oscar|emmy|grammy|celebrity|premiere|hollywood|netflix|disney|marvel|series|tv show|streaming|award)\b/.test(q))
    return "entertainment";
  if (/\b(music|concert|tour|album|singer|rapper|band|festival)\b/.test(q))
    return "entertainment";
  if (/\b(election|president|congress|politics|democrat|republican|government|white house)\b/.test(q))
    return "news";
  if (/\b(tech|apple|google|microsoft|ai|startup|iphone|software|crypto)\b/.test(q))
    return "news";
  if (/\b(fashion|beauty|model|runway|designer|luxury)\b/.test(q))
    return "creative";
  return "news";
}

function freeToMedia(r: FreeImageResult): MediaResult {
  return {
    id: r.id, type: "image",
    thumbnail: r.thumbnail, preview_url: r.preview_url, full_url: r.full_url,
    source: r.source, author: r.author,
    width: r.width, height: r.height,
    title: r.title, page_url: r.page_url,
  };
}

// ============================================
// SERPER — Google Images (standard)
// ============================================
async function googleImages(query: string, count: number, minWidth = 800, skipBlockFilter = false, excludeTerms: string[] = []): Promise<MediaResult[]> {
  const key = process.env.SERPER_API_KEY;
  if (!key) return [];
  try {
    const excl = buildExcludeSuffix(excludeTerms);
    const res = await fetch("https://google.serper.dev/images", {
      method: "POST",
      headers: { "X-API-KEY": key, "Content-Type": "application/json" },
      body: JSON.stringify({
        q: skipBlockFilter
          ? `${query} -collage -montage -compilation${excl}`
          : `${query} -collage -montage -compilation -site:gettyimages.com -site:reuters.com${excl}`,
        num: Math.min(count * 3, 40),
      }),
    });
    if (!res.ok) return [];
    const data = await res.json();
    const results: MediaResult[] = [];
    for (const img of data.images || []) {
      if (img.imageUrl && img.imageWidth >= minWidth && (skipBlockFilter || (!isBlockedDomain(img.imageUrl) && !isBlockedDomain(img.link || "")))) {
        results.push({
          id: `serper-${results.length}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          type: "image",
          thumbnail: img.thumbnailUrl || img.imageUrl,
          preview_url: img.imageUrl,
          full_url: img.imageUrl,
          source: "Google",
          author: img.source || "Web",
          width: img.imageWidth,
          height: img.imageHeight,
          title: img.title,
          page_url: img.link,
        });
      }
      if (results.length >= count) break;
    }
    return results;
  } catch { return []; }
}

// ============================================
// SERPER — Creative Commons filtered
// ============================================
async function googleCCImages(query: string, count: number, skipBlockFilter = false, excludeTerms: string[] = []): Promise<MediaResult[]> {
  const key = process.env.SERPER_API_KEY;
  if (!key) return [];
  try {
    const excl = buildExcludeSuffix(excludeTerms);
    const res = await fetch("https://google.serper.dev/images", {
      method: "POST",
      headers: { "X-API-KEY": key, "Content-Type": "application/json" },
      body: JSON.stringify({
        q: skipBlockFilter
          ? `${query} photo -collage -montage -compilation${excl}`
          : `${query} photo -collage -montage -compilation -site:gettyimages.com -site:reuters.com${excl}`,
        num: Math.min(count * 3, 40),
        tbs: "il:cl",
      }),
    });
    if (!res.ok) return [];
    const data = await res.json();
    const results: MediaResult[] = [];
    for (const img of data.images || []) {
      if (img.imageUrl && img.imageWidth >= 600 && (skipBlockFilter || (!isBlockedDomain(img.imageUrl) && !isBlockedDomain(img.link || "")))) {
        results.push({
          id: `serper-cc-${results.length}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          type: "image",
          thumbnail: img.thumbnailUrl || img.imageUrl,
          preview_url: img.imageUrl,
          full_url: img.imageUrl,
          source: "Google CC",
          author: img.source || "Web",
          width: img.imageWidth,
          height: img.imageHeight,
          title: img.title,
          page_url: img.link,
        });
      }
      if (results.length >= count) break;
    }
    console.log(`[serper-cc] "${query}" → ${results.length} CC images`);
    return results;
  } catch { return []; }
}

// ============================================
// SERPER — Site-targeted on known free sources
// ============================================
async function googleSiteImages(query: string, count: number): Promise<MediaResult[]> {
  const key = process.env.SERPER_API_KEY;
  if (!key) return [];
  try {
    const sites = [
      "commons.wikimedia.org", "flickr.com", "unsplash.com",
      "pexels.com", "pixabay.com", "apnews.com", "reuters.com",
    ];
    const siteQuery = sites.map((s) => `site:${s}`).join(" OR ");
    const res = await fetch("https://google.serper.dev/images", {
      method: "POST",
      headers: { "X-API-KEY": key, "Content-Type": "application/json" },
      body: JSON.stringify({
        q: `${query} (${siteQuery})`,
        num: Math.min(count * 3, 40),
      }),
    });
    if (!res.ok) return [];
    const data = await res.json();
    const results: MediaResult[] = [];
    for (const img of data.images || []) {
      if (img.imageUrl && img.imageWidth >= 600 && !isBlockedDomain(img.imageUrl)) {
        results.push({
          id: `serper-site-${results.length}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          type: "image",
          thumbnail: img.thumbnailUrl || img.imageUrl,
          preview_url: img.imageUrl,
          full_url: img.imageUrl,
          source: "Google (Free Sites)",
          author: img.source || "Web",
          width: img.imageWidth,
          height: img.imageHeight,
          title: img.title,
          page_url: img.link,
        });
      }
      if (results.length >= count) break;
    }
    console.log(`[serper-site] "${query}" → ${results.length} free-site images`);
    return results;
  } catch { return []; }
}

// ============================================
// FIRECRAWL — Native image search (v2 API, no scraping)
// Uses sources: ["images"] for direct image results — 1 credit per 10 results
// ============================================
async function firecrawlGoogleImages(query: string, count: number, skipBlockFilter = false, excludeTerms: string[] = []): Promise<MediaResult[]> {
  const key = process.env.FIRECRAWL_API_KEY;
  if (!key) return [];
  try {
    console.log(`[firecrawl-images] Searching (v2 native): "${query}" (limit: ${count + 5})`);

    const excl = buildExcludeSuffix(excludeTerms);
    const res = await fetch("https://api.firecrawl.dev/v2/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        query: skipBlockFilter
          ? `${query} photo larger:800x600 -collage -montage${excl}`
          : `${query} photo larger:800x600 -shutterstock -gettyimages -istockphoto -depositphotos -reuters -collage -montage${excl}`,
        limit: count + 5,
        sources: ["images"],
      }),
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      console.error(`[firecrawl-images] API error ${res.status}: ${errBody.slice(0, 500)}`);
      if (res.status === 402) console.error("[firecrawl-images] CREDITS EXHAUSTED");
      if (res.status === 401) console.error("[firecrawl-images] INVALID API KEY");
      if (res.status === 429) console.error("[firecrawl-images] RATE LIMITED");
      return [];
    }

    const data = await res.json();
    const imageResults = data.data?.images || [];
    console.log(`[firecrawl-images] Got ${imageResults.length} native image results`);
    const results: MediaResult[] = [];

    for (const img of imageResults) {
      const imgUrl = img.imageUrl || "";
      if (imgUrl.startsWith("http") && (skipBlockFilter || (!isBlockedDomain(imgUrl) && !isBlockedDomain(img.url || "")))) {
        results.push({
          id: `fc-${results.length}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          type: "image",
          thumbnail: imgUrl, preview_url: imgUrl, full_url: imgUrl,
          source: "Firecrawl", author: getDomainName(img.url || imgUrl),
          width: img.imageWidth || 1200, height: img.imageHeight || 800,
          title: img.title || "", page_url: img.url || "",
        });
      }
      if (results.length >= count) break;
    }

    console.log(`[firecrawl-images] Final: ${results.length} valid images`);
    return results.slice(0, count);
  } catch (err) {
    console.error("[firecrawl-images] Exception:", err instanceof Error ? err.message : err);
    return [];
  }
}

// ============================================
// SERPER — Google Videos
// ============================================
async function googleVideos(query: string, count: number, skipBlockFilter = false, excludeTerms: string[] = []): Promise<MediaResult[]> {
  const key = process.env.SERPER_API_KEY;
  if (!key) return [];
  try {
    const excl = buildExcludeSuffix(excludeTerms);
    const res = await fetch("https://google.serper.dev/videos", {
      method: "POST",
      headers: { "X-API-KEY": key, "Content-Type": "application/json" },
      body: JSON.stringify({ q: `${query}${excl}`, num: count * 3 }),
    });
    if (!res.ok) return [];
    const data = await res.json();
    const results: MediaResult[] = [];
    for (const vid of data.videos || []) {
      if (vid.link && (skipBlockFilter || !isBlockedDomain(vid.link))) {
        const isYouTube = /youtube\.com|youtu\.be/i.test(vid.link);
        results.push({
          id: `vid-${results.length}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          type: "video" as const,
          thumbnail: vid.thumbnailUrl || vid.imageUrl || "",
          preview_url: vid.link, full_url: vid.link,
          source: "Google Video",
          author: vid.channel || vid.source || "Web",
          width: 1920, height: 1080,
          title: vid.title, page_url: vid.link,
          platform: isYouTube ? "YouTube" : undefined,
          duration_sec: vid.duration ? parseDuration(vid.duration) : undefined,
        });
      }
      if (results.length >= count) break;
    }
    return results;
  } catch { return []; }
}

// ============================================
// Helpers
// ============================================
function isValidImageUrl(url: string): boolean {
  const lower = url.toLowerCase();
  if (lower.includes("icon") || lower.includes("logo") || lower.includes("favicon") || lower.includes("sprite") || lower.includes("avatar")) return false;
  if (lower.includes("1x1") || lower.includes("pixel") || lower.includes("tracking")) return false;
  return /\.(jpg|jpeg|png|webp|gif)(\?.*)?$/i.test(lower) ||
    lower.includes("/image") || lower.includes("/photo") ||
    lower.includes("cdn") || lower.includes("media") || lower.includes("static");
}

function parseDuration(dur: string): number {
  const parts = dur.split(":").map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0] || 0;
}

function getDomainName(url: string): string {
  try { return new URL(url).hostname.replace("www.", ""); } catch { return "Web"; }
}

function demoImages(query: string, count: number): MediaResult[] {
  const seed = query.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  return Array.from({ length: count }).map((_, i) => ({
    id: `demo-${seed}-${i}`, type: "image" as const,
    thumbnail: `https://picsum.photos/seed/${seed + i}/400/300`,
    preview_url: `https://picsum.photos/seed/${seed + i}/800/600`,
    full_url: `https://picsum.photos/seed/${seed + i}/1920/1080`,
    source: "Google", author: "Demo", width: 1920, height: 1080,
  }));
}

// ============================================
// ROUTE HANDLER
// ============================================
/** List of sources the client can request individually (parallel streaming UX). */
export const SOURCE_KEYS = ["Imago", "Imagn", "Google", "Google CC", "Pexels", "Firecrawl"] as const;
export const VIDEO_SOURCE_KEYS = ["Google Video"] as const;

export async function POST(req: NextRequest) {
  try {
    const {
      query,
      video_query,
      slide_id,
      mode,
      source,
      allow_non_licensed,
      search_entities,
      exclude_terms,
      alternate_queries,
      subject,
    } = await req.json();

    // Editorial archives (Imago/Imagn) index broad subjects like "NFL Draft 2025",
    // not visual moments like "countdown board". Use the segment's canonical
    // subject if it's a meaningful broader rephrasing of the query; otherwise
    // fall back to the full query.
    const editorialQuery =
      typeof subject === "string" && subject.trim().length >= 3 && subject.trim() !== query?.trim()
        ? subject.trim()
        : query;
    const skipBlock = allow_non_licensed === true;
    if (!query) return NextResponse.json({ error: "Query required" }, { status: 400 });

    // Relevance context from the AI segmentation step — used to score results.
    const entities: string[] = Array.isArray(search_entities) ? search_entities : [];
    const excludes: string[] = Array.isArray(exclude_terms) ? exclude_terms : [];
    const altImageQueries: string[] = Array.isArray(alternate_queries?.image) ? alternate_queries.image : [];
    const altVideoQueries: string[] = Array.isArray(alternate_queries?.video) ? alternate_queries.video : [];
    const imgContext: QueryContext = { entities, excludeTerms: excludes, query };
    const vidContext: QueryContext = { entities, excludeTerms: excludes, query: video_query || query };

    const isVideoMode = mode === "video";
    const hasSerper = !!process.env.SERPER_API_KEY;
    const hasFirecrawl = !!process.env.FIRECRAWL_API_KEY;
    // Imago/Imagn are now pure HTTP scrapes — no credentials needed.
    const hasImago = true;
    const hasImagn = true;

    if (!hasSerper && !hasFirecrawl) {
      // Still fall back to demo if no search-API keys at all are configured,
      // since scrapers alone produce thin results without Serper/Firecrawl.
      return NextResponse.json({ slide_id, images: demoImages(query, 14), videos: [], is_demo: true });
    }

    // Auto-detect content category from query (shared)
    const category = detectCategory(query);

    // Per-source runners — each returns its own results independently.
    // No aggressive timeouts here: slow sources finish in their own time, and the
    // client tracks them as still-loading until they return.
    const runners: Record<string, () => Promise<MediaResult[]>> = {
      "Imago": () =>
        hasImago
          ? searchImago({ query: editorialQuery, category, count: 5 })
              .then((results) => results.map((r): MediaResult => ({
                id: r.id, type: "image",
                thumbnail: r.thumbnail, preview_url: r.preview_url, full_url: r.full_url,
                source: "Imago", author: r.photographer,
                width: r.width, height: r.height, title: r.caption,
                page_url: r.page_url,
              })))
              .catch(() => [] as MediaResult[])
          : Promise.resolve([]),
      "Imagn": () =>
        hasImagn
          ? searchImagn({ query: editorialQuery, count: 5 })
              .then((results) => results.map((r): MediaResult => ({
                id: r.id, type: "image",
                thumbnail: r.thumbnail, preview_url: r.preview_url, full_url: r.full_url,
                source: "Imagn", author: r.photographer,
                width: r.width, height: r.height, title: r.caption,
                page_url: r.page_url,
              })))
              .catch(() => [] as MediaResult[])
          : Promise.resolve([]),
      "Google": () =>
        hasSerper
          ? (async () => {
              // Primary + one alternate query fan-out for wider coverage.
              const primary = await googleImages(`${query} high resolution editorial photo`, 5, 800, skipBlock, excludes).catch(() => []);
              const alt = altImageQueries[0]
                ? await googleImages(altImageQueries[0], 3, 800, skipBlock, excludes).catch(() => [])
                : [];
              return [...primary, ...alt];
            })()
          : Promise.resolve([]),
      "Google CC": () =>
        hasSerper ? googleCCImages(query, 5, skipBlock, excludes).catch(() => []) : Promise.resolve([]),
      "Pexels": () =>
        // Pexels doesn't support `-term` negatives; relevance scoring filters post-hoc.
        searchFreeImages({ query, count: 3, perProvider: 3, providers: ["pexels"] })
          .then((results) => results.map(freeToMedia))
          .catch(() => [] as MediaResult[]),
      "Firecrawl": () =>
        hasFirecrawl ? firecrawlGoogleImages(query, 5, skipBlock, excludes).catch(() => []) : Promise.resolve([]),
    };

    const videoRunners: Record<string, () => Promise<MediaResult[]>> = {
      "Google Video": async () => {
        if (!hasSerper || !video_query) return [];
        const [a, b, c] = await Promise.all([
          googleVideos(video_query, 5, skipBlock, excludes).catch(() => []),
          googleVideos(`${video_query} highlights`, 3, skipBlock, excludes).catch(() => []),
          altVideoQueries[0]
            ? googleVideos(altVideoQueries[0], 3, skipBlock, excludes).catch(() => [])
            : Promise.resolve([] as MediaResult[]),
        ]);
        return [...a, ...b, ...c];
      },
    };

    // ── Single-source mode: run only the requested source and return ──
    // Within a single source, sort by relevance so the most on-topic results
    // surface first in the UI (the client still shows the full list).
    if (source && typeof source === "string") {
      const isVideoSource = source in videoRunners;
      const runner = runners[source] || videoRunners[source];
      if (!runner) {
        return NextResponse.json({ error: `Unknown source: ${source}` }, { status: 400 });
      }
      const results = await runner();
      const ctx = isVideoSource ? vidContext : imgContext;
      const sorted = results
        .map((r) => ({ r, s: scoreResult(r, skipBlock, ctx) }))
        .sort((a, b) => b.s - a.s)
        .map(({ r }) => r);
      console.log(`[media-sourcing/search] source="${source}" "${query}" → ${sorted.length}`);
      return NextResponse.json({
        slide_id,
        source,
        images: isVideoSource ? [] : sorted,
        videos: isVideoSource ? sorted : [],
        is_demo: false,
      });
    }

    // ── Fallback: no `source` param — run all in parallel, return combined.
    // Used by legacy callers; the UI now calls per-source so doesn't hit this path.
    const settleAll = async (ps: Promise<MediaResult[]>[]): Promise<MediaResult[]> => {
      const settled = await Promise.allSettled(ps);
      return settled.flatMap((s) => (s.status === "fulfilled" ? s.value : []));
    };
    const sources = Object.keys(runners);
    const imageResults = await settleAll(Object.values(runners).map((r) => r()));
    const videoResults = isVideoMode
      ? await settleAll(Object.values(videoRunners).map((r) => r()))
      : [];

    // Deduplicate and score (context-aware relevance: entity boost + exclude penalty)
    const dedupedImages = deduplicateResults(imageResults)
      .map((r) => ({ ...r, _score: scoreResult(r, skipBlock, imgContext) }))
      .filter((r) => r._score > -500)
      .sort((a, b) => b._score - a._score);

    // ── Balanced selection: 5 per major source, 2 per free provider ──
    const TOTAL_TARGET = 25;

    // Per-source limits: major sources = 5, Pexels = 3
    const SOURCE_LIMITS: Record<string, number> = {
      Imago: 5, Imagn: 5, Google: 5, "Google CC": 5,
      Firecrawl: 5, "Google (Free Sites)": 5,
      Pexels: 3,
    };

    type ScoredResult = (typeof dedupedImages)[number];
    const sourceGroups: Record<string, ScoredResult[]> = {};
    for (const r of dedupedImages) {
      if (!sourceGroups[r.source]) sourceGroups[r.source] = [];
      sourceGroups[r.source].push(r);
    }

    // Round 1: Take up to the per-source limit from each source
    const selected: ScoredResult[] = [];
    const usedIds = new Set<string>();
    for (const source of Object.keys(sourceGroups)) {
      const limit = SOURCE_LIMITS[source] ?? 2;
      const picks = sourceGroups[source].slice(0, limit);
      for (const pick of picks) {
        if (!usedIds.has(pick.id)) {
          selected.push(pick);
          usedIds.add(pick.id);
        }
      }
    }

    // Round 2: Fill remaining slots with the best unused results (any source)
    if (selected.length < TOTAL_TARGET) {
      for (const r of dedupedImages) {
        if (selected.length >= TOTAL_TARGET) break;
        if (!usedIds.has(r.id)) {
          selected.push(r);
          usedIds.add(r.id);
        }
      }
    }

    // Final sort by score
    selected.sort((a, b) => b._score - a._score);
    const uniqueImages = selected
      .slice(0, TOTAL_TARGET)
      .map(({ _score, ...rest }) => rest) as MediaResult[];

    const uniqueVideos = deduplicateResults(videoResults).slice(0, 8);

    // Log by source group
    const finalCounts = uniqueImages.reduce((acc, r) => {
      acc[r.source] = (acc[r.source] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    const rawCounts = imageResults.reduce((acc, r) => {
      acc[r.source] = (acc[r.source] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    console.log(`[media-sourcing/search] "${query}" → raw: ${imageResults.length} (${
      Object.entries(rawCounts).map(([s, c]) => `${c} ${s}`).join(", ")})`);
    console.log(`[media-sourcing/search] "${query}" → final: ${uniqueImages.length} balanced (${
      Object.entries(finalCounts).map(([s, c]) => `${c} ${s}`).join(", ")}), ${uniqueVideos.length} videos`);

    return NextResponse.json({ slide_id, images: uniqueImages, videos: uniqueVideos, sources, is_demo: false });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Search failed" }, { status: 500 });
  }
}
