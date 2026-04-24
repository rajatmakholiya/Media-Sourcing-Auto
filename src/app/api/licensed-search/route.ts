// src/app/api/licensed-search/route.ts
// API route for searching licensed image providers (Imago + Imagn)
// Supports individual provider search, combined search, and session status check
// GET  → returns login/session status for each provider
// POST → performs search

import { NextRequest, NextResponse } from "next/server";
import { searchImago, type ImagoSearchOptions } from "@/lib/imago-provider";
import { searchImagn, type ImagnSearchOptions } from "@/lib/imagn-provider";

// Providers are now pure HTTP — no browser, no login — so a short budget
// is fine. The tier-1 direct scrape + tier-2 Serper fallback complete in ~1-2s.
export const maxDuration = 15;

/** Auto-detect content category from query */
function detectCategory(query: string): string {
  const q = query.toLowerCase();
  if (/\b(nfl|nba|mlb|nhl|soccer|football|basketball|baseball|hockey|tennis|golf|athlete|draft|playoff|olympics|ufc)\b/.test(q)) return "sport";
  if (/\b(movie|film|actor|actress|oscar|emmy|celebrity|premiere|hollywood|netflix|disney|marvel|series|tv show|award|concert|singer|rapper|band)\b/.test(q)) return "entertainment";
  if (/\b(fashion|beauty|model|runway|designer|luxury)\b/.test(q)) return "creative";
  return "news";
}

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
};

/** Convert Imago/Imagn results to the standard MediaResult format */
function toMediaResult(
  item: { id: string; thumbnail: string; preview_url: string; full_url: string; caption: string; photographer: string; width: number; height: number },
  source: "Imago" | "Imagn"
): MediaResult {
  return {
    id: item.id,
    type: "image",
    thumbnail: item.thumbnail,
    preview_url: item.preview_url,
    full_url: item.full_url,
    source,
    author: item.photographer,
    width: item.width,
    height: item.height,
    title: item.caption,
  };
}

/** GET — Provider status. Both are public-scrape providers now, so always ready. */
export async function GET() {
  return NextResponse.json({
    imago: { configured: true, logged_in: true },
    imagn: { configured: true, logged_in: true },
  });
}

/** POST — Search */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      query,
      providers = ["imago", "imagn"],
      category,
      dateFrom,
      sortBy,
      orientation,
      count = 30,
      imagn_categories,
    } = body;

    if (!query) {
      return NextResponse.json({ error: "Query is required" }, { status: 400 });
    }

    const searches: Promise<MediaResult[]>[] = [];
    const sources: string[] = [];

    // Imago search — no credentials needed (public scrape + Serper fallback)
    if (providers.includes("imago")) {
      const imagoOpts: ImagoSearchOptions = {
        query,
        category: category || detectCategory(query),
        dateFrom,
        sortBy: sortBy || "popular",
        orientation,
        count: Math.ceil(count / providers.length),
      };
      searches.push(
        searchImago(imagoOpts)
          .then((results) => results.map((r) => toMediaResult(r, "Imago")))
          .catch((err) => {
            console.error("[licensed-search] Imago error:", err instanceof Error ? err.message : err);
            return [] as MediaResult[];
          })
      );
      sources.push("Imago");
    }

    // Imagn search — no credentials needed (public scrape of simpleSearchAjax)
    if (providers.includes("imagn")) {
      const imagnOpts: ImagnSearchOptions = {
        query,
        categories: imagn_categories,
        count: Math.ceil(count / providers.length),
      };
      searches.push(
        searchImagn(imagnOpts)
          .then((results) => results.map((r) => toMediaResult(r, "Imagn")))
          .catch((err) => {
            console.error("[licensed-search] Imagn error:", err instanceof Error ? err.message : err);
            return [] as MediaResult[];
          })
      );
      sources.push("Imagn");
    }

    if (searches.length === 0) {
      return NextResponse.json(
        { error: "No providers selected", images: [], sources: [] },
        { status: 200 }
      );
    }

    const allResults = await Promise.all(searches);
    const images = allResults.flat();

    console.log(`[licensed-search] "${query}" → ${images.length} images from ${sources.join(", ")}`);

    return NextResponse.json({
      query,
      images,
      sources,
      total: images.length,
    });
  } catch (err) {
    console.error("[licensed-search] Error:", err instanceof Error ? err.message : err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Search failed" },
      { status: 500 }
    );
  }
}
