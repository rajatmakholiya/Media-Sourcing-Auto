// src/app/api/export/route.ts
// NO Remotion imports here — rendering happens in a child process
import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import path from "path";
import fs from "fs/promises";
import type { VideoComposition } from "@/lib/remotion-config";

type ExportJob = {
  id: string;
  status: "queued" | "downloading" | "preparing" | "remotion_rendering" | "complete" | "error";
  progress: number;
  output_url?: string;
  error?: string;
  created_at: string;
};

const jobs = new Map<string, ExportJob>();

// Ensure output dirs exist
const TMP_DIR = path.join(process.cwd(), "tmp", "exports");
const OUTPUT_DIR = path.join(process.cwd(), "tmp", "outputs");

async function ensureDirs() {
  await fs.mkdir(TMP_DIR, { recursive: true }).catch(() => {});
  await fs.mkdir(OUTPUT_DIR, { recursive: true }).catch(() => {});
}

export async function POST(req: NextRequest) {
  try {
    const { composition } = await req.json() as { composition: VideoComposition };

    await ensureDirs();

    const jobId = `export-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const job: ExportJob = {
      id: jobId,
      status: "queued",
      progress: 0,
      created_at: new Date().toISOString(),
    };
    jobs.set(jobId, job);

    // Write composition to a temp file for the render script to read
    const compPath = path.join(TMP_DIR, `${jobId}-composition.json`);
    await fs.writeFile(compPath, JSON.stringify(composition, null, 2));

    // Check if the render script exists
    // Use dynamic path construction to prevent Turbopack from resolving at build time
    const scriptsDir = [process.cwd(), "scripts"].join(path.sep);
    const renderScript = path.join(scriptsDir, "render.mjs");
    let hasRenderScript = false;
    try {
      await fs.access(renderScript);
      hasRenderScript = true;
    } catch {
      hasRenderScript = false;
    }

    if (hasRenderScript) {
      // Spawn a separate Node.js process for rendering
      // This avoids Next.js trying to bundle Remotion
      const child = spawn("node", [renderScript, compPath, jobId, OUTPUT_DIR], {
        cwd: process.cwd(),
        stdio: ["ignore", "pipe", "pipe"],
      });

      child.stdout.on("data", (data: Buffer) => {
        const line = data.toString().trim();
        // Parse progress updates from the render script
        // Format: PROGRESS:stage:percentage
        if (line.startsWith("PROGRESS:")) {
          const parts = line.split(":");
          const stage = parts[1];
          const pct = parseInt(parts[2], 10);
          const j = jobs.get(jobId);
          if (j) {
            j.status = stage as ExportJob["status"];
            j.progress = pct;
            jobs.set(jobId, j);
          }
        }
      });

      child.stderr.on("data", (data: Buffer) => {
        console.error(`[render ${jobId}]`, data.toString());
      });

      child.on("close", async (code) => {
        const j = jobs.get(jobId);
        if (!j) return;

        if (code === 0) {
          j.status = "complete";
          j.progress = 100;
          j.output_url = `/api/export/download?job_id=${jobId}`;
        } else {
          j.status = "error";
          j.error = `Render process exited with code ${code}`;
        }
        jobs.set(jobId, j);

        // Cleanup composition file
        await fs.unlink(compPath).catch(() => {});
      });
    } else {
      // No render script — run simulated pipeline
      simulatedPipeline(jobId);
    }

    return NextResponse.json({
      job_id: jobId,
      status: "queued",
      rendering_mode: hasRenderScript ? "production" : "simulated",
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Export failed" },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  const jobId = req.nextUrl.searchParams.get("job_id");
  if (!jobId) return NextResponse.json({ error: "job_id required" }, { status: 400 });
  const job = jobs.get(jobId);
  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });
  return NextResponse.json(job);
}

async function simulatedPipeline(jobId: string) {
  const stages: { status: ExportJob["status"]; duration: number; progressEnd: number }[] = [
    { status: "downloading", duration: 2000, progressEnd: 20 },
    { status: "preparing", duration: 2000, progressEnd: 30 },
    { status: "remotion_rendering", duration: 5000, progressEnd: 100 },
  ];

  for (const stage of stages) {
    const job = jobs.get(jobId);
    if (!job) return;
    job.status = stage.status;
    jobs.set(jobId, job);

    const startProgress = job.progress;
    const steps = 5;
    for (let i = 0; i < steps; i++) {
      await new Promise((r) => setTimeout(r, stage.duration / steps));
      const j = jobs.get(jobId);
      if (j) {
        j.progress = Math.round(startProgress + ((stage.progressEnd - startProgress) / steps) * (i + 1));
        jobs.set(jobId, j);
      }
    }
  }

  const job = jobs.get(jobId);
  if (job) {
    job.status = "complete";
    job.progress = 100;
    job.output_url = `/api/export/download?job_id=${jobId}`;
    jobs.set(jobId, job);
  }
}