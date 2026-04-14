// src/lib/imagn-provider.ts
// Imagn (USA TODAY Sports) image search provider using Playwright
// Login is BEST-EFFORT — search works even without verified login
// The search page is publicly accessible; login just gets higher-res downloads
// Search endpoint: GET https://imagn.com/simpleSearchAjax/?searchCGOnly=...&searchtxt=...

import type { Page, Response as PwResponse } from "playwright";
import {
  getContext,
  saveSession,
  applyStealthToPage,
  humanDelay,
  humanType,
  isLoggedIn,
  setLoggedIn,
} from "./playwright-browser";

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

// ============================================
// Login — best-effort, never blocks search
// ============================================
async function attemptLogin(page: Page): Promise<void> {
  // Fast path: already logged in this server session
  if (isLoggedIn("imagn")) {
    console.log("[imagn] Already logged in (in-memory flag)");
    return;
  }

  const email = process.env.IMAGN_EMAIL;
  const password = process.env.IMAGN_PASSWORD;
  if (!email || !password) {
    console.log("[imagn] No credentials configured, will search without login");
    return;
  }

  try {
    // Quick session check — go to site and look for logged-in indicators
    await page.goto("https://imagn.com/", {
      waitUntil: "domcontentloaded",
      timeout: 15000,
    });
    await humanDelay(800, 1500);

    // Check if already logged in via restored session
    const alreadyLoggedIn = await page.evaluate(() => {
      const body = document.body.innerText.toLowerCase();
      if (
        body.includes("log out") ||
        body.includes("sign out") ||
        body.includes("my downloads") ||
        body.includes("my lightbox") ||
        body.includes("welcome,")
      ) return true;
      return !!document.querySelector('a[href*="logout"], a[href*="signout"]');
    });

    if (alreadyLoggedIn) {
      console.log("[imagn] Already logged in (session restored from disk)");
      setLoggedIn("imagn", true);
      return;
    }

    console.log("[imagn] Not logged in, attempting login (best-effort)...");

    // Go to login page
    await page.goto("https://imagn.com/login/", {
      waitUntil: "domcontentloaded",
      timeout: 15000,
    });
    await humanDelay(1500, 2500);

    // Wait for login form — short timeout, don't stall
    const formAppeared = await page.waitForSelector(
      "#loginUser, #loginForm, input[name='username'], input[type='email']",
      { timeout: 8000 }
    ).then(() => true).catch(() => false);

    if (!formAppeared) {
      console.warn("[imagn] Login form did not appear — will search without login");
      return;
    }

    // Fill username
    const usernameSelectors = [
      "#loginUser",
      'input[name="username"]',
      'input[name="email"]',
      'input[type="email"]',
      'input[name="user"]',
    ];
    let usernameFilled = false;
    for (const sel of usernameSelectors) {
      const el = await page.$(sel);
      if (el) {
        await humanType(page, sel, email);
        usernameFilled = true;
        break;
      }
    }
    if (!usernameFilled) {
      console.warn("[imagn] Could not find username field — will search without login");
      return;
    }

    await humanDelay(300, 600);

    // Fill password
    const passwordSelectors = [
      "#loginPass",
      '#loginForm input[type="password"]',
      'input[type="password"]',
      'input[name="password"]',
    ];
    let passFilled = false;
    for (const sel of passwordSelectors) {
      const el = await page.$(sel);
      if (el) {
        await humanType(page, sel, password);
        passFilled = true;
        break;
      }
    }
    if (!passFilled) {
      console.warn("[imagn] Could not find password field — will search without login");
      return;
    }

    await humanDelay(300, 600);

    // Submit — scroll into view first to avoid "outside viewport" error
    const submitSelectors = [
      '#loginForm button[type="submit"]',
      '#loginForm input[type="submit"]',
      'button:has-text("Log In")',
      'button:has-text("Login")',
      'input[value="Log In"]',
    ];
    let submitted = false;
    for (const sel of submitSelectors) {
      const btn = await page.$(sel);
      if (btn) {
        // Scroll the button into view before clicking
        await btn.scrollIntoViewIfNeeded().catch(() => {});
        await humanDelay(200, 400);
        // Try regular click first, fall back to force click, then JS click
        try {
          await btn.click({ timeout: 5000 });
          submitted = true;
        } catch {
          try {
            await btn.click({ force: true, timeout: 5000 });
            submitted = true;
          } catch {
            await page.evaluate((el) => (el as HTMLElement).click(), btn);
            submitted = true;
          }
        }
        break;
      }
    }
    if (!submitted) {
      // Last resort: press Enter in the password field
      await page.keyboard.press("Enter");
    }

    // Wait for navigation
    await page.waitForLoadState("domcontentloaded", { timeout: 10000 }).catch(() => {});
    await humanDelay(2000, 3000);

    // Check result
    const postLoginUrl = page.url();
    const postLoginText = await page.evaluate(() => document.body.innerText.toLowerCase());

    if (
      postLoginUrl.includes("/login") &&
      (postLoginText.includes("invalid") || postLoginText.includes("incorrect") || postLoginText.includes("try again"))
    ) {
      console.warn("[imagn] Login credentials rejected — will search without login");
      return;
    }

    console.log("[imagn] Login completed successfully");
    setLoggedIn("imagn", true);
    await saveSession("imagn");
  } catch (err) {
    // Login failed but we DON'T return false — search will still be attempted
    console.warn("[imagn] Login attempt failed:", err instanceof Error ? err.message : String(err).slice(0, 120));
    console.log("[imagn] Will proceed to search without verified login");
  }
}

