// src/app/api/mcp/tools/[toolName]/route.ts
// Executes individual MCP tools when Claude calls them
import { NextRequest, NextResponse } from "next/server";
import {
  getScript,
  getState,
  submitSegments,
} from "@/lib/pipeline-store";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ toolName: string }> }
) {
  const { toolName } = await params;

  let input: Record<string, unknown> = {};
  try {
    input = await req.json();
  } catch {
    // Some tools have no input — that's fine
  }

  const sessionId = req.headers.get("x-session-id") || "__default__";

  switch (toolName) {
    case "get_script": {
      const script = getScript(sessionId);
      if (!script) {
        return NextResponse.json({
          result:
            "No script has been submitted yet. Ask the user to paste a script in the web app first.",
        });
      }
      return NextResponse.json({
        result: JSON.stringify({
          script,
          wordCount: script.split(/\s+/).length,
          instructions: [
            "Segment this script into 2-4 second spoken chunks.",
            "Each segment should be 5-12 words, split at natural pauses (punctuation, conjunctions, dashes).",
            "Extract one concrete, visual keyword per segment for media search.",
            "If no strong visual keyword exists, reuse the previous segment's keyword and set fallback_from_previous to true.",
            "Estimate spoken duration at 2.5 words per second.",
            "Call submit_segments with the result.",
          ],
        }),
      });
    }

    case "submit_segments": {
      const segments = input.segments as Array<Record<string, unknown>>;
      if (!segments || !Array.isArray(segments)) {
        return NextResponse.json({ result: "Error: segments must be an array" });
      }

      submitSegments({
        segments: segments.map((s) => ({
          id: Number(s.id),
          text: String(s.text),
          keyword: String(s.keyword),
          image_query: String(s.image_query || s.keyword),
          video_query: String(s.video_query || s.keyword),
          fallback_from_previous: Boolean(s.fallback_from_previous),
          word_count: Number(s.word_count),
          estimated_duration_sec: Number(s.estimated_duration_sec),
        })),
        total_duration_sec: Number(input.total_duration_sec),
        segment_count: Number(input.segment_count),
      }, sessionId);

      return NextResponse.json({
        result: `Successfully submitted ${input.segment_count} segments (${input.total_duration_sec}s total). The user can now see and edit them in the web app.`,
      });
    }

    case "get_pipeline_status": {
      const state = getState(sessionId);
      return NextResponse.json({
        result: JSON.stringify({
          pipelineStep: state.pipelineStep,
          hasScript: !!state.currentScript,
          hasSegments: !!state.segments,
          segmentCount: state.segments?.segment_count || 0,
        }),
      });
    }

    default:
      return NextResponse.json(
        { result: `Unknown tool: ${toolName}` },
        { status: 404 }
      );
  }
}