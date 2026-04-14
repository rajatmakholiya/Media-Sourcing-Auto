// src/lib/media-search.ts
// Shared media search engine used by both tools
// Sources (in priority order):
//   1. Imago & Imagn — licensed editorial (Playwright-based)
//   2. Wikimedia Commons — free editorial photos (no API key)
//   3. Flickr CC — Creative Commons photography
//   4. Google via Serper — CC-filtered + site-targeted + general
//   5. Pexels / Unsplash / Pixabay — free stock
//   6. Firecrawl — deep web extraction targeting free-use sites
// Returns high-quality, downloadable images and videos

import { isBlockedDomain, deduplicateResults, scoreResult } from "./search-optimizer";
import { searchImago } from "./imago-provider";
import { searchImagn } from "./imagn-provider";
import { searchFreeImages, type FreeImageResult } from "./free-image-providers";

/** Fetch with timeout — prevents hanging on slow APIs */
function fetchWithTimeout(url: string, options: RequestInit, timeoutMs = 10000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timer));
}

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

/** Convert FreeImageResult to MediaResult */
function freeToMedia(r: FreeImageResult): MediaResult {
  return {
    id: r.id,
    type: "image",
    thumbnail: r.thumbnail,
    preview_url: r.preview_url,
    full_url: r.full_url,
    source: r.source,
    author: r.author,
    width: r.width,
    height: r.height,
    title: r.title,
    page_url: r.page_url,
  };
}

// ============================================
// SERPER — Google Images with Creative Commons filtering
// ============================================