// ============================================
// Search — always runs regardless of login state
// ============================================
export async function searchImagn(options: ImagnSearchOptions): Promise<ImagnResult[]> {
  const {
    query,
    categories = DEFAULT_CATEGORIES,
    count = 50,
  } = options;

  console.log(`[imagn] Searching: "${query}" (categories: ${categories}, count: ${count})`);

  let page: Page | null = null;

  try {
    const ctx = await getContext("imagn");
    page = await ctx.newPage();
    await applyStealthToPage(page);

    // Best-effort login — never blocks search
    await attemptLogin(page);

    const results: ImagnResult[] = [];

    // Set up interception for AJAX search responses
    // eslint-disable-next-line prefer-const
    let ajaxBody: string | null = null as string | null;
    const ajaxPromise = new Promise<void>((resolve) => {
      const timeout = setTimeout(() => resolve(), 20000);
      page!.on("response", async (response: PwResponse) => {
        const url = response.url();
        if (
          url.includes("simpleSearchAjax") ||
          url.includes("searchAjax") ||
          url.includes("search/ajax") ||
          url.includes("searchResults")
        ) {
          try {
            ajaxBody = await response.text();
            clearTimeout(timeout);
            resolve();
          } catch {
            // ignore
          }
        }
      });
    });

    // Navigate to the search page
    const searchUrl = `https://imagn.com/search/?searchtxt=${encodeURIComponent(query)}&searchCGOnly=${encodeURIComponent(categories)}`;
    console.log(`[imagn] Navigating to: ${searchUrl}`);

    await page.goto(searchUrl, {
      waitUntil: "domcontentloaded",
      timeout: 25000,
    });

    // Wait for images to appear OR the AJAX response
    await Promise.race([
      ajaxPromise,
      page.waitForSelector("img[src*='imagn'], img[src*='usatsi'], img[data-src]", { timeout: 15000 }).catch(() => {}),
      humanDelay(8000, 10000),
    ]);

    await humanDelay(1000, 2000);

    // Try parsing the AJAX HTML response first
    if (ajaxBody && ajaxBody.length > 500) {
      console.log(`[imagn] Got AJAX response (${ajaxBody.length} chars), parsing HTML...`);

      const parsed = await page.evaluate((htmlContent: string) => {
        const parser = new DOMParser();
        const doc = parser.parseFromString(htmlContent, "text/html");
        const items: Array<{
          id: string;
          thumbnail: string;
          preview_url: string;
          caption: string;
          photographer: string;
          href: string;
        }> = [];

        // Find all img tags in the AJAX HTML
        doc.querySelectorAll("img").forEach((img) => {
          const src = img.getAttribute("src") || img.getAttribute("data-src") || img.getAttribute("data-lazy-src") || "";
          if (!src) return;
          if (src.startsWith("data:")) return;
          if (src.includes("logo") || src.includes("icon") || src.includes("avatar") || src.includes("sprite")) return;
          if (src.includes("spacer") || src.includes("blank") || src.includes("placeholder")) return;

          const highRes =
            img.getAttribute("data-original") ||
            img.getAttribute("data-highres") ||
            img.getAttribute("data-full") ||
            img.getAttribute("data-zoom") ||
            img.getAttribute("srcset")?.split(",").pop()?.trim().split(" ")[0] ||
            "";

          const container =
            img.closest("[class*='result']") ||
            img.closest("[class*='item']") ||
            img.closest("[class*='photo']") ||
            img.closest("[class*='thumb']") ||
            img.closest("[class*='card']") ||
            img.closest("li") ||
            img.closest("article") ||
            img.closest("div");

          const link = img.closest("a");
          const idMatch = (link?.getAttribute("href") || "").match(/(\d{5,})/);
          const dataId =
            img.getAttribute("data-id") ||
            img.getAttribute("data-image-id") ||
            container?.getAttribute("data-id") ||
            "";

          items.push({
            id: dataId || idMatch?.[1] || `${items.length}`,
            thumbnail: src,
            preview_url: highRes || src,
            caption:
              img.getAttribute("alt") ||
              img.getAttribute("title") ||
              container?.querySelector("[class*='caption'], [class*='title'], figcaption, p")?.textContent?.trim() ||
              "",
            photographer:
              container?.querySelector("[class*='credit'], [class*='photographer'], [class*='byline'], small")?.textContent?.trim() ||
              "Imagn / USA TODAY Sports",
            href: link?.getAttribute("href") || "",
          });
        });

        // Fallback: check for background-image URLs
        if (items.length === 0) {
          doc.querySelectorAll("[style*='background-image']").forEach((div) => {
            const style = div.getAttribute("style") || "";
            const urlMatch = style.match(/url\(['"]?(https?:\/\/[^'")\s]+)['"]?\)/);
            if (urlMatch?.[1] && !urlMatch[1].includes("logo") && !urlMatch[1].includes("icon")) {
              items.push({
                id: `bg-${items.length}`,
                thumbnail: urlMatch[1],
                preview_url: urlMatch[1],
                caption: "",
                photographer: "Imagn / USA TODAY Sports",
                href: "",
              });
            }
          });
        }

        // Fallback: regex scan for image URLs in scripts or raw text
        if (items.length === 0) {
          const allText = doc.body?.innerHTML || "";
          const urlMatches = allText.matchAll(/https?:\/\/[^"'\s<>]+\.(?:jpg|jpeg|png|webp)(?:\?[^"'\s<>]*)?/gi);
          const seen = new Set<string>();
          for (const match of urlMatches) {
            const url = match[0];
            if (seen.has(url) || url.includes("logo") || url.includes("icon") || url.includes("sprite")) continue;
            seen.add(url);
            items.push({
              id: `regex-${items.length}`,
              thumbnail: url,
              preview_url: url,
              caption: "",
              photographer: "Imagn / USA TODAY Sports",
              href: "",
            });
          }
        }

        return items;
      }, ajaxBody);

      console.log(`[imagn] Parsed ${parsed.length} images from AJAX HTML`);

      for (const item of parsed.slice(0, count)) {
        // Use captured href if it looks like a detail page, otherwise fall back to search page
        const pageUrl = item.href
          ? (item.href.startsWith("http") ? item.href : `https://imagn.com${item.href.startsWith("/") ? "" : "/"}${item.href}`)
          : searchUrl;
        results.push({
          id: item.id.startsWith("imagn-") ? item.id : `imagn-${item.id}`,
          thumbnail: item.thumbnail,
          preview_url: item.preview_url,
          full_url: item.preview_url,
          caption: item.caption,
          photographer: item.photographer,
          date_created: "",
          width: 1200,
          height: 800,
          collection: "Imagn",
          page_url: pageUrl,
        });
      }
    }

    // Fallback: scrape the live page DOM
    if (results.length === 0) {
      console.log("[imagn] AJAX parsing yielded 0 results, scraping live page DOM...");

      // Scroll to trigger lazy loading
      await page.evaluate(async () => {
        for (let i = 0; i < 4; i++) {
          window.scrollBy(0, window.innerHeight);
          await new Promise((r) => setTimeout(r, 1000));
        }
        window.scrollTo(0, 0);
      });
      await humanDelay(1500, 2500);

      const scraped = await page.evaluate(() => {
        const items: Array<{
          id: string;
          thumbnail: string;
          preview_url: string;
          caption: string;
          photographer: string;
          href: string;
        }> = [];

        document.querySelectorAll("img").forEach((img) => {
          const src = img.src || img.dataset.src || img.dataset.lazySrc || "";
          if (!src || src.startsWith("data:")) return;
          if (img.width > 0 && img.width < 80) return;
          if (src.includes("logo") || src.includes("icon") || src.includes("avatar")) return;
          if (src.includes("sprite") || src.includes("spacer") || src.includes("blank")) return;

          const highRes =
            img.dataset.original ||
            img.dataset.highres ||
            img.dataset.full ||
            img.srcset?.split(",").pop()?.trim().split(" ")[0] ||
            src;

          const container = img.closest("div, li, article, figure");
          const link = img.closest("a") as HTMLAnchorElement | null;

          items.push({
            id: img.dataset.id || img.dataset.imageId || "",
            thumbnail: src,
            preview_url: highRes,
            caption: img.alt || img.title || "",
            photographer:
              container?.querySelector("[class*='credit'], [class*='photographer'], small")?.textContent?.trim() ||
              "Imagn / USA TODAY Sports",
            href: link?.href || "",
          });
        });

        return items;
      });

      for (const item of scraped.slice(0, count)) {
        const pageUrl = item.href
          ? (item.href.startsWith("http") ? item.href : `https://imagn.com${item.href.startsWith("/") ? "" : "/"}${item.href}`)
          : searchUrl;
        results.push({
          id: `imagn-dom-${item.id || results.length}-${Date.now()}`,
          thumbnail: item.thumbnail,
          preview_url: item.preview_url,
          full_url: item.preview_url,
          caption: item.caption,
          photographer: item.photographer,
          date_created: "",
          width: 1200,
          height: 800,
          collection: "Imagn",
          page_url: pageUrl,
        });
      }
    }

    console.log(`[imagn] Final: ${results.length} images for "${query}"`);
    await page.close();
    return results.slice(0, count);
  } catch (err) {
    console.error("[imagn] Search error:", err instanceof Error ? err.message : err);
    if (page) await page.close().catch(() => {});
    return [];
  }
}
