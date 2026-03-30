// src/app/api/media-sourcing/search/route.ts
// Media search for MSN articles
// Sources: Google Images via Serper (primary) + Google Images via Firecrawl (supplementary)
import { NextRequest, NextResponse } from "next/server";
import { isBlockedDomain, deduplicateResults } from "@/lib/search-optimizer";

type MediaResult = {
  id: string;
  type: "image";
  thumbnail: string;
  preview_url: string;
  full_url: string;
  source: string;
  author: string;
  width: number;
  height: number;
  title?: string;
  page_url?: string;
};

// ============================================
// SERPER — Google Images (HD)
// ============================================
async function googleImages(query: string, count: number, minWidth = 800): Promise<MediaResult[]> {
  const key = process.env.SERPER_API_KEY;
  if (!key) return [];
  try {
    const res = await fetch("https://google.serper.dev/images", {
      method: "POST",
      headers: { "X-API-KEY": key, "Content-Type": "application/json" },
      body: JSON.stringify({ q: query, num: Math.min(count * 3, 40) }),
    });
    if (!res.ok) return [];
    const data = await res.json();
    const results: MediaResult[] = [];
    for (const img of data.images || []) {
      if (img.imageUrl && img.imageWidth >= minWidth && !isBlockedDomain(img.imageUrl)) {
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
// FIRECRAWL — Google Image Search (deeper extraction, different results)
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
            prompt: "Extract all high-quality photograph URLs from this page. Get img src attributes with file extensions .jpg, .jpeg, .png, .webp. Only include actual photographs — ignore icons, logos, avatars, ads, and UI elements. Prefer the largest/highest resolution version.",
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
        if (img.url?.startsWith("http") && isValidImageUrl(img.url) && !isBlockedDomain(img.url)) {
          results.push({
            id: `fc-${results.length}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
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
            thumbnail: ogImage, preview_url: ogImage, full_url: ogImage,
            source: "Firecrawl", author: getDomainName(pageUrl),
            width: 1200, height: 800,
            title: pageTitle.slice(0, 80), page_url: pageUrl,
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
        results.push({
          id: `vid-${results.length}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          type: "image",
          thumbnail: vid.thumbnailUrl || vid.imageUrl || "",
          preview_url: vid.link,
          full_url: vid.link,
          source: "Google Video",
          author: vid.channel || vid.source || "Web",
          width: 1920, height: 1080,
          title: vid.title,
          page_url: vid.link,
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

function getDomainName(url: string): string {
  try { return new URL(url).hostname.replace("www.", ""); } catch { return "Web"; }
}

// Demo fallback
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

export async function POST(req: NextRequest) {
  try {
    const { query, video_query, slide_id, mode } = await req.json();
    if (!query) return NextResponse.json({ error: "Query required" }, { status: 400 });

    const isVideoMode = mode === "video";
    const hasSerper = !!process.env.SERPER_API_KEY;
    const hasFirecrawl = !!process.env.FIRECRAWL_API_KEY;

    if (!hasSerper && !hasFirecrawl) {
      return NextResponse.json({ slide_id, images: demoImages(query, 14), videos: [], is_demo: true });
    }

    const imageSearches: Promise<MediaResult[]>[] = [];
    const videoSearches: Promise<MediaResult[]>[] = [];
    const sources: string[] = [];

    // Serper — Google Images (primary, fast)
    if (hasSerper) {
      imageSearches.push(googleImages(`${query} high resolution`, 6, 1200));
      imageSearches.push(googleImages(`${query} editorial photo`, 5, 800));
      imageSearches.push(googleImages(`${query} latest`, 4, 800));
      sources.push("Google");
    }

    // Firecrawl — Google deep extraction (supplementary, different results)
    if (hasFirecrawl) {
      imageSearches.push(firecrawlGoogleImages(query, 6));
      imageSearches.push(firecrawlGoogleImages(`${query} HD photo`, 4));
      sources.push("Firecrawl");
    }

    // Video search (video mode only)
    if (isVideoMode && hasSerper && video_query) {
      videoSearches.push(googleVideos(video_query, 5));
      videoSearches.push(googleVideos(`${video_query} highlights`, 3));
      sources.push("Google Video");
    }

    const [imageResults, videoResults] = await Promise.all([
      Promise.all(imageSearches).then((r) => r.flat()),
      videoSearches.length > 0 ? Promise.all(videoSearches).then((r) => r.flat()) : Promise.resolve([]),
    ]);

    const uniqueImages = deduplicateResults(imageResults).slice(0, 15);
    const uniqueVideos = deduplicateResults(videoResults).slice(0, 8);

    // Sort by resolution — largest first
    uniqueImages.sort((a, b) => (b.width * b.height) - (a.width * a.height));

    console.log(`[media-sourcing/search] "${query}" → ${uniqueImages.length} images (${
      imageResults.filter(r => r.source === "Google").length} Serper, ${
      imageResults.filter(r => r.source === "Firecrawl").length} Firecrawl), ${uniqueVideos.length} videos`);

    return NextResponse.json({ slide_id, images: uniqueImages, videos: uniqueVideos, sources, is_demo: false });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Search failed" }, { status: 500 });
  }
}
