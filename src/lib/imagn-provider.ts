// src/lib/imagn-provider.ts
// Imagn (USA TODAY Sports) image search — pure HTTP, no Playwright, no login.
//
// Imagn exposes a simple AJAX endpoint that returns an HTML fragment:
//   GET https://imagn.com/simpleSearchAjax/?searchtxt=<q>&searchCGOnly=<catIds>
// We fetch that directly and regex-extract image URLs, captions and links.
// This is ~40x faster than driving a headless browser through the login flow
// (which kept failing anyway — the logs showed 22–32s requests returning 1–2
// images). Imagn's search page and its CDN (usatsi*) are publicly readable,
// so no authentication is required to get preview images.

export type ImagnSearchOptions = {
  query: string;
  categories?: string;
  count?: number;
};

export type ImagnResult = {
  id: string;
  thumbnail: string;
  preview_url: string;
  full_url: string;
  caption: string;
  photographer: string;
  date_created: string;
  width: number;
  height: number;
  collection?: string;
  page_url?: string;
};

// Default sport category IDs from the Imagn search interface
const DEFAULT_CATEGORIES = "44,45,328,129,180,164,127,143,300,192,306,312";

// ─── In-memory response cache ───────────────────────────────
// Identical queries within 60s reuse the prior response — important because
// the same segment gets re-searched when the user tweaks other sources.
const CACHE_TTL_MS = 60_000;
type CacheEntry = { ts: number; results: ImagnResult[] };
const cache = new Map<string, CacheEntry>();

function getCached(key: string): ImagnResult[] | null {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.ts > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return hit.results;
}

function setCached(key: string, results: ImagnResult[]): void {
  cache.set(key, { ts: Date.now(), results });
  // Evict oldest entries if cache grows unbounded
  if (cache.size > 200) {
    const oldest = [...cache.entries()].sort((a, b) => a[1].ts - b[1].ts)[0];
    if (oldest) cache.delete(oldest[0]);
  }
}

// ─── HTTP helpers ───────────────────────────────────────────
function browserHeaders(): Record<string, string> {
  return {
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "X-Requested-With": "XMLHttpRequest",
    Referer: "https://imagn.com/",
  };
}

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<string | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers: browserHeaders(), signal: ctrl.signal });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

// ─── HTML parsing — regex-based, no external deps ───────────
// The AJAX fragment is a repeating block per result. We extract <img> tags
// and their surrounding <a> link + caption text. This mirrors what the old
// Playwright-based parseFromString code did, minus the browser overhead.

type RawItem = {
  src: string;
  highRes: string;
  alt: string;
  href: string;
  credit: string;
};

// Imagn and their parent USA TODAY host previews on these CDNs. Anything
// outside this list (header logos, analytics pixels, ad networks) is dropped
// so callers only ever get genuine Imagn-licensed media.
const IMAGN_HOST_ALLOW = /(?:imagn\.com|usatsi\.com|gannett-cdn\.com|usatoday\.com)/i;

function extractItems(html: string): RawItem[] {
  const items: RawItem[] = [];
  const seenSrc = new Set<string>();

  // Iterate over <img ...> tags and climb to the nearest <a> for href context.
  const imgRe = /<img\b([^>]*)>/gi;
  for (const m of html.matchAll(imgRe)) {
    const attrs = m[1];
    const src = getAttr(attrs, "src") || getAttr(attrs, "data-src") || getAttr(attrs, "data-lazy-src");
    if (!src || src.startsWith("data:")) continue;
    if (!/^https?:\/\//i.test(src)) continue;
    if (!IMAGN_HOST_ALLOW.test(src)) continue;
    if (isNoiseUrl(src)) continue;
    if (seenSrc.has(src)) continue;
    seenSrc.add(src);

    const highRes =
      getAttr(attrs, "data-original") ||
      getAttr(attrs, "data-highres") ||
      getAttr(attrs, "data-full") ||
      getAttr(attrs, "data-zoom") ||
      pickFromSrcset(getAttr(attrs, "srcset")) ||
      "";

    const alt = decodeEntities(getAttr(attrs, "alt") || getAttr(attrs, "title") || "");

    // Look for a wrapping <a href="..."> by scanning backwards in the document.
    // This is best-effort — misses are fine because page_url has a fallback.
    const idx = m.index ?? 0;
    const before = html.slice(Math.max(0, idx - 600), idx);
    const hrefMatch = before.match(/<a\b[^>]*href=["']([^"']+)["'][^>]*>[^<]*$/i);
    const href = hrefMatch?.[1] || "";

    // Credit line often appears in a <small> or class*="credit" near the image.
    const after = html.slice(idx, idx + 600);
    const creditMatch =
      after.match(/<(?:small|span|div)[^>]*class=["'][^"']*(?:credit|photographer|byline)[^"']*["'][^>]*>([\s\S]*?)<\//i) ||
      null;
    const credit = creditMatch ? decodeEntities(stripTags(creditMatch[1])) : "";

    items.push({ src, highRes, alt, href, credit });
  }

  return items;
}

function getAttr(attrs: string, name: string): string {
  const re = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i");
  const m = attrs.match(re);
  return (m?.[1] ?? m?.[2] ?? m?.[3] ?? "").trim();
}

function pickFromSrcset(srcset: string): string {
  if (!srcset) return "";
  // Highest-resolution candidate is typically the last entry in a srcset list.
  const parts = srcset.split(",").map((s) => s.trim());
  const last = parts[parts.length - 1] || "";
  return last.split(/\s+/)[0] || "";
}

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, "").trim();
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&nbsp;/g, " ")
    .trim();
}

