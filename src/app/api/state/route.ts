// src/app/api/state/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getState } from "@/lib/pipeline-store";

export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get("session") || "__default__";
  const state = getState(sessionId);

  return NextResponse.json({
    pipelineStep: state.pipelineStep,
    hasScript: !!state.currentScript,
    wordCount: state.currentScript?.split(/\s+/).length || 0,
    segments: state.segments,
    editedSegments: state.editedSegments,
  });
}
