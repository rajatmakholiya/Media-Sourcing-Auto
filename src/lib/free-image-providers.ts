// src/lib/free-image-providers.ts
// Free/no-licensing-issue image providers for all MSN content domains
// (sports, entertainment, pop culture, politics, tech, lifestyle, etc.)
// All APIs run in parallel for maximum speed
// Sources: Wikimedia Commons (best editorial), Pexels, Unsplash, Pixabay, Flickr CC

type FreeImageResult = {
  id: string;
  thumbnail: string;
  preview_url: string;
  full_url: string;
  title: string;
  author: string;
  source: string;
  width: number;
  height: number;
  license: string;
  page_url?: string;
};

/** Fetch with timeout */
function fetchWithTimeout(url: string, options: RequestInit, timeoutMs = 10000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timer));
}

// ============================================
// WIKIMEDIA COMMONS — Best for real editorial photos (no API key needed)
// Covers sports, politics, entertainment, tech, pop culture — all domains
// ============================================
async function wikimediaSearch(query: string, count: number): Promise<FreeImageResult[]> {
  try {
    const params = new URLSearchParams({
      action: "query",
      generator: "search",
      gsrnamespace: "6", // File namespace only
      gsrsearch: `${query} photo`,
      gsrlimit: String(Math.min(count * 2, 50)),
      prop: "imageinfo",
      iiprop: "url|size|user|extmetadata",
      iiurlwidth: "1280",
      format: "json",
      origin: "*",
    });

    const res = await fetchWithTimeout(
      `https://commons.wikimedia.org/w/api.php?${params.toString()}`,
      {
        headers: {
          "User-Agent": "MSNVideoAutomation/1.0 (media-sourcing-tool; contact@example.com)",
        },
      },
      10000
    );
    if (!res.ok) return [];
    const data = await res.json();

    const pages = data.query?.pages || {};
    const results: FreeImageResult[] = [];

    for (const page of Object.values(pages) as any[]) {
      const info = page.imageinfo?.[0];
      if (!info || !info.url) continue;
      // Skip SVGs, PDFs, and small images
      if (info.url.match(/\.(svg|pdf|ogg|webm|ogv)$/i)) continue;
      if (info.width < 600 || info.height < 400) continue;

      const ext = info.extmetadata || {};
      const license = ext.LicenseShortName?.value || ext.License?.value || "CC";
      const artist = ext.Artist?.value?.replace(/<[^>]+>/g, "").trim() || info.user || "Wikimedia";
      const description = ext.ImageDescription?.value?.replace(/<[^>]+>/g, "").trim() || page.title?.replace("File:", "") || "";

      results.push({
        id: `wiki-${page.pageid}`,
        thumbnail: info.thumburl || info.url,
        preview_url: info.thumburl || info.url,
        full_url: info.url,
        title: description.slice(0, 120),
        author: artist.slice(0, 80),
        source: "Wikimedia",
        width: info.width,
        height: info.height,
        license,
        page_url: info.descriptionurl,
      });
      if (results.length >= count) break;
    }

    console.log(`[wikimedia] "${query}" → ${results.length} images`);
    return results;
  } catch (err) {
    console.error("[wikimedia] Error:", err instanceof Error ? err.message : err);
    return [];
  }
}

// ============================================
// PEXELS — Free stock photos (no attribution required)
// ============================================
async function pexelsSearch(query: string, count: number): Promise<FreeImageResult[]> {
  const key = process.env.PEXELS_API_KEY;
  if (!key) return [];
  try {
    const params = new URLSearchParams({
      query,
      per_page: String(Math.min(count, 40)),
      orientation: "landscape",
    });

    const res = await fetchWithTimeout(
      `https://api.pexels.com/v1/search?${params.toString()}`,
      {
        headers: { Authorization: key },
      },
      8000
    );
    if (!res.ok) return [];
    const data = await res.json();

    const results: FreeImageResult[] = [];
    for (const photo of data.photos || []) {
      if (!photo.src?.large2x) continue;
      results.push({
        id: `pexels-${photo.id}`,
        thumbnail: photo.src.medium || photo.src.small,
        preview_url: photo.src.large2x,
        full_url: photo.src.original,
        title: photo.alt || query,
        author: photo.photographer || "Pexels",
        source: "Pexels",
        width: photo.width,
        height: photo.height,
        license: "Pexels License (free, no attribution)",
        page_url: photo.url,
      });
      if (results.length >= count) break;
    }

    console.log(`[pexels] "${query}" → ${results.length} images`);
    return results;
  } catch (err) {
    console.error("[pexels] Error:", err instanceof Error ? err.message : err);
    return [];
  }
}

