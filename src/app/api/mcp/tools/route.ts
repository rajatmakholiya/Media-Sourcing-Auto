// src/app/api/mcp/tools/route.ts
// Lists all available MCP tools for Claude
import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    tools: [
      {
        name: "get_script",
        description:
          "Retrieve the current script submitted by the user for segmentation. Returns the full script text, word count, and segmentation instructions.",
        inputSchema: {
          type: "object",
          properties: {},
          required: [],
        },
      },
      {
        name: "submit_segments",
        description:
          "Submit the segmented script back to the pipeline. Each segment needs: id (number), text (string), keyword (string — a concrete visual noun for media search), fallback_from_previous (boolean — true if keyword was borrowed from previous segment), word_count (number), estimated_duration_sec (number at ~2.5 words/sec speaking rate).",
        inputSchema: {
          type: "object",
          properties: {
            segments: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  id: { type: "number" },
                  text: { type: "string" },
                  keyword: { type: "string" },
                  fallback_from_previous: { type: "boolean" },
                  word_count: { type: "number" },
                  estimated_duration_sec: { type: "number" },
                },
                required: [
                  "id",
                  "text",
                  "keyword",
                  "word_count",
                  "estimated_duration_sec",
                ],
              },
            },
            total_duration_sec: { type: "number" },
            segment_count: { type: "number" },
          },
          required: ["segments", "total_duration_sec", "segment_count"],
        },
      },
      {
        name: "get_pipeline_status",
        description:
          "Check the current pipeline status. Returns the current step, whether a script is pending, and segment counts.",
        inputSchema: {
          type: "object",
          properties: {},
          required: [],
        },
      },
    ],
  });
}