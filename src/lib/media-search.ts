// src/lib/media-search.ts
// Shared media search engine used by both tools
// Sources: Google via Serper (primary) + Firecrawl Google search (supplementary)
// Returns high-quality, downloadable images and videos

import { isBlockedDomain, deduplicateResults, scoreResult } from "./search-optimizer";

export type MediaResult = {
  id: string;
  type: "image" | "video";
  thumbnail: string;
  preview_url: string;
  full_url: string;
  source: string;
  author: string;
  width: number;
  height: number;
  duration_sec?: number;
  title?: string;
  platform?: string;
  page_url?: string;
};

type ContentAge = "any" | "24h" | "week" | "month" | "year";

function getTimeBias(age: ContentAge): string | null {
  switch (age) {
    case "24h": return "qdr:d";
    case "week": return "qdr:w";
    case "month": return "qdr:m";
    case "year": return "qdr:y";
    default: return null;
  }
}

function detectPlatform(url: string): string {
  if (url.includes("youtube.com") || url.includes("youtu.be")) return "YouTube";
  if (url.includes("tiktok.com")) return "TikTok";
  if (url.includes("instagram.com")) return "Instagram";
  if (url.includes("vimeo.com")) return "Vimeo";
  return "Web";
}

function parseDuration(dur: string): number | undefined {
  if (!dur) return undefined;
  const parts = dur.split(":").map(Number);
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return undefined;
}

