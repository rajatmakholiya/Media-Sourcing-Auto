// src/app/api/export/download/route.ts
import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import { existsSync } from "fs";
import path from "path";

export async function GET(req: NextRequest) {
  const jobId = req.nextUrl.searchParams.get("job_id");
  if (!jobId) {
    return NextResponse.json({ error: "job_id required" }, { status: 400 });
  }

  // Sanitize job ID to prevent path traversal
  const safeJobId = jobId.replace(/[^a-zA-Z0-9\-_]/g, "");
  const outputPath = path.join(process.cwd(), "tmp", "outputs", `${safeJobId}.mp4`);

  if (existsSync(outputPath)) {
    try {
      const fileBuffer = await fs.readFile(outputPath);
      return new NextResponse(fileBuffer, {
        headers: {
          "Content-Type": "video/mp4",
          "Content-Disposition": `attachment; filename="scriptvideo-${safeJobId}.mp4"`,
          "Content-Length": String(fileBuffer.length),
        },
      });
    } catch {
      return NextResponse.json({ error: "Failed to read video file" }, { status: 500 });
    }
  }

  // No real file — simulated mode placeholder
  return NextResponse.json(
    {
      message: "Video export simulation complete",
      job_id: safeJobId,
      status: "simulated",
      note: "Render script (scripts/render.mjs) is required for actual video rendering.",
    },
    { status: 200 }
  );
}