/** Standard Serper image search */
async function serperImages(query: string, count: number, age: ContentAge): Promise<MediaResult[]> {
  const key = process.env.SERPER_API_KEY;
  if (!key) return [];
  try {
    const body: Record<string, unknown> = {
      q: `${query} imagesize:large -collage -montage -compilation -site:gettyimages.com -site:reuters.com`,
      num: Math.min(count * 3, 40),
    };
    const tbs = getTimeBias(age);
    if (tbs) body.tbs = tbs;

    const res = await fetchWithTimeout("https://google.serper.dev/images", {
      method: "POST",
      headers: { "X-API-KEY": key, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }, 8000);
    if (!res.ok) return [];
    const data = await res.json();
    const results: MediaResult[] = [];
    for (const img of data.images || []) {
      if (img.imageUrl && img.imageWidth >= 800 && !isBlockedDomain(img.imageUrl) && !isBlockedDomain(img.link || "")) {
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

/** Serper — Creative Commons filtered images (tbs=il:cl) */
async function serperCCImages(query: string, count: number): Promise<MediaResult[]> {
  const key = process.env.SERPER_API_KEY;
  if (!key) return [];
  try {
    const res = await fetchWithTimeout("https://google.serper.dev/images", {
      method: "POST",
      headers: { "X-API-KEY": key, "Content-Type": "application/json" },
      body: JSON.stringify({
        q: `${query} photo -collage -montage -compilation -site:gettyimages.com -site:reuters.com`,
        num: Math.min(count * 3, 40),
        tbs: "il:cl", // Creative Commons license filter
      }),
    }, 8000);
    if (!res.ok) return [];
    const data = await res.json();
    const results: MediaResult[] = [];
    for (const img of data.images || []) {
      if (img.imageUrl && img.imageWidth >= 800 && !isBlockedDomain(img.imageUrl) && !isBlockedDomain(img.link || "")) {
        results.push({
          id: `serper-cc-${results.length}-${Date.now()}`,
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
    console.log(`[serper-cc] "${query}" → ${results.length} Creative Commons images`);
    return results;
  } catch { return []; }
}

/** Serper — site-targeted search on known free/editorial sources */
async function serperSiteSearch(query: string, sites: string[], count: number): Promise<MediaResult[]> {
  const key = process.env.SERPER_API_KEY;
  if (!key) return [];
  try {
    // Build OR query across multiple sites
    const siteQuery = sites.map((s) => `site:${s}`).join(" OR ");
    const res = await fetchWithTimeout("https://google.serper.dev/images", {
      method: "POST",
      headers: { "X-API-KEY": key, "Content-Type": "application/json" },
      body: JSON.stringify({
        q: `${query} (${siteQuery})`,
        num: Math.min(count * 3, 40),
      }),
    }, 8000);
    if (!res.ok) return [];
    const data = await res.json();
    const results: MediaResult[] = [];
    for (const img of data.images || []) {
      if (img.imageUrl && img.imageWidth >= 600 && !isBlockedDomain(img.imageUrl)) {
        results.push({
          id: `serper-site-${results.length}-${Date.now()}`,
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
    console.log(`[serper-site] "${query}" → ${results.length} images from free sites`);
    return results;
  } catch { return []; }
}

// Known free-use and editorial sites across all MSN content domains
// (sports, entertainment, pop culture, politics, tech, lifestyle, etc.)
const FREE_EDITORIAL_SITES = [
  // Free image libraries
  "commons.wikimedia.org",
  "flickr.com",
  "unsplash.com",
  "pexels.com",
  "pixabay.com",
  // News / wire services (editorial press images)
  "apnews.com",
  // reuters.com removed — strictly prohibited
  // Sports
  "nfl.com",
  "nba.com",
  "mlb.com",
  "espn.com",
  // Entertainment / pop culture
  "imdb.com",
  "rottentomatoes.com",
  "variety.com",
  "hollywoodreporter.com",
  "ew.com",
  "people.com",
  // Tech
  "theverge.com",
  "techcrunch.com",
  "wired.com",
  // General news
  "bbc.com",
  "cnn.com",
  "nbcnews.com",
  "usatoday.com",
];

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

    const res = await fetchWithTimeout("https://google.serper.dev/videos", {
      method: "POST",
      headers: { "X-API-KEY": key, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }, 8000);
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
// FIRECRAWL — Targeted extraction from free-use sites
// ============================================
async function firecrawlGoogleImages(query: string, count: number): Promise<MediaResult[]> {
  const key = process.env.FIRECRAWL_API_KEY;
  if (!key) {
    console.log("[firecrawl-images] No FIRECRAWL_API_KEY configured, skipping");
    return [];
  }
  try {
    console.log(`[firecrawl-images] Searching: "${query}" (limit: ${count + 5})`);

    const res = await fetchWithTimeout("https://api.firecrawl.dev/v1/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        query: `${query} high resolution photo -shutterstock -gettyimages -istockphoto -adobe.stock -depositphotos -reuters -collage -montage`,
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
    }, 12000);

    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      console.error(`[firecrawl-images] API error ${res.status}: ${errBody.slice(0, 500)}`);
      if (res.status === 402) console.error("[firecrawl-images] ⚠️ CREDITS EXHAUSTED");
      if (res.status === 401) console.error("[firecrawl-images] ⚠️ INVALID API KEY");
      if (res.status === 429) console.error("[firecrawl-images] ⚠️ RATE LIMITED");
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

/** Firecrawl — targeted extraction from specific free-use editorial sites */
async function firecrawlEditorialImages(query: string, count: number): Promise<MediaResult[]> {
  const key = process.env.FIRECRAWL_API_KEY;
  if (!key) return [];
  try {
    console.log(`[firecrawl-editorial] Searching: "${query}" on editorial sites`);

    const res = await fetchWithTimeout("https://api.firecrawl.dev/v1/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        query: `${query} site:commons.wikimedia.org OR site:flickr.com OR site:apnews.com photo`,
        limit: count + 3,
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
                      url: { type: "string", description: "Direct URL to image file" },
                      alt: { type: "string", description: "Caption or alt text" },
                      credit: { type: "string", description: "Photographer credit" },
                    },
                    required: ["url"],
                  },
                },
              },
              required: ["images"],
            },
            prompt: "Extract all photograph URLs from this page. Look for the highest resolution version of each image. Include img src URLs ending in .jpg, .jpeg, .png, .webp. Skip icons, logos, and UI elements.",
          },
        },
      }),
    }, 12000);

    if (!res.ok) return [];
    const data = await res.json();
    const results: MediaResult[] = [];

    for (const result of data.data || []) {
      const pageUrl = result.url || "";
      const pageTitle = result.title || "";
      for (const img of result.extract?.images || []) {
        if (img.url?.startsWith("http") && isValidImageUrl(img.url) && !isBlockedDomain(img.url)) {
          results.push({
            id: `fc-ed-${results.length}-${Date.now()}`,
            type: "image",
            thumbnail: img.url,
            preview_url: img.url,
            full_url: img.url,
            source: "Firecrawl Editorial",
            author: img.credit || getDomainName(pageUrl),
            width: 1200, height: 800,
            title: img.alt || pageTitle.slice(0, 80),
            page_url: pageUrl,
          });
        }
        if (results.length >= count) break;
      }
      if (results.length >= count) break;
    }

    console.log(`[firecrawl-editorial] "${query}" → ${results.length} editorial images`);
    return results;
  } catch (err) {
    console.error("[firecrawl-editorial] Error:", err instanceof Error ? err.message : err);
    return [];
  }
}

// ============================================
// FIRECRAWL — Google Video Search
// ============================================
async function firecrawlGoogleVideos(query: string, count: number): Promise<MediaResult[]> {
  const key = process.env.FIRECRAWL_API_KEY;
  if (!key) return [];
  try {
    const res = await fetchWithTimeout("https://api.firecrawl.dev/v1/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        query: `${query} video footage`,
        limit: count + 3,
      }),
    }, 12000);

    if (!res.ok) return [];
    const data = await res.json();
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
      }
      if (results.length >= count) break;
    }

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

/** Auto-detect content category from query for licensed providers (Imago) */
function detectContentCategory(query: string): string {
  const q = query.toLowerCase();
  if (/\b(nfl|nba|mlb|nhl|soccer|football|basketball|baseball|hockey|tennis|golf|athlete|draft|pro day|playoff|championship|olympics|world cup|ufc|boxing|wrestling)\b/.test(q))
    return "sport";
  if (/\b(movie|film|actor|actress|oscar|emmy|grammy|celebrity|star|premiere|hollywood|netflix|disney|marvel|dc|series|tv show|streaming|award)\b/.test(q))
    return "entertainment";
  if (/\b(election|president|congress|senate|politics|democrat|republican|vote|government|policy|white house|supreme court|legislation)\b/.test(q))
    return "news";
  if (/\b(tech|apple|google|microsoft|ai|artificial intelligence|startup|silicon valley|iphone|android|software|gadget|robot|crypto|blockchain)\b/.test(q))
    return "news";
  if (/\b(fashion|style|beauty|model|runway|designer|luxury|vogue|trend)\b/.test(q))
    return "creative";
  if (/\b(food|recipe|restaurant|chef|cooking|cuisine|dining)\b/.test(q))
    return "creative";
  if (/\b(music|concert|tour|album|singer|rapper|band|festival|grammy)\b/.test(q))
    return "entertainment";
  // Default — general editorial
  return "news";
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
  /** Include licensed providers (Imago/Imagn) — requires credentials in env */
  includeLicensed?: boolean;
  /** Include free providers (Wikimedia, Pexels, Unsplash, Pixabay, Flickr) */
  includeFree?: boolean;
  /** Category for licensed providers (e.g. "sport", "entertainment", "news", "creative") */
  licensedCategory?: string;
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
    imageCount = 15,
    videoCount = 5,
    contentAge = "any",
    includeVideos = false,
    includeLicensed = true,
    includeFree = true,
    licensedCategory,
  } = options;

  // Auto-detect category for licensed providers if not specified
  const detectedCategory = licensedCategory || detectContentCategory(imageQuery);

  const hasSerper = !!process.env.SERPER_API_KEY;
  const hasFirecrawl = !!process.env.FIRECRAWL_API_KEY;
  const hasImago = !!(process.env.IMAGO_EMAIL && process.env.IMAGO_PASSWORD);
  const hasImagn = !!(process.env.IMAGN_EMAIL && process.env.IMAGN_PASSWORD);
  const hasAnyFree = !!(
    process.env.PEXELS_API_KEY ||
    process.env.UNSPLASH_ACCESS_KEY ||
    process.env.PIXABAY_API_KEY ||
    process.env.FLICKR_API_KEY ||
    true // Wikimedia always works (no key needed)
  );

  if (!hasSerper && !hasFirecrawl && !hasImago && !hasImagn && !hasAnyFree) {
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

  // ── Tier 1: Licensed providers (5 each) ──
  if (includeLicensed) {
    if (hasImago) {
      imageSearches.push(
        searchImago({ query: imageQuery, category: detectedCategory, count: 5 })
          .then((results) => results.map((r) => ({
            id: r.id, type: "image" as const,
            thumbnail: r.thumbnail, preview_url: r.preview_url, full_url: r.full_url,
            source: "Imago", author: r.photographer,
            width: r.width, height: r.height, title: r.caption,
          })))
          .catch(() => [] as MediaResult[])
      );
      sources.push("Imago");
    }
    if (hasImagn) {
      imageSearches.push(
        searchImagn({ query: imageQuery, count: 5 })
          .then((results) => results.map((r) => ({
            id: r.id, type: "image" as const,
            thumbnail: r.thumbnail, preview_url: r.preview_url, full_url: r.full_url,
            source: "Imagn", author: r.photographer,
            width: r.width, height: r.height, title: r.caption,
          })))
          .catch(() => [] as MediaResult[])
      );
      sources.push("Imagn");
    }
  }

  // ── Tier 2: Google via Serper (5 total) ──
  if (hasSerper) {
    imageSearches.push(serperImages(imageQuery, 5, contentAge));
    imageSearches.push(serperCCImages(imageQuery, 5));
    sources.push("Google", "Google CC");

    if (includeVideos && videoQuery) {
      videoSearches.push(serperVideos(videoQuery, 6, contentAge));
    }
  }

  // ── Tier 3: Pexels (3 images) ──
  if (includeFree) {
    imageSearches.push(
      searchFreeImages({ query: imageQuery, count: 3, perProvider: 3, providers: ["pexels"] })
        .then((results) => results.map(freeToMedia))
        .catch(() => [] as MediaResult[])
    );
    sources.push("Pexels");
  }

  // ── Tier 4: Firecrawl deep extraction (5) ──
  if (hasFirecrawl) {
    imageSearches.push(firecrawlGoogleImages(imageQuery, 5));
    sources.push("Firecrawl");

    if (includeVideos && videoQuery) {
      videoSearches.push(firecrawlGoogleVideos(videoQuery, 4));
    }
  }

  const [imageResults, videoResults] = await Promise.all([
    Promise.all(imageSearches).then((r) => r.flat()),
    includeVideos ? Promise.all(videoSearches).then((r) => r.flat()) : Promise.resolve([]),
  ]);

  // Log raw results by source
  const rawCounts = imageResults.reduce((acc, r) => {
    acc[r.source] = (acc[r.source] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  console.log(`[media-search] Query: "${imageQuery}"`);
  console.log(`[media-search] Raw: ${imageResults.length} images, ${videoResults.length} videos`);
  console.log(`[media-search] By source: ${Object.entries(rawCounts).map(([s, c]) => `${s}: ${c}`).join(", ")}`);

  // Deduplicate and score
  type ScoredResult = MediaResult & { _score: number };
  const dedupedImages: ScoredResult[] = deduplicateResults(imageResults)
    .map((r) => ({ ...r, _score: scoreResult(r) }))
    .filter((r) => r._score > -500)
    .sort((a, b) => b._score - a._score);

  // ── Balanced selection: 5 per major source, 2 per free provider ──
  const SOURCE_LIMITS: Record<string, number> = {
    Imago: 5, Imagn: 5, Google: 5, "Google CC": 5,
    Firecrawl: 5, "Firecrawl Editorial": 5, "Google (Free Sites)": 5,
    Pexels: 3,
  };

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
    for (const pick of sourceGroups[source].slice(0, limit)) {
      if (!usedIds.has(pick.id)) {
        selected.push(pick);
        usedIds.add(pick.id);
      }
    }
  }

  // Round 2: Fill remaining slots with best unused
  if (selected.length < imageCount) {
    for (const r of dedupedImages) {
      if (selected.length >= imageCount) break;
      if (!usedIds.has(r.id)) {
        selected.push(r);
        usedIds.add(r.id);
      }
    }
  }

  selected.sort((a, b) => b._score - a._score);
  const uniqueImages = selected
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

  // Log final balanced counts
  const finalCounts = uniqueImages.reduce((acc, r) => {
    acc[r.source] = (acc[r.source] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  console.log(`[media-search] Final: ${uniqueImages.length} images balanced (${
    Object.entries(finalCounts).map(([s, c]) => `${c} ${s}`).join(", ")}), ${uniqueVideos.length} videos`);

  return { images: uniqueImages, videos: uniqueVideos, sources, is_demo: false };
}