// ============================================
// SERPER — Google Images (fast, structured)
// ============================================
async function serperImages(query: string, count: number, age: ContentAge): Promise<MediaResult[]> {
  const key = process.env.SERPER_API_KEY;
  if (!key) return [];
  try {
    const body: Record<string, unknown> = { q: `${query} imagesize:large`, num: Math.min(count * 3, 40) };
    const tbs = getTimeBias(age);
    if (tbs) body.tbs = tbs;

    const res = await fetch("https://google.serper.dev/images", {
      method: "POST",
      headers: { "X-API-KEY": key, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) return [];
    const data = await res.json();
    const results: MediaResult[] = [];
    for (const img of data.images || []) {
      if (img.imageUrl && img.imageWidth >= 800 && !isBlockedDomain(img.imageUrl)) {
        results.push({
          id: `serper-img-${results.length}-${Date.now()}`,
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
// SERPER — Google Videos
// ============================================
async function serperVideos(query: string, count: number, age: ContentAge): Promise<MediaResult[]> {
  const key = process.env.SERPER_API_KEY;
  if (!key) return [];
  try {
    const body: Record<string, unknown> = { q: query, num: Math.min(count * 3, 30) };
    const tbs = getTimeBias(age);
    if (tbs) body.tbs = tbs;

    const res = await fetch("https://google.serper.dev/videos", {
      method: "POST",
      headers: { "X-API-KEY": key, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) return [];
    const data = await res.json();
    const results: MediaResult[] = [];
    for (const vid of data.videos || []) {
      if (vid.link && !isBlockedDomain(vid.link)) {
        results.push({
          id: `serper-vid-${results.length}-${Date.now()}`,
          type: "video",
          thumbnail: vid.thumbnailUrl || vid.imageUrl || "",
          preview_url: vid.link,
          full_url: vid.link,
          source: "Google",
          author: vid.channel || vid.source || "Web",
          width: 1920, height: 1080,
          title: vid.title,
          platform: detectPlatform(vid.link),
          duration_sec: vid.duration ? parseDuration(vid.duration) : undefined,
        });
      }
      if (results.length >= count) break;
    }
    return results;
  } catch { return []; }
}

// ============================================
// FIRECRAWL — Google Image Search (deeper, gets more results)
// ============================================
async function firecrawlGoogleImages(query: string, count: number): Promise<MediaResult[]> {
  const key = process.env.FIRECRAWL_API_KEY;
  if (!key) {
    console.log("[firecrawl-images] No FIRECRAWL_API_KEY configured, skipping");
    return [];
  }
  try {
    console.log(`[firecrawl-images] Searching: "${query}" (limit: ${count + 5})`);

    const res = await fetch("https://api.firecrawl.dev/v1/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        query: `${query} high resolution photo`,
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
                      url: { type: "string", description: "Direct URL to the image file (.jpg, .jpeg, .png, .webp)" },
                      alt: { type: "string", description: "Alt text or caption" },
                      credit: { type: "string", description: "Photo credit or source" },
                    },
                    required: ["url"],
                  },
                },
              },
              required: ["images"],
            },
            prompt: "Extract all high-quality photograph URLs from this page. Look for img src attributes with file extensions .jpg, .jpeg, .png, .webp. Only include actual photographs — ignore icons, logos, avatars, ads, and UI elements. Prefer the largest/highest resolution version available.",
          },
        },
      }),
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      console.error(`[firecrawl-images] API error ${res.status}: ${errBody.slice(0, 500)}`);

      // Common error codes
      if (res.status === 402) console.error("[firecrawl-images] ⚠️ CREDITS EXHAUSTED — Firecrawl account has no remaining credits");
      if (res.status === 401) console.error("[firecrawl-images] ⚠️ INVALID API KEY — check FIRECRAWL_API_KEY in .env.local");
      if (res.status === 429) console.error("[firecrawl-images] ⚠️ RATE LIMITED — too many requests, try again later");

      return [];
    }

    const data = await res.json();
    console.log(`[firecrawl-images] Got ${data.data?.length || 0} search results`);

    const results: MediaResult[] = [];

    for (const result of data.data || []) {
      const pageTitle = result.title || "";
      const pageUrl = result.url || "";
      const extractedImages = result.extract?.images || [];

      console.log(`[firecrawl-images] Page "${pageTitle.slice(0, 50)}" — ${extractedImages.length} images extracted`);

      for (const img of extractedImages) {
        if (img.url?.startsWith("http") && isValidImageUrl(img.url) && !isBlockedDomain(img.url)) {
          results.push({
            id: `fc-img-${results.length}-${Date.now()}`,
            type: "image",
            thumbnail: img.url,
            preview_url: img.url,
            full_url: img.url,
            source: "Firecrawl",
            author: img.credit || getDomainName(pageUrl),
            width: 1200, height: 800,
            title: img.alt || pageTitle.slice(0, 80),
            page_url: pageUrl,
          });
        }
        if (results.length >= count) break;
      }

      // og:image fallback
      const ogImage = result.metadata?.ogImage || result.metadata?.["og:image"];
      if (ogImage?.startsWith("http") && isValidImageUrl(ogImage) && !isBlockedDomain(ogImage)) {
        if (!results.some((r) => r.full_url === ogImage)) {
          results.push({
            id: `fc-og-${results.length}-${Date.now()}`,
            type: "image",
            thumbnail: ogImage,
            preview_url: ogImage,
            full_url: ogImage,
            source: "Firecrawl",
            author: getDomainName(pageUrl),
            width: 1200, height: 800,
            title: pageTitle.slice(0, 80),
            page_url: pageUrl,
          });
        }
      }

      if (results.length >= count) break;
    }

    console.log(`[firecrawl-images] Final: ${results.length} valid images for "${query}"`);
    return results.slice(0, count);
  } catch (err) {
    console.error("[firecrawl-images] Exception:", err instanceof Error ? err.message : err);
    return [];
  }
}

// ============================================
// FIRECRAWL — Google Video Search
// ============================================
async function firecrawlGoogleVideos(query: string, count: number): Promise<MediaResult[]> {
  const key = process.env.FIRECRAWL_API_KEY;
  if (!key) {
    console.log("[firecrawl-videos] No FIRECRAWL_API_KEY configured, skipping");
    return [];
  }
  try {
    console.log(`[firecrawl-videos] Searching: "${query}" (limit: ${count + 3})`);

    const res = await fetch("https://api.firecrawl.dev/v1/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        query: `${query} video footage`,
        limit: count + 3,
      }),
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      console.error(`[firecrawl-videos] API error ${res.status}: ${errBody.slice(0, 500)}`);
      if (res.status === 402) console.error("[firecrawl-videos] ⚠️ CREDITS EXHAUSTED");
      if (res.status === 401) console.error("[firecrawl-videos] ⚠️ INVALID API KEY");
      if (res.status === 429) console.error("[firecrawl-videos] ⚠️ RATE LIMITED");
      return [];
    }

    const data = await res.json();
    console.log(`[firecrawl-videos] Got ${data.data?.length || 0} search results`);

    const results: MediaResult[] = [];

    for (const result of data.data || []) {
      const url = result.url || "";
      const title = result.title || "";
      const thumbnail = result.metadata?.ogImage || result.metadata?.image || "";

      if ((url.includes("youtube.com/watch") || url.includes("youtu.be") || url.includes("vimeo.com")) && !isBlockedDomain(url)) {
        results.push({
          id: `fc-vid-${results.length}-${Date.now()}`,
          type: "video",
          thumbnail,
          preview_url: url,
          full_url: url,
          source: "Firecrawl",
          author: title.split("|")[0]?.trim().split("-")[0]?.trim() || "Web",
          width: 1920, height: 1080,
          title: title.slice(0, 80),
          platform: detectPlatform(url),
        });
        console.log(`[firecrawl-videos] Found: ${title.slice(0, 60)} (${detectPlatform(url)})`);
      }
      if (results.length >= count) break;
    }

    console.log(`[firecrawl-videos] Final: ${results.length} videos for "${query}"`);
    return results;
  } catch (err) {
    console.error("[firecrawl-videos] Exception:", err instanceof Error ? err.message : err);
    return [];
  }
}

