// src/lib/playwright-browser.ts
// Shared Playwright browser instance with anti-detection stealth measures
// Maintains a SINGLE persistent browser context per provider to preserve login
// Sessions are saved to disk and restored on server restart — login only happens once

import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import path from "path";
import fs from "fs";

// ============================================
// Singleton browser + persistent contexts
// ============================================
let browserInstance: Browser | null = null;
let imagoContext: BrowserContext | null = null;
let imagnContext: BrowserContext | null = null;

// Track login state in memory — avoids re-checking on every search
let imagoLoggedIn = false;
let imagnLoggedIn = false;

const SESSION_DIR = path.join(process.cwd(), ".playwright-sessions");
const IMAGO_SESSION_FILE = path.join(SESSION_DIR, "imago", "state.json");
const IMAGN_SESSION_FILE = path.join(SESSION_DIR, "imagn", "state.json");

/** Ensure session directories exist */
function ensureSessionDirs() {
  for (const dir of [SESSION_DIR, path.dirname(IMAGO_SESSION_FILE), path.dirname(IMAGN_SESSION_FILE)]) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }
}

/** Stealth launch args — mimics a real Chrome install */
const STEALTH_ARGS = [
  "--disable-blink-features=AutomationControlled",
  "--disable-features=IsolateOrigins,site-per-process",
  "--disable-infobars",
  "--no-first-run",
  "--no-default-browser-check",
  "--window-size=1920,1080",
  "--start-maximized",
  "--lang=en-US,en",
];

const CHROME_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

/** Get or create the shared browser instance */
async function getBrowser(): Promise<Browser> {
  if (browserInstance?.isConnected()) return browserInstance;

  ensureSessionDirs();

  browserInstance = await chromium.launch({
    headless: true,
    args: STEALTH_ARGS,
  });

  // Reset context refs when browser restarts
  imagoContext = null;
  imagnContext = null;
  imagoLoggedIn = false;
  imagnLoggedIn = false;

  return browserInstance;
}

/** Apply stealth patches to a page — prevents bot detection */
export async function applyStealthToPage(page: Page) {
  await page.addInitScript(() => {
    // Override navigator.webdriver
    Object.defineProperty(navigator, "webdriver", { get: () => false });

    // Chrome runtime object (missing in headless = detection flag)
    const w = window as any;
    w.chrome = { runtime: {}, loadTimes: () => ({}), csi: () => ({}) };

    // Realistic plugins array
    Object.defineProperty(navigator, "plugins", {
      get: () => [
        { name: "Chrome PDF Plugin", filename: "internal-pdf-viewer" },
        { name: "Chrome PDF Viewer", filename: "mhjfbmdgcfjbbpaeojofohoefgiehjai" },
        { name: "Native Client", filename: "internal-nacl-plugin" },
      ],
    });

    // Realistic languages
    Object.defineProperty(navigator, "languages", {
      get: () => ["en-US", "en"],
    });

    // Hardware concurrency (default headless = 1, real browser = 4+)
    Object.defineProperty(navigator, "hardwareConcurrency", {
      get: () => 8,
    });

    // Platform
    Object.defineProperty(navigator, "platform", {
      get: () => "MacIntel",
    });

    // Override permissions query to avoid headless fingerprint
    const originalQuery = window.navigator.permissions.query;
    window.navigator.permissions.query = (params: any) =>
      params.name === "notifications"
        ? Promise.resolve({ state: "prompt", onchange: null } as PermissionStatus)
        : originalQuery(params);

    // WebGL vendor/renderer (headless gives "Google SwiftShader")
    const getParameter = WebGLRenderingContext.prototype.getParameter;
    WebGLRenderingContext.prototype.getParameter = function (parameter) {
      if (parameter === 37445) return "Intel Inc.";
      if (parameter === 37446) return "Intel Iris OpenGL Engine";
      return getParameter.apply(this, [parameter]);
    };
  });
}

/**
 * Get a persistent browser context for a provider.
 * The context is reused across ALL searches — pages are opened/closed within it
 * but the context (and its cookies) stays alive for the lifetime of the server.
 */
export async function getContext(provider: "imago" | "imagn"): Promise<BrowserContext> {
  const browser = await getBrowser();
  const sessionFile = provider === "imago" ? IMAGO_SESSION_FILE : IMAGN_SESSION_FILE;

  // Return existing context if alive
  const existing = provider === "imago" ? imagoContext : imagnContext;
  if (existing) {
    try {
      await existing.pages(); // connectivity check
      return existing;
    } catch {
      // Context died — recreate
      if (provider === "imago") { imagoContext = null; imagoLoggedIn = false; }
      else { imagnContext = null; imagnLoggedIn = false; }
    }
  }

  // Create new context — restore session from disk if available
  const hasSession = fs.existsSync(sessionFile);
  if (hasSession) {
    console.log(`[playwright] Restoring ${provider} session from disk`);
  }

  const ctx = await browser.newContext({
    storageState: hasSession ? sessionFile : undefined,
    userAgent: CHROME_UA,
    viewport: { width: 1920, height: 1080 },
    locale: "en-US",
    timezoneId: "America/New_York",
    extraHTTPHeaders: {
      "Accept-Language": "en-US,en;q=0.9",
    },
  });

  if (provider === "imago") imagoContext = ctx;
  else imagnContext = ctx;

  return ctx;
}

/** Check if the in-memory login flag is set (avoids re-login per search) */
export function isLoggedIn(provider: "imago" | "imagn"): boolean {
  return provider === "imago" ? imagoLoggedIn : imagnLoggedIn;
}

/** Mark provider as logged in (called after successful login) */
export function setLoggedIn(provider: "imago" | "imagn", value: boolean) {
  if (provider === "imago") imagoLoggedIn = value;
  else imagnLoggedIn = value;
}

/** Save login session to disk so it persists between server restarts */
export async function saveSession(provider: "imago" | "imagn") {
  const ctx = provider === "imago" ? imagoContext : imagnContext;
  const sessionFile = provider === "imago" ? IMAGO_SESSION_FILE : IMAGN_SESSION_FILE;
  if (ctx) {
    ensureSessionDirs();
    await ctx.storageState({ path: sessionFile });
    console.log(`[playwright] Saved ${provider} session to disk`);
  }
}

/** Graceful shutdown */
export async function closeBrowser() {
  if (imagoContext) {
    await saveSession("imago").catch(() => {});
    await imagoContext.close().catch(() => {});
    imagoContext = null;
    imagoLoggedIn = false;
  }
  if (imagnContext) {
    await saveSession("imagn").catch(() => {});
    await imagnContext.close().catch(() => {});
    imagnContext = null;
    imagnLoggedIn = false;
  }
  if (browserInstance) {
    await browserInstance.close().catch(() => {});
    browserInstance = null;
  }
}

/** Human-like delay — adds natural variance to actions */
export function humanDelay(minMs = 500, maxMs = 1500): Promise<void> {
  const ms = Math.floor(Math.random() * (maxMs - minMs)) + minMs;
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Human-like typing with random per-character delay */
export async function humanType(page: Page, selector: string, text: string) {
  await page.click(selector);
  await humanDelay(200, 400);
  await page.fill(selector, "");
  for (const char of text) {
    await page.type(selector, char, { delay: Math.random() * 100 + 30 });
  }
}
