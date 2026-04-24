// src/lib/imago-provider.ts
// Imago Images search provider using Playwright
// This is a JS-heavy SPA — login form is dynamically rendered, not in static HTML
// Search field name is "suchtext"
// Search API: POST https://api.imago-images.com/ewb/search

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

export type ImagoSearchOptions = {
  query: string;
  category?: string;
  dateFrom?: string;
  sortBy?: "popular" | "newest" | "relevant";
  orientation?: "horizontal" | "vertical" | "square";
  count?: number;
};

export type ImagoResult = {
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

// ============================================
// Login — SPA, must wait for JS to render the form
// ============================================
async function attemptLogin(page: Page): Promise<void> {
  // Fast path: already logged in this server session
  if (isLoggedIn("imago")) {
    console.log("[imago] Already logged in (in-memory flag)");
    return;
  }

  const email = process.env.IMAGO_EMAIL;
  const password = process.env.IMAGO_PASSWORD;
  if (!email || !password) {
    console.log("[imago] No credentials configured, will search without login");
    return;
  }

  try {
    // Navigate to home to check login state
    await page.goto("https://www.imago-images.com/", {
      waitUntil: "networkidle",
      timeout: 20000,
    });
    await humanDelay(2000, 3000);

    // Check if already logged in — SPA may show account/profile elements
    const alreadyLoggedIn = await page.evaluate(() => {
      const body = document.body.innerText.toLowerCase();
      // Check for logout/account indicators
      if (
        body.includes("logout") ||
        body.includes("log out") ||
        body.includes("abmelden") || // German for logout
        body.includes("mein konto") || // German for my account
        body.includes("my account") ||
        body.includes("my lightbox") ||
        body.includes("lightbox")
      ) return true;

      // Check for logout links/buttons in DOM
      const logoutEl = document.querySelector(
        'a[href*="logout"], button[class*="logout"], [class*="user-menu"], [class*="user-nav"], [class*="account-menu"]'
      );
      return !!logoutEl;
    });

    if (alreadyLoggedIn) {
      console.log("[imago] Already logged in (session restored from disk)");
      setLoggedIn("imago", true);
      return;
    }

    console.log("[imago] Not logged in, attempting login...");

    // Strategy 1: Look for a login link/button on the page and click it
    const loginClicked = await page.evaluate(() => {
      // Try various login trigger elements
      const selectors = [
        'a[href*="login"]',
        'a[href*="signin"]',
        'a[href*="anmelden"]', // German for sign in
        'button[class*="login"]',
        '[class*="login-btn"]',
        '[class*="signin-btn"]',
        '[data-action*="login"]',
      ];
      for (const sel of selectors) {
        const el = document.querySelector(sel) as HTMLElement;
        if (el) {
          el.click();
          return true;
        }
      }
      // Try finding by text content
      const links = Array.from(document.querySelectorAll("a, button"));
      for (const el of links) {
        const text = el.textContent?.toLowerCase().trim() || "";
        if (text === "login" || text === "log in" || text === "sign in" || text === "anmelden") {
          (el as HTMLElement).click();
          return true;
        }
      }
      return false;
    });

    if (loginClicked) {
      console.log("[imago] Clicked login button, waiting for form...");
      await humanDelay(2000, 4000);
    } else {
      // Strategy 2: Try known login URLs
      const loginUrls = [
        "https://www.imago-images.com/st/login",
        "https://www.imago-images.com/login",
        "https://www.imago-images.com/#/login",
        "https://www.imago-images.com/en/login",
      ];
      let found = false;
      for (const url of loginUrls) {
        console.log(`[imago] Trying login URL: ${url}`);
        await page.goto(url, { waitUntil: "networkidle", timeout: 15000 });
        await humanDelay(2000, 4000);

        // Check if a login form appeared
        const hasForm = await page.$('input[type="email"], input[type="password"], input[name="email"], input[name="username"], input[name="user"]');
        if (hasForm) {
          found = true;
          break;
        }
      }
      if (!found) {
        console.log("[imago] Could not find login page via URL, trying popup/modal approach...");
      }
    }

    // Wait for the login form to render (it's a SPA, may take a moment)
    // Try multiple selector strategies to find the email/username field
    const emailFieldSelectors = [
      'input[type="email"]',
      'input[name="email"]',
      'input[name="username"]',
      'input[name="user"]',
      'input[name="login"]',
      'input[id*="email"]',
      'input[id*="user"]',
      'input[id*="login"]',
      'input[placeholder*="email" i]',
      'input[placeholder*="user" i]',
      'input[placeholder*="e-mail" i]',
      'input[placeholder*="benutzername" i]', // German for username
      // In case it's a modal/dialog
      'dialog input[type="email"]',
      'dialog input[type="text"]',
      '[role="dialog"] input[type="email"]',
      '[role="dialog"] input[type="text"]',
      '[class*="modal"] input[type="email"]',
      '[class*="modal"] input[type="text"]',
    ];

    let emailSelector: string | null = null;
    for (const sel of emailFieldSelectors) {
      try {
        await page.waitForSelector(sel, { timeout: 3000 });
        emailSelector = sel;
        console.log(`[imago] Found email field: ${sel}`);
        break;
      } catch {
        // Try next
      }
    }

    if (!emailSelector) {
      // Last resort: dump what we can see for debugging
      const pageInfo = await page.evaluate(() => ({
        url: window.location.href,
        title: document.title,
        inputs: Array.from(document.querySelectorAll("input")).map((el) => ({
          type: el.type,
          name: el.name,
          id: el.id,
          placeholder: el.placeholder,
          class: el.className.slice(0, 60),
        })),
        visibleText: document.body.innerText.slice(0, 500),
      }));
      console.warn("[imago] Could not find login form. Page info:", JSON.stringify(pageInfo, null, 2));
      console.log("[imago] Will proceed to search without verified login");
      return;
    }

    // Fill email
    await humanType(page, emailSelector, email);
    await humanDelay(300, 600);

    // Find and fill password
    const passwordSelectors = [
      'input[type="password"]',
      'input[name="password"]',
      'input[id*="password"]',
      'input[id*="pass"]',
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
      console.warn("[imago] Could not find password field — will search without login");
      return;
    }

    await humanDelay(300, 600);

    // Submit — scroll into view first to avoid "outside viewport" error
    const submitSelectors = [
      'button[type="submit"]',
      'input[type="submit"]',
      'button:has-text("Login")',
      'button:has-text("Log in")',
      'button:has-text("Sign in")',
      'button:has-text("Anmelden")', // German
    ];
    let submitted = false;
    for (const sel of submitSelectors) {
      const btn = await page.$(sel);
      if (btn) {
        await btn.scrollIntoViewIfNeeded().catch(() => {});
        await humanDelay(200, 400);
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
      await page.keyboard.press("Enter");
    }

    // Wait for login to process
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
    await humanDelay(3000, 5000);

    // Verify login
    const postLoginCheck = await page.evaluate(() => {
      const body = document.body.innerText.toLowerCase();
      return (
        body.includes("logout") ||
        body.includes("log out") ||
        body.includes("abmelden") ||
        body.includes("my account") ||
        body.includes("mein konto") ||
        body.includes("lightbox")
      );
    });

    if (postLoginCheck) {
      console.log("[imago] Login successful");
    } else {
      console.warn("[imago] Could not verify login — proceeding optimistically (session cookies may still work)");
    }

    setLoggedIn("imago", true);
    await saveSession("imago");
  } catch (err) {
    // Login failed — don't block search, proceed anyway
    console.warn("[imago] Login attempt failed:", err instanceof Error ? err.message : String(err).slice(0, 120));
    console.log("[imago] Will proceed to search without verified login");
  }
}

// ============================================
// Search — intercept API or scrape DOM
// ============================================
export async function searchImago(options: ImagoSearchOptions): Promise<ImagoResult[]> {
  const {
    query,
    category = "sport",
    dateFrom,
    sortBy = "popular",
    orientation,
    count = 50,
  } = options;

  console.log(`[imago] Searching: "${query}" (category: ${category}, count: ${count})`);

  let page: Page | null = null;

  try {
    const ctx = await getContext("imago");
    page = await ctx.newPage();
    await applyStealthToPage(page);

    // Login disabled — Imago moved their login URLs and the probe loop wastes
    // 15-25s returning nothing useful. DOM scrape of the public search page
    // still yields 2-5 images. Cookie-based auth is planned for a future pass.
    // void attemptLogin;

    const results: ImagoResult[] = [];

    // Set up response interception for the search API
    let apiData: Record<string, unknown> | null = null;
    const apiPromise = new Promise<void>((resolve) => {
      const timeout = setTimeout(() => resolve(), 20000);
      page!.on("response", async (response: PwResponse) => {
        const url = response.url();
        if (url.includes("api.imago-images.com") && (url.includes("search") || url.includes("Search"))) {
          try {
            apiData = await response.json();
            clearTimeout(timeout);
            resolve();
          } catch {
            // Not JSON
          }
        }
      });
    });

    // Navigate to search — build URL with parameters
    const searchParams = new URLSearchParams();
    searchParams.set("suchtext", query); // Imago uses "suchtext" for search text
    if (category) searchParams.set("category", category);
    if (orientation) searchParams.set("orientation", orientation);

    const searchUrl = `https://www.imago-images.com/search?${searchParams.toString()}`;
    console.log(`[imago] Navigating to: ${searchUrl}`);

    await page.goto(searchUrl, {
      waitUntil: "networkidle",
      timeout: 25000,
    });

    // Wait for either API response or images to appear
    await Promise.race([
      apiPromise,
      page.waitForSelector("[class*='result'] img, [class*='thumb'] img, [class*='gallery'] img, [class*='grid'] img", { timeout: 15000 }).catch(() => {}),
      humanDelay(10000, 12000),
    ]);

    await humanDelay(1000, 2000);

    // Process API data if we intercepted it
    if (apiData) {
      const raw = apiData as Record<string, unknown>;
      const hits = (raw.hits as unknown) || (raw.results as unknown) || (raw.data as unknown) || [];
      console.log(`[imago] Got ${Array.isArray(hits) ? hits.length : 0} results from API intercept`);

      if (Array.isArray(hits)) {
        for (const hit of hits.slice(0, count)) {
          const src = hit._source || hit;
          const imgId = hit._id || src.id || src.imageid || results.length;
          results.push({
            id: `imago-${imgId}`,
            thumbnail: src.thumbnail || src.thumbUrl || src.thumb || src.preview || "",
            preview_url: src.preview || src.previewUrl || src.watermark || src.thumbnail || src.thumbUrl || "",
            full_url: src.highres || src.original || src.downloadUrl || src.preview || src.previewUrl || "",
            caption: src.caption || src.headline || src.title || src.description || src.bildtext || "",
            photographer: src.photographer || src.credit || src.source || src.fotograf || "Imago",
            date_created: src.datecreated || src.date_created || src.createDate || src.datum || "",
            width: src.width || src.originalWidth || 1200,
            height: src.height || src.originalHeight || 800,
            collection: src.collection || src.agency || src.agentur || "",
            page_url: `https://www.imago-images.com/st/${String(imgId).replace(/\D/g, "") || imgId}`,
          });
        }
      }
    }

    // Fallback: scrape the rendered page DOM
    if (results.length === 0) {
      console.log("[imago] API intercept returned no data, scraping DOM...");

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
          link: string;
        }> = [];

        // Get all substantial images on the page
        document.querySelectorAll("img").forEach((img) => {
          const src = img.src || img.dataset.src || img.dataset.lazySrc || "";
          if (!src || src.startsWith("data:")) return;
          // Filter UI elements — case-insensitive so "IMAGO-Primary_Logos..."
          // also gets caught (the site logo was slipping through lower-case checks).
          const lower = src.toLowerCase();
          if (lower.includes("logo") || lower.includes("icon") || lower.includes("avatar") || lower.includes("sprite")) return;
          if (lower.includes("flag") || lower.includes("arrow") || lower.includes("button")) return;
          if (lower.includes("/associations/") || lower.includes("/partners/") || lower.includes("placeholder")) return;
          if (lower.endsWith(".svg")) return; // real editorial photos are always raster
          // Size check after the URL filters so we don't waste checks on logos.
          if (img.naturalWidth > 0 && img.naturalWidth < 80) return;
          if (img.width > 0 && img.width < 80) return;

          const highRes =
            img.dataset.original ||
            img.dataset.highres ||
            img.dataset.full ||
            img.dataset.zoom ||
            img.dataset.large ||
            img.srcset?.split(",").pop()?.trim().split(" ")[0] ||
            src;

          const container = img.closest("div, li, article, figure, a");
          const captionEl =
            container?.querySelector("[class*='caption'], [class*='title'], figcaption, p") ||
            null;
          const creditEl =
            container?.querySelector("[class*='credit'], [class*='photographer'], [class*='byline'], small") ||
            null;

          const link = (img.closest("a") as HTMLAnchorElement)?.href || "";
          const idMatch = link.match(/(\d{5,})/);

          items.push({
            id: img.dataset.id || img.dataset.imageId || idMatch?.[1] || "",
            thumbnail: src,
            preview_url: highRes,
            caption: img.alt || img.title || captionEl?.textContent?.trim() || "",
            photographer: creditEl?.textContent?.trim() || "Imago",
            link,
          });
        });

        // Also check for background-image patterns (some galleries use this)
        document.querySelectorAll("[style*='background-image']").forEach((el) => {
          const style = el.getAttribute("style") || "";
          const urlMatch = style.match(/url\(['"]?(https?:\/\/[^'")\s]+)['"]?\)/);
          if (urlMatch?.[1] && !urlMatch[1].includes("logo") && !urlMatch[1].includes("icon")) {
            items.push({
              id: `bg-${items.length}`,
              thumbnail: urlMatch[1],
              preview_url: urlMatch[1],
              caption: (el as HTMLElement).title || el.getAttribute("aria-label") || "",
              photographer: "Imago",
              link: (el.closest("a") as HTMLAnchorElement)?.href || "",
            });
          }
        });

        return items;
      });

      console.log(`[imago] Scraped ${scraped.length} images from DOM`);

      for (const item of scraped.slice(0, count)) {
        const numericId = (item.id || "").replace(/\D/g, "");
        const pageUrl = item.link
          ? (item.link.startsWith("http") ? item.link : `https://www.imago-images.com${item.link}`)
          : numericId
            ? `https://www.imago-images.com/st/${numericId}`
            : "";
        results.push({
          id: `imago-dom-${item.id || results.length}-${Date.now()}`,
          thumbnail: item.thumbnail,
          preview_url: item.preview_url,
          full_url: item.preview_url,
          caption: item.caption,
          photographer: item.photographer,
          date_created: "",
          width: 1200,
          height: 800,
          collection: "Imago",
          page_url: pageUrl,
        });
      }
    }

    console.log(`[imago] Final: ${results.length} images for "${query}"`);
    await page.close();
    return results.slice(0, count);
  } catch (err) {
    console.error("[imago] Search error:", err instanceof Error ? err.message : err);
    if (page) await page.close().catch(() => {});
    return [];
  }
}
