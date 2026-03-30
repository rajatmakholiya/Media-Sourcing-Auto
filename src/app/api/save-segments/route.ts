// src/app/api/save-segments/route.ts
import { NextRequest, NextResponse } from "next/server";
import { saveEditedSegments } from "@/lib/pipeline-store";

export async function POST(req: NextRequest) {
  try {
    const { segments, total_duration_sec, segment_count } = await req.json();

    if (!segments || !Array.isArray(segments) || segments.length === 0) {
      return NextResponse.json(
        { error: "Segments array is required" },
        { status: 400 }
      );
    }

    const sessionId = req.headers.get("x-session-id") || "__default__";
    saveEditedSegments({ segments, total_duration_sec, segment_count }, sessionId);

    return NextResponse.json({ status: "saved" });
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 }
    );
  }
}