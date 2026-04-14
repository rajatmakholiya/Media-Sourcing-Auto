#!/usr/bin/env node
// scripts/render.mjs
// Standalone render script — spawned as a child process by the API route
// Downloads assets, serves them locally, renders with Remotion

import fs from "fs/promises";
import { existsSync, createReadStream } from "fs";
import path from "path";
import http from "http";
import { fileURLToPath } from "url";
import { execFile } from "child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const [,, compositionPath, jobId, outputDir] = process.argv;

if (!compositionPath || !jobId || !outputDir) {
  console.error("Usage: node scripts/render.mjs <composition.json> <jobId> <outputDir>");
  process.exit(1);
}

function progress(stage, pct) {
  console.log(`PROGRESS:${stage}:${pct}`);
}

// Simple static file server for downloaded assets
function startAssetServer(assetDir, port) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const filePath = path.join(assetDir, decodeURIComponent(req.url.replace(/^\//, "")));
      if (!existsSync(filePath)) {
        res.writeHead(404);
        res.end("Not found");
        return;
      }
      const ext = path.extname(filePath).toLowerCase();
      const mimeTypes = {
        ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
        ".webp": "image/webp", ".gif": "image/gif", ".mp4": "video/mp4",
        ".webm": "video/webm", ".mov": "video/quicktime",
      };
      res.writeHead(200, { "Content-Type": mimeTypes[ext] || "application/octet-stream" });
      createReadStream(filePath).pipe(res);
    });
    server.listen(port, () => {
      console.error(`[asset-server] Serving assets on http://localhost:${port}`);
      resolve(server);
    });
  });
}

