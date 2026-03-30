// src/app/api/media-sourcing/search/route.ts
// Media search for MSN Slideshow articles
// Priority: Imagn/Imago (8-10 images) + Google (4-5 images)
// Images only — no video for slideshows
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
  page_url?: string; // link back to the source page
};

// ============================================
// SERPER — Google Images
// ============================================
async function googleImages(query: string, count: number): Promise<MediaResult[]> {
  const key = process.env.SERPER_API_KEY;
  if (!key) return [];
  try {
    const res = await fetch("https://google.serper.dev/images", {
      method: "POST",
      headers: { "X-API-KEY": key, "Content-Type": "application/json" },
      body: JSON.stringify({ q: `${query} imagesize:large`, num: count * 3 }),
    });
    if (!res.ok) return [];
    const data = await res.json();
    const results: MediaResult[] = [];
    for (const img of data.images || []) {
      if (img.imageUrl && img.imageWidth >= 800 && !isBlockedDomain(img.imageUrl)) {
        results.push({
          id: `google-${results.length}-${Date.now()}`,
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
// FIRECRAWL — Imagn search
// ============================================
async function imagnImages(query: string, count: number): Promise<MediaResult[]> {
  const key = process.env.FIRECRAWL_API_KEY;
  if (!key) return [];
  try {
    const res = await fetch("https://api.firecrawl.dev/v1/search", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        query: `site:imagn.com ${query}`,
        limit: count + 5,
        scrapeOptions: {
          formats: ["extract"],
          extract: {
            schema: {
              type: "object",
              properties: {
                page_images: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      image_url: { type: "string" },
                      thumbnail_url: { type: "string" },
                      title: { type: "string" },
                      photographer: { type: "string" },
                    },
                    required: ["image_url"],
                  },
                },
              },
              required: ["page_images"],
            },
            prompt: "Extract all editorial photo image URLs from this Imagn page. Get the highest resolution img src URLs (.jpg, .jpeg, .png, .webp). Ignore icons, logos, and navigation images.",
          },
        },
      }),
    });
    if (!res.ok) return [];
    const data = await res.json();
    const results: MediaResult[] = [];

    for (const result of data.data || []) {
      const pageTitle = result.title || "";
      const pageUrl = result.url || "";

      for (const img of result.extract?.page_images || []) {
        if (img.image_url?.startsWith("http") && isValidImage(img.image_url)) {
          results.push({
            id: `imagn-${results.length}-${Date.now()}`,
            type: "image",
            thumbnail: img.thumbnail_url || img.image_url,
            preview_url: img.image_url,
            full_url: img.image_url,
            source: "Imagn",
            author: img.photographer || "Imagn",
            width: 1200, height: 800,
            title: img.title || pageTitle.slice(0, 80),
            page_url: pageUrl,
          });
        }
        if (results.length >= count) break;
      }

      // og:image fallback
      const ogImage = result.metadata?.ogImage || result.metadata?.["og:image"];
      if (ogImage?.startsWith("http") && isValidImage(ogImage) && !results.some((r) => r.full_url === ogImage)) {
        results.push({
          id: `imagn-og-${results.length}-${Date.now()}`,
          type: "image", thumbnail: ogImage, preview_url: ogImage, full_url: ogImage,
          source: "Imagn", author: "Imagn", width: 1200, height: 800,
          title: pageTitle.slice(0, 80), page_url: pageUrl,
        });
      }
      if (results.length >= count) break;
    }

    console.log(`[imagn] Found ${results.length} images for "${query}"`);
    return results.slice(0, count);
  } catch (err) {
    console.error("[imagn]", err);
    return [];
  }
}