// ============================================
// UNSPLASH — High-quality free photos
// ============================================
async function unsplashSearch(query: string, count: number): Promise<FreeImageResult[]> {
  const key = process.env.UNSPLASH_ACCESS_KEY;
  if (!key) return [];
  try {
    const params = new URLSearchParams({
      query,
      per_page: String(Math.min(count, 30)),
      orientation: "landscape",
    });

    const res = await fetchWithTimeout(
      `https://api.unsplash.com/search/photos?${params.toString()}`,
      {
        headers: { Authorization: `Client-ID ${key}` },
      },
      8000
    );
    if (!res.ok) return [];
    const data = await res.json();

    const results: FreeImageResult[] = [];
    for (const photo of data.results || []) {
      if (!photo.urls?.regular) continue;
      results.push({
        id: `unsplash-${photo.id}`,
        thumbnail: photo.urls.small || photo.urls.thumb,
        preview_url: photo.urls.regular,
        full_url: photo.urls.full || photo.urls.raw,
        title: photo.description || photo.alt_description || query,
        author: photo.user?.name || "Unsplash",
        source: "Unsplash",
        width: photo.width,
        height: photo.height,
        license: "Unsplash License (free, no attribution required)",
        page_url: photo.links?.html,
      });
      if (results.length >= count) break;
    }

    console.log(`[unsplash] "${query}" → ${results.length} images`);
    return results;
  } catch (err) {
    console.error("[unsplash] Error:", err instanceof Error ? err.message : err);
    return [];
  }
}

// ============================================
// PIXABAY — Free stock (generous rate limits)
// ============================================
async function pixabaySearch(query: string, count: number): Promise<FreeImageResult[]> {
  const key = process.env.PIXABAY_API_KEY;
  if (!key) return [];
  try {
    const params = new URLSearchParams({
      key,
      q: query,
      image_type: "photo",
      orientation: "horizontal",
      per_page: String(Math.min(count, 40)),
      safesearch: "true",
      order: "popular",
    });

    const res = await fetchWithTimeout(
      `https://pixabay.com/api/?${params.toString()}`,
      {},
      8000
    );
    if (!res.ok) return [];
    const data = await res.json();

    const results: FreeImageResult[] = [];
    for (const hit of data.hits || []) {
      // largeImageURL is always available (1280px), fullHDURL may need approved key
      const fullUrl = hit.fullHDURL || hit.largeImageURL;
      if (!fullUrl) continue;

      results.push({
        id: `pixabay-${hit.id}`,
        thumbnail: hit.previewURL,
        preview_url: hit.webformatURL,
        full_url: fullUrl,
        title: hit.tags || query,
        author: hit.user || "Pixabay",
        source: "Pixabay",
        width: hit.imageWidth || 1280,
        height: hit.imageHeight || 720,
        license: "Pixabay Content License (free, no attribution)",
        page_url: hit.pageURL,
      });
      if (results.length >= count) break;
    }

    console.log(`[pixabay] "${query}" → ${results.length} images`);
    return results;
  } catch (err) {
    console.error("[pixabay] Error:", err instanceof Error ? err.message : err);
    return [];
  }
}

