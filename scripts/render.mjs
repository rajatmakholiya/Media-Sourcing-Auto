#!/usr/bin/env node
// scripts/render.mjs
// Standalone render script — spawned as a child process by the API route
// Downloads assets, serves them locally, renders with Remotion

import fs from "fs/promises";
import { existsSync, createReadStream } from "fs";
import path from "path";
import http from "http";
import { fileURLToPath } from "url";

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
  const assetMap = new Map(); // segment_id -> { localFile, originalType }

  for (let i = 0; i < composition.segments.length; i++) {
    const seg = composition.segments[i];

    try {
      if (seg.media.url && seg.media.url.startsWith("http")) {
        const resp = await fetch(seg.media.url, {
          headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
          redirect: "follow",
        });

        const contentType = resp.headers.get("content-type") || "";
        const isMedia = contentType.startsWith("image/") || contentType.startsWith("video/");

        if (resp.ok && isMedia) {
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
            console.error(`[download] Segment ${seg.id}: OK (${(buffer.length / 1024).toFixed(0)}KB, ${ext})`);
          } else {
            console.error(`[download] Segment ${seg.id}: File too small, skipping`);
          }
        } else {
          console.error(`[download] Segment ${seg.id}: Failed (status ${resp.status}, type: ${contentType})`);
        }
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