// ============================================
// DEMO
// ============================================
function demoResults(query: string, type: "image" | "video", count: number): MediaResult[] {
  const seed = query.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  return Array.from({ length: count }).map((_, i) => ({
    id: `demo-${type}-${seed}-${i}`,
    type,
    thumbnail: `https://picsum.photos/seed/${seed + i + (type === "video" ? 200 : 0)}/400/300`,
    preview_url: `https://picsum.photos/seed/${seed + i}/800/600`,
    full_url: `https://picsum.photos/seed/${seed + i}/1920/1080`,
    source: "Demo", author: "Demo", width: 1920, height: 1080,
    duration_sec: type === "video" ? 5 + i : undefined,
    platform: type === "video" ? "Demo" : undefined,
  }));
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

function getDomainName(url: string): string {
  try {
    return new URL(url).hostname.replace("www.", "");
  } catch {
    return "Web";
  }
}

// ============================================
// PUBLIC API — used by both tools
// ============================================

export type SearchOptions = {
  imageQuery: string;
  videoQuery?: string;
  imageCount?: number;
  videoCount?: number;
  contentAge?: ContentAge;
  includeVideos?: boolean;
};

export type SearchResult = {
  images: MediaResult[];
  videos: MediaResult[];
  sources: string[];
  is_demo: boolean;
};

export async function searchMedia(options: SearchOptions): Promise<SearchResult> {
  const {
    imageQuery,
    videoQuery,
    imageCount = 12,
    videoCount = 5,
    contentAge = "any",
    includeVideos = false,
  } = options;

  const hasSerper = !!process.env.SERPER_API_KEY;
  const hasFirecrawl = !!process.env.FIRECRAWL_API_KEY;

  if (!hasSerper && !hasFirecrawl) {
    return {
      images: demoResults(imageQuery, "image", imageCount),
      videos: includeVideos ? demoResults(videoQuery || imageQuery, "video", videoCount) : [],
      sources: ["Demo"],
      is_demo: true,
    };
  }

  const imageSearches: Promise<MediaResult[]>[] = [];
  const videoSearches: Promise<MediaResult[]>[] = [];
  const sources: string[] = [];

  // Serper — fast structured results
  if (hasSerper) {
    // Primary image query
    imageSearches.push(serperImages(imageQuery, 8, contentAge));
    // Alternate query for variety
    const altQuery = imageQuery.includes("photo")
      ? imageQuery.replace("photo", "image")
      : `${imageQuery} photo`;
    imageSearches.push(serperImages(altQuery, 6, contentAge));
    // Third variation with "latest" for recency
    imageSearches.push(serperImages(`${imageQuery} latest`, 5, contentAge));
    sources.push("Google (Serper)");

    if (includeVideos && videoQuery) {
      videoSearches.push(serperVideos(videoQuery, 5, contentAge));
      videoSearches.push(serperVideos(`${videoQuery} highlights`, 4, contentAge));
    }
  }

  // Firecrawl — deeper extraction, different results
  if (hasFirecrawl) {
    imageSearches.push(firecrawlGoogleImages(imageQuery, 6));
    // Variation targeting free-use sources
    imageSearches.push(firecrawlGoogleImages(`${imageQuery} free use editorial`, 4));
    sources.push("Firecrawl");

    if (includeVideos && videoQuery) {
      videoSearches.push(firecrawlGoogleVideos(videoQuery, 4));
    }
  }

  const [imageResults, videoResults] = await Promise.all([
    Promise.all(imageSearches).then((r) => r.flat()),
    includeVideos ? Promise.all(videoSearches).then((r) => r.flat()) : Promise.resolve([]),
  ]);

  // Log summary
  console.log(`[media-search] Query: "${imageQuery}"`);
  console.log(`[media-search] Raw results: ${imageResults.length} images, ${videoResults.length} videos`);
  console.log(`[media-search] By source: ${
    ["Google (Serper)", "Firecrawl"].map(s => {
      const imgCount = imageResults.filter(r => r.source === (s.includes("Serper") ? "Google" : "Firecrawl")).length;
      const vidCount = videoResults.filter(r => r.source === (s.includes("Serper") ? "Google" : "Firecrawl")).length;
      return `${s}: ${imgCount} img + ${vidCount} vid`;
    }).join(", ")
  }`);

  // Deduplicate, score, sort
  const uniqueImages = deduplicateResults(imageResults)
    .map((r) => ({ ...r, _score: scoreResult(r) }))
    .filter((r) => r._score > -500)
    .sort((a, b) => b._score - a._score)
    .slice(0, imageCount)
    .map(({ _score, ...rest }) => rest) as MediaResult[];

  const uniqueVideos = includeVideos
    ? deduplicateResults(videoResults)
        .map((r) => ({ ...r, _score: scoreResult(r) }))
        .filter((r) => r._score > -500)
        .sort((a, b) => b._score - a._score)
        .slice(0, videoCount)
        .map(({ _score, ...rest }) => rest) as MediaResult[]
    : [];

  console.log(`[media-search] Final: ${uniqueImages.length} images, ${uniqueVideos.length} videos (after dedup + scoring)`);

  return { images: uniqueImages, videos: uniqueVideos, sources, is_demo: false };
}