// ============================================
// FLICKR — Creative Commons editorial photos (sports, entertainment, news, etc.)
// ============================================
async function flickrSearch(query: string, count: number): Promise<FreeImageResult[]> {
  const key = process.env.FLICKR_API_KEY;
  if (!key) return [];
  try {
    const params = new URLSearchParams({
      method: "flickr.photos.search",
      api_key: key,
      text: query,
      license: "4,5,6,7,8,9,10", // All CC + public domain
      extras: "url_l,url_o,url_z,url_c,url_b,owner_name,license,description",
      per_page: String(Math.min(count * 2, 40)),
      format: "json",
      nojsoncallback: "1",
      content_type: "1", // Photos only
      sort: "relevance",
      safe_search: "1",
    });

    const res = await fetchWithTimeout(
      `https://www.flickr.com/services/rest/?${params.toString()}`,
      {},
      8000
    );
    if (!res.ok) return [];
    const data = await res.json();

    const licenseNames: Record<string, string> = {
      "4": "CC BY 2.0",
      "5": "CC BY-SA 2.0",
      "6": "CC BY-ND 2.0",
      "7": "No known copyright",
      "8": "US Government Work",
      "9": "CC0 Public Domain",
      "10": "Public Domain Mark",
    };

    const results: FreeImageResult[] = [];
    for (const photo of data.photos?.photo || []) {
      // Prefer largest available: url_o > url_l > url_b > url_c > url_z
      const fullUrl = photo.url_o || photo.url_l || photo.url_b || photo.url_c || photo.url_z;
      if (!fullUrl) continue;

      const thumbnail = photo.url_z || photo.url_c || fullUrl;
      const width = photo.width_o || photo.width_l || photo.width_b || photo.width_c || photo.width_z || 1024;
      const height = photo.height_o || photo.height_l || photo.height_b || photo.height_c || photo.height_z || 768;

      // Skip small images
      if (width < 600) continue;

      results.push({
        id: `flickr-${photo.id}`,
        thumbnail,
        preview_url: photo.url_l || photo.url_b || fullUrl,
        full_url: fullUrl,
        title: photo.title || query,
        author: photo.ownername || "Flickr",
        source: "Flickr",
        width,
        height,
        license: licenseNames[photo.license] || `CC License ${photo.license}`,
        page_url: `https://www.flickr.com/photos/${photo.owner}/${photo.id}`,
      });
      if (results.length >= count) break;
    }

    console.log(`[flickr] "${query}" → ${results.length} CC images`);
    return results;
  } catch (err) {
    console.error("[flickr] Error:", err instanceof Error ? err.message : err);
    return [];
  }
}

// ============================================
// PUBLIC API — search all free providers in parallel
// ============================================

export type FreeSearchOptions = {
  query: string;
  count?: number;
  /** Max results per individual provider (e.g. 2 for free sites). Defaults to auto-calculated. */
  perProvider?: number;
  /** Which providers to include. Defaults to all configured. */
  providers?: ("wikimedia" | "pexels" | "unsplash" | "pixabay" | "flickr")[];
};

export type { FreeImageResult };

export async function searchFreeImages(options: FreeSearchOptions): Promise<FreeImageResult[]> {
  const { query, count = 8, providers } = options;

  const searches: Promise<FreeImageResult[]>[] = [];
  const perProvider = options.perProvider ?? Math.ceil(count / 3);

  // Wikimedia — always enabled (no API key needed), best for editorial (all domains)
  if (!providers || providers.includes("wikimedia")) {
    searches.push(wikimediaSearch(query, perProvider + 2));
  }

  // Pexels
  if ((!providers || providers.includes("pexels")) && process.env.PEXELS_API_KEY) {
    searches.push(pexelsSearch(query, perProvider));
  }

  // Unsplash
  if ((!providers || providers.includes("unsplash")) && process.env.UNSPLASH_ACCESS_KEY) {
    searches.push(unsplashSearch(query, perProvider));
  }

  // Pixabay
  if ((!providers || providers.includes("pixabay")) && process.env.PIXABAY_API_KEY) {
    searches.push(pixabaySearch(query, perProvider));
  }

  // Flickr CC
  if ((!providers || providers.includes("flickr")) && process.env.FLICKR_API_KEY) {
    searches.push(flickrSearch(query, perProvider));
  }

  if (searches.length === 0) {
    // Wikimedia is always available as fallback (no key needed)
    searches.push(wikimediaSearch(query, count));
  }

  const allResults = await Promise.all(searches);
  const flat = allResults.flat();

  // Deduplicate by URL
  const seen = new Set<string>();
  const unique = flat.filter((r) => {
    const key = r.full_url.replace(/^https?:\/\//, "").replace(/[?#].*$/, "").toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  console.log(`[free-providers] "${query}" → ${unique.length} total (${flat.length} raw from ${searches.length} providers)`);
  return unique.slice(0, count);
}