// ============================================
// FIRECRAWL — Imago search
// ============================================
async function imagoImages(query: string, count: number): Promise<MediaResult[]> {
  const key = process.env.FIRECRAWL_API_KEY;
  if (!key) return [];
  try {
    const res = await fetch("https://api.firecrawl.dev/v1/search", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        query: `site:imago-images.com ${query}`,
        limit: count + 5,
        scrapeOptions: {
          formats: ["extract"],
          extract: {
            schema: {
              type: "object",
              properties: {
                page_images: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      image_url: { type: "string" },
                      thumbnail_url: { type: "string" },
                      title: { type: "string" },
                      photographer: { type: "string" },
                    },
                    required: ["image_url"],
                  },
                },
              },
              required: ["page_images"],
            },
            prompt: "Extract editorial photo image URLs from this Imago Images page. Get img src URLs for actual photographs, not icons or UI elements.",
          },
        },
      }),
    });
    if (!res.ok) return [];
    const data = await res.json();
    const results: MediaResult[] = [];

    for (const result of data.data || []) {
      const pageTitle = result.title || "";
      const pageUrl = result.url || "";

      for (const img of result.extract?.page_images || []) {
        if (img.image_url?.startsWith("http") && isValidImage(img.image_url)) {
          results.push({
            id: `imago-${results.length}-${Date.now()}`,
            type: "image", thumbnail: img.thumbnail_url || img.image_url,
            preview_url: img.image_url, full_url: img.image_url,
            source: "Imago", author: img.photographer || "Imago",
            width: 1200, height: 800,
            title: img.title || pageTitle.slice(0, 80), page_url: pageUrl,
          });
        }
        if (results.length >= count) break;
      }

      const ogImage = result.metadata?.ogImage || result.metadata?.["og:image"];
      if (ogImage?.startsWith("http") && isValidImage(ogImage) && !results.some((r) => r.full_url === ogImage)) {
        results.push({
          id: `imago-og-${results.length}-${Date.now()}`,
          type: "image", thumbnail: ogImage, preview_url: ogImage, full_url: ogImage,
          source: "Imago", author: "Imago", width: 1200, height: 800,
          title: pageTitle.slice(0, 80), page_url: pageUrl,
        });
      }
      if (results.length >= count) break;
    }

    console.log(`[imago] Found ${results.length} images for "${query}"`);
    return results.slice(0, count);
  } catch (err) {
    console.error("[imago]", err);
    return [];
  }
}

function isValidImage(url: string): boolean {
  const lower = url.toLowerCase();
  if (lower.includes("icon") || lower.includes("logo") || lower.includes("favicon") || lower.includes("sprite")) return false;
  return /\.(jpg|jpeg|png|webp|gif)(\?.*)?$/i.test(lower) ||
    lower.includes("/image") || lower.includes("/photo") || lower.includes("cdn") || lower.includes("media");
}

// Demo
function demoImages(query: string, count: number): MediaResult[] {
  const seed = query.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  return Array.from({ length: count }).map((_, i) => ({
    id: `demo-${seed}-${i}`, type: "image" as const,
    thumbnail: `https://picsum.photos/seed/${seed + i}/400/300`,
    preview_url: `https://picsum.photos/seed/${seed + i}/800/600`,
    full_url: `https://picsum.photos/seed/${seed + i}/1920/1080`,
    source: i < 6 ? "Imagn" : i < 9 ? "Imago" : "Google",
    author: "Demo", width: 1920, height: 1080,
  }));
}

// ============================================
// SERPER — Google Videos (for video mode)
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
          id: `google-vid-${results.length}-${Date.now()}`,
          type: "image", // keep type as image for unified handling in UI
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

    // Imagn/Imago first (priority) — 5 each
    if (hasFirecrawl) {
      imageSearches.push(imagnImages(query, 5));
      imageSearches.push(imagoImages(query, 5));
      sources.push("Imagn", "Imago");
    }

    // Google Images — 5
    if (hasSerper) {
      imageSearches.push(googleImages(query, 5));
      imageSearches.push(googleImages(`${query} latest`, 3));
      sources.push("Google");
    }

    // Video search (only in video mode)
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

    // Sort: Imagn first, then Imago, then Google
    const sourceOrder: Record<string, number> = { Imagn: 0, Imago: 1, Google: 2, "Google Video": 3, Demo: 4 };
    uniqueImages.sort((a, b) => (sourceOrder[a.source] ?? 9) - (sourceOrder[b.source] ?? 9));

    return NextResponse.json({ slide_id, images: uniqueImages, videos: uniqueVideos, sources, is_demo: false });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Search failed" }, { status: 500 });
  }
}