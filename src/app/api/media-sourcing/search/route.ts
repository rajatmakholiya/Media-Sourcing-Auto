// src/app/api/media-sourcing/search/route.ts
// Media search for MSN articles — comprehensive multi-source search
// Sources: Serper (standard + CC + site-targeted) + Free providers (Wikimedia, Pexels, etc.)
//          + Licensed providers (Imago, Imagn) + Firecrawl (standard + editorial)
import { NextRequest, NextResponse } from "next/server";
import { isBlockedDomain, deduplicateResults, scoreResult } from "@/lib/search-optimizer";
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
async function googleImages(query: string, count: number, minWidth = 800): Promise<MediaResult[]> {
  const key = process.env.SERPER_API_KEY;
  if (!key) return [];
  try {
    const res = await fetch("https://google.serper.dev/images", {
      method: "POST",
      headers: { "X-API-KEY": key, "Content-Type": "application/json" },
      body: JSON.stringify({
        q: `${query} -collage -montage -compilation -site:gettyimages.com -site:reuters.com`,
        num: Math.min(count * 3, 40),
      }),
    });
    if (!res.ok) return [];
    const data = await res.json();
    const results: MediaResult[] = [];
    for (const img of data.images || []) {
      if (img.imageUrl && img.imageWidth >= minWidth && !isBlockedDomain(img.imageUrl) && !isBlockedDomain(img.link || "")) {
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
async function googleCCImages(query: string, count: number): Promise<MediaResult[]> {
  const key = process.env.SERPER_API_KEY;
  if (!key) return [];
  try {
    const res = await fetch("https://google.serper.dev/images", {
      method: "POST",
      headers: { "X-API-KEY": key, "Content-Type": "application/json" },
      body: JSON.stringify({
        q: `${query} photo -collage -montage -compilation -site:gettyimages.com -site:reuters.com`,
        num: Math.min(count * 3, 40),
        tbs: "il:cl",
      }),
    });
    if (!res.ok) return [];
    const data = await res.json();
    const results: MediaResult[] = [];
    for (const img of data.images || []) {
      if (img.imageUrl && img.imageWidth >= 600 && !isBlockedDomain(img.imageUrl) && !isBlockedDomain(img.link || "")) {
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
// FIRECRAWL — Deep extraction (standard + editorial)
// ============================================
async function firecrawlGoogleImages(query: string, count: number): Promise<MediaResult[]> {
  const key = process.env.FIRECRAWL_API_KEY;
  if (!key) return [];
  try {
    console.log(`[firecrawl-images] Searching: "${query}" (limit: ${count + 5})`);

    const res = await fetch("https://api.firecrawl.dev/v1/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        query: `${query} high resolution photo -shutterstock -gettyimages -istockphoto -adobe.stock -reuters -collage -montage`,
        limit: count + 5,
        scrapeOptions: {
          formats: ["extract"],
          extract: {
            schema: {
              type: "object",
              properties: {
                images: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      url: { type: "string", description: "Direct URL to image file (.jpg, .jpeg, .png, .webp)" },
                      alt: { type: "string", description: "Alt text or caption" },
                      credit: { type: "string", description: "Photo credit or source" },
                    },
                    required: ["url"],
                  },
                },
              },
              required: ["images"],
            },
            prompt: "Extract all high-quality photograph URLs. Get img src with .jpg, .jpeg, .png, .webp. Only actual photographs — ignore icons, logos, avatars, ads. Prefer largest resolution.",
          },
        },
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
    console.log(`[firecrawl-images] Got ${data.data?.length || 0} search results`);
    const results: MediaResult[] = [];

    for (const result of data.data || []) {
      const pageTitle = result.title || "";
      const pageUrl = result.url || "";
      const extractedImages = result.extract?.images || [];

      for (const img of extractedImages) {
        if (img.url?.startsWith("http") && isValidImageUrl(img.url) && !isBlockedDomain(img.url) && !isBlockedDomain(pageUrl)) {
          results.push({
            id: `fc-${results.length}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            type: "image",
            thumbnail: img.url, preview_url: img.url, full_url: img.url,
            source: "Firecrawl", author: img.credit || getDomainName(pageUrl),
            width: 1200, height: 800,
            title: img.alt || pageTitle.slice(0, 80), page_url: pageUrl,
          });
        }
        if (results.length >= count) break;
      }

      const ogImage = result.metadata?.ogImage || result.metadata?.["og:image"];
      if (ogImage?.startsWith("http") && isValidImageUrl(ogImage) && !isBlockedDomain(ogImage)) {
        if (!results.some((r) => r.full_url === ogImage)) {
          results.push({
            id: `fc-og-${results.length}-${Date.now()}`,
            type: "image",
            thumbnail: ogImage, preview_url: ogImage, full_url: ogImage,
            source: "Firecrawl", author: getDomainName(pageUrl),
            width: 1200, height: 800,
            title: pageTitle.slice(0, 80), page_url: pageUrl,
          });
        }
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
async function googleVideos(query: string, count: number): Promise<MediaResult[]> {
  const key = process.env.SERPER_API_KEY;
  if (!key) return [];
  try {
    const res = await fetch("https://google.serper.dev/videos", {
      method: "POST",
      headers: { "X-API-KEY": key, "Content-Type": "application/json" },
      body: JSON.stringify({ q: query, num: count * 3 }),
    });
    if (!res.ok) return [];
    const data = await res.json();
    const results: MediaResult[] = [];
    for (const vid of data.videos || []) {
      if (vid.link && !isBlockedDomain(vid.link)) {
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
    const { query, video_query, slide_id, mode, source } = await req.json();
    if (!query) return NextResponse.json({ error: "Query required" }, { status: 400 });

    const isVideoMode = mode === "video";
    const hasSerper = !!process.env.SERPER_API_KEY;
    const hasFirecrawl = !!process.env.FIRECRAWL_API_KEY;
    const hasImago = !!(process.env.IMAGO_EMAIL && process.env.IMAGO_PASSWORD);
    const hasImagn = !!(process.env.IMAGN_EMAIL && process.env.IMAGN_PASSWORD);

    if (!hasSerper && !hasFirecrawl && !hasImago && !hasImagn) {
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
          ? searchImago({ query, category, count: 5 })
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
          ? searchImagn({ query, count: 5 })
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
          ? googleImages(`${query} high resolution editorial photo`, 5, 800).catch(() => [])
          : Promise.resolve([]),
      "Google CC": () =>
        hasSerper ? googleCCImages(query, 5).catch(() => []) : Promise.resolve([]),
      "Pexels": () =>
        searchFreeImages({ query, count: 3, perProvider: 3, providers: ["pexels"] })
          .then((results) => results.map(freeToMedia))
          .catch(() => [] as MediaResult[]),
      "Firecrawl": () =>
        hasFirecrawl ? firecrawlGoogleImages(query, 5).catch(() => []) : Promise.resolve([]),
    };

    const videoRunners: Record<string, () => Promise<MediaResult[]>> = {
      "Google Video": async () => {
        if (!hasSerper || !video_query) return [];
        const [a, b] = await Promise.all([
          googleVideos(video_query, 5).catch(() => []),
          googleVideos(`${video_query} highlights`, 3).catch(() => []),
        ]);
        return [...a, ...b];
      },
    };

    // ── Single-source mode: run only the requested source and return ──
    if (source && typeof source === "string") {
      const isVideoSource = source in videoRunners;
      const runner = runners[source] || videoRunners[source];
      if (!runner) {
        return NextResponse.json({ error: `Unknown source: ${source}` }, { status: 400 });
      }
      const results = await runner();
      console.log(`[media-sourcing/search] source="${source}" "${query}" → ${results.length}`);
      return NextResponse.json({
        slide_id,
        source,
        images: isVideoSource ? [] : results,
        videos: isVideoSource ? results : [],
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

    // Deduplicate and score
    const dedupedImages = deduplicateResults(imageResults)
      .map((r) => ({ ...r, _score: scoreResult(r) }))
      .filter((r) => r._score > -500)
      .sort((a, b) => b._score - a._score);

    // ── Balanced selection: 5 per major source, 2 per free provider ──
    const TOTAL_TARGET = 25;

    // Per-source limits: major sources = 5, Pexels = 3
    const SOURCE_LIMITS: Record<string, number> = {
      Imago: 5, Imagn: 5, Google: 5, "Google CC": 5,
      Firecrawl: 5, "Firecrawl Editorial": 5, "Google (Free Sites)": 5,
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