async function main() {
  const compositionJson = await fs.readFile(compositionPath, "utf-8");
  const composition = JSON.parse(compositionJson);
  const jobDir = path.join(ROOT, "tmp", "exports", jobId);
  await fs.mkdir(jobDir, { recursive: true });

  const ASSET_PORT = 9123 + Math.floor(Math.random() * 1000);

  // ============================================
  // STAGE 1: Download media assets
  // ============================================
  progress("downloading", 0);
  const assetMap = new Map(); // segment_id -> { filename, isVideo }

  // Check if yt-dlp is available (supports YouTube, Instagram, Twitter, Vimeo, TikTok, 1000+ sites)
  const hasYtDlp = await new Promise((resolve) => {
    execFile("yt-dlp", ["--version"], { timeout: 5000 }, (err) => resolve(!err));
  });
  if (hasYtDlp) {
    console.error("[download] yt-dlp available — video platform URLs will be downloaded");
  } else {
    console.error("[download] yt-dlp not found — platform videos will be skipped. Install: brew install yt-dlp");
  }

  // Download video via yt-dlp (works with YouTube, Instagram, Twitter, Vimeo, TikTok, etc.)
  async function downloadWithYtDlp(url, outputPath) {
    return new Promise((resolve) => {
      const args = [
        "-f", "bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/best[height<=1080][ext=mp4]/best",
        "--merge-output-format", "mp4",
        "-o", outputPath,
        "--no-playlist",
        "--socket-timeout", "30",
        url,
      ];
      execFile("yt-dlp", args, { timeout: 120000 }, (err, stdout, stderr) => {
        if (err) {
          console.error(`[yt-dlp] Failed for ${url}: ${err.message}`);
          if (stderr) console.error(`[yt-dlp] stderr: ${stderr.slice(0, 500)}`);
          resolve(null);
        } else {
          resolve(outputPath);
        }
      });
    });
  }

  // Scrape HTML page for embedded video source URLs
  async function scrapeVideoUrl(pageUrl) {
    try {
      const resp = await fetch(pageUrl, {
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
        redirect: "follow",
      });
      if (!resp.ok) return null;
      const contentType = resp.headers.get("content-type") || "";
      if (!contentType.includes("text/html")) return null;

      const html = await resp.text();

      // Try multiple extraction patterns, ordered by reliability
      const patterns = [
        // og:video / og:video:url meta tags
        /property=["']og:video(?::url)?["']\s+content=["']([^"']+\.mp4[^"']*)/i,
        /content=["']([^"']+\.mp4[^"']*?)["']\s+property=["']og:video/i,
        // twitter:player:stream
        /name=["']twitter:player:stream["']\s+content=["']([^"']+)/i,
        // JSON-LD VideoObject contentUrl
        /"contentUrl"\s*:\s*"([^"]+\.mp4[^"]*)"/i,
        /"contentUrl"\s*:\s*"([^"]+\.m3u8[^"]*)"/i,
        // <video> tag src
        /<video[^>]+src=["']([^"']+\.mp4[^"']*)/i,
        /<source[^>]+src=["']([^"']+\.mp4[^"']*)/i,
        /<source[^>]+src=["']([^"']+\.m3u8[^"']*)/i,
        // data attributes
        /data-video-?(?:src|url)=["']([^"']+)/i,
        // Generic .mp4 URL in the page (less reliable but catches CDN links)
        /["'](https?:\/\/[^"'\s]+?\.mp4(?:\?[^"'\s]*)?)/i,
      ];

      for (const pattern of patterns) {
        const match = html.match(pattern);
        if (match?.[1]) {
          let url = match[1];
          // Resolve relative URLs
          if (url.startsWith("/")) {
            const base = new URL(pageUrl);
            url = `${base.protocol}//${base.host}${url}`;
          }
          console.error(`[scrape] Found video URL via pattern: ${url.slice(0, 120)}`);
          return url;
        }
      }

      return null;
    } catch (err) {
      console.error(`[scrape] Error fetching ${pageUrl}: ${err.message}`);
      return null;
    }
  }

  // Download a direct media URL to disk, returns true on success
  async function downloadDirectUrl(url, outputPath) {
    try {
      const resp = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
        redirect: "follow",
      });
      const contentType = resp.headers.get("content-type") || "";
      if (!resp.ok || (!contentType.startsWith("video/") && !contentType.includes("mp4") && !contentType.includes("octet-stream"))) {
        return false;
      }
      const buffer = Buffer.from(await resp.arrayBuffer());
      if (buffer.length < 1024) return false;
      await fs.writeFile(outputPath, buffer);
      console.error(`[download] Direct URL OK (${(buffer.length / 1024).toFixed(0)}KB)`);
      return true;
    } catch {
      return false;
    }
  }

  for (let i = 0; i < composition.segments.length; i++) {
    const seg = composition.segments[i];

    try {
      if (!seg.media.url || !seg.media.url.startsWith("http")) continue;

      let downloaded = false;

      // Step 1: Try direct fetch (works for Pexels, Pixabay, direct CDN links, etc.)
      try {
        const resp = await fetch(seg.media.url, {
          headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
          redirect: "follow",
        });

        const contentType = resp.headers.get("content-type") || "";
        const isMediaType = contentType.startsWith("image/") || contentType.startsWith("video/");

        if (resp.ok && isMediaType) {
          const buffer = Buffer.from(await resp.arrayBuffer());
          if (buffer.length > 1024) {
            let ext = ".jpg";
            if (contentType.includes("png")) ext = ".png";
            else if (contentType.includes("webp")) ext = ".webp";
            else if (contentType.includes("gif")) ext = ".gif";
            else if (contentType.includes("mp4")) ext = ".mp4";
            else if (contentType.includes("webm")) ext = ".webm";
            else if (seg.media.type === "video") ext = ".mp4";

            const filename = `segment-${seg.id}${ext}`;
            await fs.writeFile(path.join(jobDir, filename), buffer);
            assetMap.set(seg.id, { filename, isVideo: ext === ".mp4" || ext === ".webm" });
            console.error(`[download] Segment ${seg.id}: direct OK (${(buffer.length / 1024).toFixed(0)}KB, ${ext})`);
            downloaded = true;
          }
        }
      } catch {
        // Direct fetch failed — will try yt-dlp below
      }

      // Step 2: If direct fetch didn't yield media and this is a video, try yt-dlp
      if (!downloaded && seg.media.type === "video" && hasYtDlp) {
        const filename = `segment-${seg.id}.mp4`;
        const outPath = path.join(jobDir, filename);
        console.error(`[download] Segment ${seg.id}: direct fetch failed, trying yt-dlp for ${seg.media.url}`);
        const result = await downloadWithYtDlp(seg.media.url, outPath);
        if (result && existsSync(outPath)) {
          const stat = await fs.stat(outPath);
          assetMap.set(seg.id, { filename, isVideo: true });
          console.error(`[download] Segment ${seg.id}: yt-dlp OK (${(stat.size / 1024).toFixed(0)}KB)`);
          downloaded = true;
        } else {
          console.error(`[download] Segment ${seg.id}: yt-dlp failed`);
        }
      }

      // Step 3: Scrape the page HTML for embedded video URLs (og:video, <video> tags, JSON-LD, etc.)
      if (!downloaded && seg.media.type === "video") {
        console.error(`[download] Segment ${seg.id}: scraping page for video source...`);
        const scrapedUrl = await scrapeVideoUrl(seg.media.url);
        if (scrapedUrl) {
          const filename = `segment-${seg.id}.mp4`;
          const outPath = path.join(jobDir, filename);

          // Try direct download of the scraped URL
          if (await downloadDirectUrl(scrapedUrl, outPath)) {
            const stat = await fs.stat(outPath);
            assetMap.set(seg.id, { filename, isVideo: true });
            console.error(`[download] Segment ${seg.id}: scraped URL OK (${(stat.size / 1024).toFixed(0)}KB)`);
            downloaded = true;
          }
          // If scraped URL is also behind a player, try yt-dlp on it
          else if (hasYtDlp) {
            const result = await downloadWithYtDlp(scrapedUrl, outPath);
            if (result && existsSync(outPath)) {
              const stat = await fs.stat(outPath);
              assetMap.set(seg.id, { filename, isVideo: true });
              console.error(`[download] Segment ${seg.id}: yt-dlp on scraped URL OK (${(stat.size / 1024).toFixed(0)}KB)`);
              downloaded = true;
            }
          }
        }
      }

      if (!downloaded) {
        console.error(`[download] Segment ${seg.id}: all methods failed — will be black in render`);
      }
    } catch (err) {
      console.error(`[download] Segment ${seg.id}: Error - ${err.message}`);
    }

    progress("downloading", Math.round(((i + 1) / composition.segments.length) * 20));
  }

  // ============================================
  // STAGE 2: Start asset server
  // ============================================
  progress("preparing", 20);
  const assetServer = await startAssetServer(jobDir, ASSET_PORT);
  const assetBaseUrl = `http://localhost:${ASSET_PORT}`;

  // Build composition with local HTTP URLs
  const localComp = {
    ...composition,
    segments: composition.segments.map((seg) => {
      const asset = assetMap.get(seg.id);
      return {
        ...seg,
        media: {
          ...seg.media,
          url: asset ? `${assetBaseUrl}/${asset.filename}` : "",
          type: asset?.isVideo ? "video" : "image",
        },
      };
    }),
  };

  progress("preparing", 30);

  // ============================================
  // STAGE 3: Remotion rendering
  // ============================================
  progress("remotion_rendering", 30);

  const finalOutput = path.join(outputDir, `${jobId}.mp4`);
  await fs.mkdir(outputDir, { recursive: true });

  try {
    const { bundle } = await import("@remotion/bundler");
    const { renderMedia, selectComposition } = await import("@remotion/renderer");

    progress("remotion_rendering", 35);

    const bundleLocation = await bundle({
      entryPoint: path.join(ROOT, "src", "remotion", "index.ts"),
      webpackOverride: (config) => ({
        ...config,
        resolve: {
          ...config.resolve,
          alias: {
            ...(config.resolve?.alias || {}),
            "@": path.join(ROOT, "src"),
          },
        },
      }),
    });

    progress("remotion_rendering", 50);

    const comp = await selectComposition({
      serveUrl: bundleLocation,
      id: "ScriptVideo",
      inputProps: { composition: localComp },
    });

    progress("remotion_rendering", 55);

    await renderMedia({
      composition: comp,
      serveUrl: bundleLocation,
      codec: "h264",
      outputLocation: finalOutput,
      inputProps: { composition: localComp },
      overwrite: true,
      chromiumOptions: {
        ignoreCertificateErrors: true,
      },
      onProgress: ({ progress: p }) => {
        progress("remotion_rendering", Math.round(55 + p * 40));
      },
    });

    progress("remotion_rendering", 95);
  } catch (err) {
    console.error("Remotion rendering failed:", err.message);
    throw err;
  }

  // Shutdown asset server
  assetServer.close();

  // Cleanup job directory
  await fs.rm(jobDir, { recursive: true, force: true }).catch(() => {});

  progress("complete", 100);
}

main().then(() => {
  process.exit(0);
}).catch((err) => {
  console.error("Render failed:", err);
  progress("error", 0);
  process.exit(1);
});