function isNoiseUrl(url: string): boolean {
  const l = url.toLowerCase();
  return (
    l.includes("logo") ||
    l.includes("/icon") ||
    l.includes("sprite") ||
    l.includes("spacer") ||
    l.includes("blank") ||
    l.includes("placeholder") ||
    l.includes("avatar") ||
    l.endsWith(".svg")
  );
}

// ─── Public search ──────────────────────────────────────────
// Try harvesting image URLs from anything that looks like JSON or JS string
// literals — Imagn's AJAX response sometimes wraps results in JSON with URL
// strings that our <img>-tag regex would miss.
function extractFromJsonBlob(text: string): RawItem[] {
  const items: RawItem[] = [];
  const seen = new Set<string>();
  // Match CDN-shaped URLs anywhere in the text. Imagn hosts on usatsi, imagn,
  // and their staging/mirror hosts.
  const urlRe = /https?:\\?\/\\?\/[^"'\s<>)]+?\.(?:jpg|jpeg|png|webp)(?:\?[^"'\s<>)]*)?/gi;
  const hostAllow = /(?:imagn\.com|usatsi\.com|gannett-cdn\.com|usatoday\.com)/i;
  for (const m of text.matchAll(urlRe)) {
    const url = m[0].replace(/\\\//g, "/"); // unescape JSON-encoded slashes
    if (seen.has(url)) continue;
    if (!hostAllow.test(url)) continue;
    if (isNoiseUrl(url)) continue;
    seen.add(url);
    items.push({ src: url, highRes: url, alt: "", href: "", credit: "" });
  }
  return items;
}

export async function searchImagn(options: ImagnSearchOptions): Promise<ImagnResult[]> {
  const { query, categories = DEFAULT_CATEGORIES, count = 50 } = options;
  const cacheKey = `${query}::${categories}::${count}`;

  const cached = getCached(cacheKey);
  if (cached) {
    console.log(`[imagn] Cache hit for "${query}" → ${cached.length} images`);
    return cached;
  }

  console.log(`[imagn] Searching: "${query}" (count: ${count})`);
  const t0 = Date.now();

  // Try multiple endpoints — Imagn's response shape varies based on the exact
  // request:
  //   (1) AJAX endpoint with NO category filter → broadest search, usually the
  //       most results since our hardcoded category IDs may be stale.
  //   (2) AJAX endpoint WITH the category filter → narrower but keeps sports
  //       relevance when it works.
  //   (3) Full search page → server-side-rendered fallback.
  const ajaxNoCatUrl =
    `https://imagn.com/simpleSearchAjax/?searchtxt=${encodeURIComponent(query)}`;
  const ajaxUrl =
    `https://imagn.com/simpleSearchAjax/?searchtxt=${encodeURIComponent(query)}` +
    `&searchCGOnly=${encodeURIComponent(categories)}`;
  const pageUrl =
    `https://imagn.com/search/?searchtxt=${encodeURIComponent(query)}`;

  const [ajaxNoCatHtml, ajaxHtml, pageHtml] = await Promise.all([
    fetchWithTimeout(ajaxNoCatUrl, 8000),
    fetchWithTimeout(ajaxUrl, 8000),
    fetchWithTimeout(pageUrl, 8000),
  ]);

  const byBody = (body: string | null, label: "ajax-nocat" | "ajax" | "page"): RawItem[] => {
    if (!body) return [];
    // Try <img>-tag extraction first
    const tagItems = extractItems(body);
    if (tagItems.length > 0) {
      console.log(`[imagn] ${label} HTML: parsed ${tagItems.length} <img> tags`);
      return tagItems;
    }
    // Fall back to JSON/JS URL scan — covers JSON responses and inline
    // bootstrap data that our <img>-tag regex would miss.
    const jsonItems = extractFromJsonBlob(body);
    if (jsonItems.length > 0) {
      console.log(`[imagn] ${label} HTML: parsed ${jsonItems.length} URLs from JSON/JS blob`);
      return jsonItems;
    }
    // Nothing parsed — log a preview so we can see what was returned.
    const preview = body
      .replace(/\s+/g, " ")
      .slice(0, 240)
      .replace(/[<>]/g, (c) => (c === "<" ? "⟨" : "⟩"));
    console.warn(`[imagn] ${label} HTML parsed 0 items (${body.length} chars). Preview: ${preview}`);
    return [];
  };

  const raw = [
    ...byBody(ajaxNoCatHtml, "ajax-nocat"),
    ...byBody(ajaxHtml, "ajax"),
    ...byBody(pageHtml, "page"),
  ];

  // Dedupe across the two sources by src URL
  const dedupSeen = new Set<string>();
  const unique = raw.filter((r) => {
    if (dedupSeen.has(r.src)) return false;
    dedupSeen.add(r.src);
    return true;
  });

  const results: ImagnResult[] = [];
  for (const item of unique.slice(0, count)) {
    const href = item.href
      ? item.href.startsWith("http")
        ? item.href
        : `https://imagn.com${item.href.startsWith("/") ? "" : "/"}${item.href}`
      : pageUrl;
    const idMatch = (item.href || "").match(/(\d{5,})/);
    const id = idMatch?.[1] || `${results.length}-${Date.now().toString(36)}`;

    results.push({
      id: `imagn-${id}`,
      thumbnail: item.src,
      preview_url: item.highRes || item.src,
      full_url: item.highRes || item.src,
      caption: item.alt,
      photographer: item.credit || "Imagn / USA TODAY Sports",
      date_created: "",
      width: 1200,
      height: 800,
      collection: "Imagn",
      page_url: href,
    });
  }

  console.log(`[imagn] Final: ${results.length} images for "${query}" (${Date.now() - t0}ms total)`);
  setCached(cacheKey, results);
  return results;
}
